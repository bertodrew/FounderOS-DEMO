import { afterEach, describe, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ZodError } from 'zod';
import { openDb, type FounderDb } from '@/lib/db';

/**
 * Two guarantees the store has to keep once it is serving production traffic:
 * the hot lookups are indexed, and a single corrupt row degrades or fails
 * loudly instead of taking down the whole query with a raw SyntaxError.
 */

const open: FounderDb[] = [];

afterEach(() => {
  while (open.length) open.pop()!.close();
});

/** A file-backed db so a second connection can write a row the repo layer
 *  would never produce. Tracked so afterEach closes it. */
function freshDb(): { db: FounderDb; dbPath: string } {
  const dbPath = path.join(mkdtempSync(path.join(tmpdir(), 'founder-os-resilience-')), 'test.db');
  const db = openDb(dbPath);
  open.push(db);
  return { db, dbPath };
}

/** Write a row straight past the repo layer and its Zod validation. */
function writeRaw(dbPath: string, sql: string, ...values: unknown[]): void {
  const raw = new Database(dbPath);
  raw.prepare(sql).run(...values);
  raw.close();
}

function seedDepartment(db: FounderDb): void {
  db.departments.insert({
    id: 'dept-1',
    name: 'Tech',
    slug: 'tech',
    tagline: 'Build',
    color: '#3b82f6',
    order: 1,
  });
}

describe('indexes', () => {
  test('every by-id lookup the app makes is backed by an index', () => {
    const { db, dbPath } = freshDb();
    expect(db.departments.all().length).toBeGreaterThanOrEqual(0);

    const raw = new Database(dbPath);
    const names = new Set(
      (raw.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[])
        .map((r) => r.name),
    );
    raw.close();

    for (const index of [
      'idx_agent_runs_agent_id',
      'idx_agent_messages_agent_id',
      'idx_agent_tasks_agent_id',
      'idx_agent_crons_agent_id',
      'idx_broadcast_replies_broadcast_id',
      'idx_funnel_touches_contact_id',
    ]) {
      expect(names.has(index), index).toBe(true);
    }
  });
});

describe('malformed JSON columns', () => {
  test('an unreadable tools column degrades to no tools, not a dead /agents page', () => {
    const { db, dbPath } = freshDb();
    seedDepartment(db);
    writeRaw(
      dbPath,
      `INSERT INTO agents (id, department_id, name, role, status, tier, description, model, tools, parent_id, instance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'agent-bad', 'dept-1', 'Bad Agent', 'role', 'active', 'specialist', '', 'model', '{not valid json}', null, 'builtin',
    );

    const agents = db.agents.all().filter((a) => a.id === 'agent-bad');
    expect(agents).toHaveLength(1);
    expect(agents[0].tools).toEqual([]);
  });

  test('an unreadable domains items column degrades to an empty list', () => {
    const { db, dbPath } = freshDb();
    writeRaw(dbPath, 'INSERT INTO domains (id, number, title, color, items) VALUES (?, ?, ?, ?, ?)',
      'dom-bad', 99, 'Domain', '#fff', '{bad json');
    expect(db.domains.all().find((d) => d.id === 'dom-bad')!.items).toEqual([]);
  });

  test('an unreadable phases items column degrades to an empty list', () => {
    const { db, dbPath } = freshDb();
    writeRaw(dbPath, 'INSERT INTO phases (id, number, title, items) VALUES (?, ?, ?, ?)',
      'phase-bad', 99, 'Phase', ']broken');
    expect(db.phases.all().find((p) => p.id === 'phase-bad')!.items).toEqual([]);
  });

  test('an empty column is treated the same as a malformed one', () => {
    // The DDL is NOT NULL, so empty string is the emptiest a column can get.
    const { db, dbPath } = freshDb();
    writeRaw(dbPath, 'INSERT INTO domains (id, number, title, color, items) VALUES (?, ?, ?, ?, ?)',
      'dom-empty', 98, 'Domain', '#fff', '');
    expect(db.domains.all().find((d) => d.id === 'dom-empty')!.items).toEqual([]);
  });

  test('valid JSON that is not an array degrades rather than reaching the schema', () => {
    const { db, dbPath } = freshDb();
    writeRaw(dbPath, 'INSERT INTO phases (id, number, title, items) VALUES (?, ?, ?, ?)',
      'phase-object', 97, 'Phase', '{"a":1}');
    expect(db.phases.all().find((p) => p.id === 'phase-object')!.items).toEqual([]);
  });

  test('where the schema requires content, bad data still fails LOUD — as designed', () => {
    // The repo's rule is that Zod validates on the way out and bad data fails
    // loud. PersonaSchema requires at least one pillar, so a corrupt personas
    // row must still throw. What the guard changes is HOW: a structured
    // ZodError naming the field, never a raw JSON SyntaxError.
    const { db, dbPath } = freshDb();
    writeRaw(
      dbPath,
      `INSERT INTO personas (id, ord, name, archetype, tagline, summary, accent, north_star, pillars, connectors, metrics, brain_use, signature_play)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'persona-bad', 99, 'Test', 'arch', 'tag', 'summary', '#fff', 'star', '{bad', '[broken', 'not json', 'use', 'play',
    );

    expect(() => db.personas.all()).toThrow(ZodError);
    try {
      db.personas.all();
    } catch (err) {
      expect(err).not.toBeInstanceOf(SyntaxError);
      expect(String(err)).not.toMatch(/Unexpected token/);
    }
  });
});

describe('the happy path is untouched', () => {
  test('agent tools round-trip unchanged', () => {
    const db = openDb(':memory:');
    open.push(db);
    seedDepartment(db);
    db.agents.insert({
      id: 'agent-1', departmentId: 'dept-1', name: 'Test Agent', role: 'Worker',
      status: 'active', tier: 'specialist', description: '', model: 'claude-opus',
      tools: ['tool-a', 'tool-b'], parentId: null, instance: 'builtin',
    });
    expect(db.agents.all()[0].tools).toEqual(['tool-a', 'tool-b']);
  });

  test('domain and phase item lists round-trip unchanged', () => {
    const db = openDb(':memory:');
    open.push(db);
    db.domains.insert({ id: 'dom-1', number: 1, title: 'Domain 1', color: '#fff', items: ['item-1', 'item-2'] });
    db.phases.insert({ id: 'phase-1', number: 1, title: 'Phase 1', items: ['step-1', 'step-2'] });
    expect(db.domains.all()[0].items).toEqual(['item-1', 'item-2']);
    expect(db.phases.all()[0].items).toEqual(['step-1', 'step-2']);
  });

  test('persona array fields round-trip unchanged', () => {
    const db = openDb(':memory:');
    open.push(db);
    db.personas.insert({
      id: 'persona-1', order: 1, name: 'Founder', archetype: 'Builder', tagline: 'Makes things',
      summary: 'Builds products', accent: '#3b82f6', northStar: 'Scale',
      pillars: [{ name: 'Engineering', focus: 'Build', agents: ['agent-1'] }],
      connectors: ['connector-1'], metrics: ['metric-1', 'metric-2', 'metric-3'],
      brainUse: 'heavy', signaturePlay: 'move fast',
    });
    const persona = db.personas.all().find((p) => p.id === 'persona-1')!;
    expect(persona.pillars[0].name).toBe('Engineering');
    expect(persona.connectors).toEqual(['connector-1']);
    expect(persona.metrics).toEqual(['metric-1', 'metric-2', 'metric-3']);
  });
});
