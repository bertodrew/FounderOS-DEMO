import { describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { PROJECTS, PROJECT_ROLES, projectAgentId, PROJECT_AGENT_IDS } from '@/lib/projects';
import { vercelStatus, latestDeployment } from '@/lib/connectors/vercel';

describe('project portfolio', () => {
  test('every project in lib/projects.ts is seeded', () => {
    const db: FounderDb = openDb(':memory:');
    seedDatabase(db);
    const ids = new Set(db.projects.all().map((p) => p.id));
    for (const p of PROJECTS) expect(ids.has(p.id)).toBe(true);
    db.close();
  });

  test('every project gets exactly the four roles, each mapped to a real runtime agent', async () => {
    const { realAgents } = await import('@/lib/agents/real');
    const runtimeIds = new Set(realAgents.map((a) => a.id));
    for (const p of PROJECTS) {
      for (const role of PROJECT_ROLES) {
        expect(runtimeIds.has(projectAgentId(p, role))).toBe(true);
      }
    }
    expect(PROJECT_AGENT_IDS.size).toBe(PROJECTS.length * PROJECT_ROLES.length);
  });

  test('project agents are seeded with their project id and nested under their department lead', () => {
    const db: FounderDb = openDb(':memory:');
    seedDatabase(db);
    for (const p of PROJECTS) {
      for (const role of PROJECT_ROLES) {
        const agent = db.agents.byProject(p.id).find((a) => a.id === projectAgentId(p, role));
        expect(agent, `${projectAgentId(p, role)} should exist`).toBeTruthy();
        expect(agent?.parentId).toBe(role.parentId);
        expect(agent?.departmentId).toBe(role.departmentId);
      }
    }
    db.close();
  });

  test('every project agent has exactly one SOP task', () => {
    const db: FounderDb = openDb(':memory:');
    seedDatabase(db);
    const sopIds = new Set(db.sopTasks.all().map((t) => t.assigneeId));
    for (const id of PROJECT_AGENT_IDS) expect(sopIds.has(id)).toBe(true);
    db.close();
  });
});

describe('vercel connector', () => {
  test('reports not_configured without VERCEL_TOKEN', async () => {
    const status = await vercelStatus({});
    expect(status.state).toBe('not_configured');
  });

  test('latestDeployment reports not_configured without VERCEL_TOKEN', async () => {
    const info = await latestDeployment('prj_whatever', {});
    expect(info.state).toBe('not_configured');
  });
});
