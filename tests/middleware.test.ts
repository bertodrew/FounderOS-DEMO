import { afterEach, describe, expect, test } from 'vitest';
import { NextRequest } from 'next/server';
import { createSessionToken } from '@/lib/auth';
import { middleware } from '@/middleware';

const SECRET = 'test-secret';

function call(method: string, path: string, headers: Record<string, string> = {}) {
  return middleware(new NextRequest(`http://localhost${path}`, { method, headers }));
}

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

/** NODE_ENV is typed readonly, but the gate's whole contract is that it changes
 *  behaviour between dev and production, so the test has to set it. */
function setNodeEnv(value: string): void {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}

function configureAuth(): void {
  setNodeEnv('production');
  process.env.AUTH_SECRET = SECRET;
  process.env.AUTH_PASSWORD = 'hunter2';
}

describe('security headers', () => {
  test('stamped on every response', async () => {
    setNodeEnv('development');
    const res = await call('GET', '/agents');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  test('HSTS only behind TLS', async () => {
    setNodeEnv('development');
    expect((await call('GET', '/agents')).headers.get('Strict-Transport-Security')).toBeNull();
    const secured = await call('GET', '/agents', { 'x-forwarded-proto': 'https' });
    expect(secured.headers.get('Strict-Transport-Security')).toContain('max-age=');
  });

  test("stamped on the gate's own denials too", async () => {
    configureAuth();
    const res = await call('GET', '/api/agents');
    expect(res.status).toBe(401);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});

describe('session gate', () => {
  test('local dev stays open so the workflow needs no setup', async () => {
    setNodeEnv('development');
    expect((await call('GET', '/api/agents')).status).toBe(200);
  });

  test('production without a session redirects a page to /login', async () => {
    configureAuth();
    const res = await call('GET', '/org');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  test('production without a session refuses an API call', async () => {
    configureAuth();
    expect((await call('GET', '/api/agents')).status).toBe(401);
  });

  test('fails closed when the password is not configured', async () => {
    setNodeEnv('production');
    delete process.env.AUTH_SECRET;
    delete process.env.AUTH_PASSWORD;
    const res = await call('GET', '/api/agents');
    expect(res.status).toBe(503);
  });

  test('a valid session cookie passes', async () => {
    configureAuth();
    const token = await createSessionToken(SECRET);
    const res = await call('GET', '/api/agents', { cookie: `founderos_session=${token}` });
    expect(res.status).toBe(200);
  });
});

describe('public paths', () => {
  test('the health check answers unauthenticated — a gated probe fails every deploy', async () => {
    configureAuth();
    expect((await call('GET', '/api/health')).status).toBe(200);
  });

  test('login and webhooks stay reachable without a session', async () => {
    configureAuth();
    expect((await call('GET', '/login')).status).toBe(200);
    expect((await call('POST', '/api/auth/login')).status).toBe(200);
    expect((await call('POST', '/api/webhooks/manychat')).status).toBe(200);
  });
});

describe('rate limit', () => {
  test('meters the expensive LLM surface and answers 429 with Retry-After', async () => {
    setNodeEnv('development');
    const headers = { 'x-forwarded-for': '203.0.113.42' };
    const statuses: number[] = [];
    for (let i = 0; i < 14; i += 1) {
      statuses.push((await call('POST', '/api/agents/data-agent/chat', headers)).status);
    }
    expect(statuses.filter((s) => s === 200).length).toBe(10);
    const denied = await call('POST', '/api/agents/data-agent/chat', headers);
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  test('meters the webhooks, which the session gate exempts entirely', async () => {
    setNodeEnv('production');
    const headers = { 'x-forwarded-for': '198.51.100.23' };
    const statuses: number[] = [];
    for (let i = 0; i < 70; i += 1) {
      statuses.push((await call('POST', '/api/webhooks/manychat', headers)).status);
    }
    expect(statuses).toContain(429);
  });

  test('reads are never metered', async () => {
    setNodeEnv('development');
    for (let i = 0; i < 80; i += 1) {
      expect((await call('GET', '/api/agents', { 'x-forwarded-for': '203.0.113.99' })).status).toBe(200);
    }
  });
});
