import { beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Route handlers read the DB path from FOUNDER_OS_DB at first access, so the
// env var must be set before any handler module is imported.
beforeAll(() => {
  process.env.FOUNDER_OS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'founder-os-profiles-test-')), 'test.db');
});

describe('profiles CRUD (/api/profiles)', () => {
  test('GET lists the two seeded example profiles', async () => {
    const { GET } = await import('@/app/api/profiles/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profiles.map((p: { id: string }) => p.id)).toEqual(['vantage', 'launchpad-cohort']);
  });

  test('POST creates a profile with a slugified id, defaults, and no collision', async () => {
    const { POST, GET } = await import('@/app/api/profiles/route');
    const res = await POST(
      new Request('http://test/api/profiles', { method: 'POST', body: JSON.stringify({ name: 'Factory Floor' }) }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.profile.id).toBe('factory-floor');
    expect(body.profile.name).toBe('Factory Floor');
    expect(body.profile.focus).toEqual([]);
    expect(body.profile.areaAgents).toEqual({});

    const list = await (await GET()).json();
    expect(list.profiles.map((p: { id: string }) => p.id)).toContain('factory-floor');
  });

  test('POST de-duplicates ids for two profiles with the same name', async () => {
    const { POST } = await import('@/app/api/profiles/route');
    const post = () =>
      POST(new Request('http://test/api/profiles', { method: 'POST', body: JSON.stringify({ name: 'TechLounges' }) }));
    const first = await (await post()).json();
    const second = await (await post()).json();
    expect(first.profile.id).toBe('techlounges');
    expect(second.profile.id).toBe('techlounges-2');
  });

  test('POST rejects an empty name', async () => {
    const { POST } = await import('@/app/api/profiles/route');
    const res = await POST(new Request('http://test/api/profiles', { method: 'POST', body: JSON.stringify({ name: '' }) }));
    expect(res.status).toBe(400);
  });

  test('DELETE removes a profile permanently — it does not come back on re-seed', async () => {
    const { POST, DELETE, GET } = await import('@/app/api/profiles/route');
    await POST(new Request('http://test/api/profiles', { method: 'POST', body: JSON.stringify({ name: 'AeroCharter' }) }));
    const del = await DELETE(
      new Request('http://test/api/profiles', { method: 'DELETE', body: JSON.stringify({ id: 'aerocharter' }) }),
    );
    expect(del.status).toBe(200);
    const list = await (await GET()).json();
    expect(list.profiles.map((p: { id: string }) => p.id)).not.toContain('aerocharter');

    // Re-seeding restores the two examples if missing but must never
    // resurrect a profile the user deleted.
    const { getDb } = await import('@/lib/data');
    const { seedDatabase } = await import('@/lib/seed');
    seedDatabase(getDb());
    const after = await (await GET()).json();
    expect(after.profiles.map((p: { id: string }) => p.id)).not.toContain('aerocharter');
  });
});
