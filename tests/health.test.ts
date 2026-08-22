import { beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

beforeAll(() => {
  process.env.FOUNDER_OS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'founder-os-health-')), 'test.db');
});

async function health() {
  const { GET } = await import('@/app/api/health/route');
  const res = await GET();
  return { res, body: await res.json() };
}

describe('GET /api/health', () => {
  test('reports a reachable, seeded database', async () => {
    const { res, body } = await health();
    expect(res.status).toBe(200);
    expect(body.checks.database).toEqual({ reachable: true, seeded: true });
    expect(typeof body.uptimeSeconds).toBe('number');
  });

  test('degrades — not "ok" — when the store cannot survive a restart', async () => {
    const { body } = await health();
    // The test db lives under the system temp dir, which is exactly the
    // data-losing shape this check exists to make visible.
    expect(body.checks.storage.durable).toBe(false);
    expect(body.status).toBe('degraded');
    expect(body.warnings.join(' ')).toMatch(/not durable/);
  });

  test('never leaks a credential value', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_should_never_appear';
    process.env.AUTH_PASSWORD = 'pw_should_never_appear';
    process.env.AUTH_SECRET = 'secret_should_never_appear';
    const { body } = await health();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('sk_live_should_never_appear');
    expect(serialized).not.toContain('pw_should_never_appear');
    expect(serialized).not.toContain('secret_should_never_appear');
    // It reports THAT the app is gated, never the credentials themselves.
    expect(body.checks.auth.gated).toBe(true);
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.AUTH_PASSWORD;
    delete process.env.AUTH_SECRET;
  });
});
