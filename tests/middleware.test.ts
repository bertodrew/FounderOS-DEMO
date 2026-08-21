import { afterEach, describe, expect, test } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

const TOKEN = 'op_test_token_value';

function call(method: string, path: string, headers: Record<string, string> = {}) {
  return middleware(new NextRequest(`http://localhost${path}`, { method, headers }));
}

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

/** NODE_ENV is typed readonly, but the gate's whole contract is that it changes
 *  behaviour between dev and production — so the test has to set it. */
function setNodeEnv(value: string): void {
  Object.defineProperty(process.env, 'NODE_ENV', { value, configurable: true, writable: true });
}

describe('middleware security headers', () => {
  test('stamps hardening headers on every response', () => {
    const res = call('GET', '/agents');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  test('adds HSTS only behind TLS', () => {
    expect(call('GET', '/agents').headers.get('Strict-Transport-Security')).toBeNull();
    const secured = call('GET', '/agents', { 'x-forwarded-proto': 'https' });
    expect(secured.headers.get('Strict-Transport-Security')).toContain('max-age=');
  });

  test('denials are hardened too', () => {
    setNodeEnv('production');
    delete process.env.FOUNDER_OS_TOKEN;
    const res = call('POST', '/api/keys');
    expect(res.status).toBe(503);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});

describe('middleware operator gate', () => {
  test('reads pass through untouched', () => {
    setNodeEnv('production');
    process.env.FOUNDER_OS_TOKEN = TOKEN;
    expect(call('GET', '/api/agents').status).toBe(200);
  });

  test('an unauthenticated production write is refused', () => {
    setNodeEnv('production');
    process.env.FOUNDER_OS_TOKEN = TOKEN;
    expect(call('POST', '/api/keys').status).toBe(401);
  });

  test('the operator token unlocks writes', () => {
    setNodeEnv('production');
    process.env.FOUNDER_OS_TOKEN = TOKEN;
    expect(call('POST', '/api/keys', { authorization: `Bearer ${TOKEN}` }).status).toBe(200);
  });

  test('webhooks and health bypass the operator gate', () => {
    setNodeEnv('production');
    process.env.FOUNDER_OS_TOKEN = TOKEN;
    expect(call('POST', '/api/webhooks/manychat').status).toBe(200);
    expect(call('GET', '/api/health').status).toBe(200);
  });
});

describe('middleware rate limit', () => {
  test('meters the expensive LLM surface and answers 429 with Retry-After', () => {
    setNodeEnv('development');
    delete process.env.FOUNDER_OS_TOKEN;
    const headers = { 'x-forwarded-for': '203.0.113.42' };
    const statuses = Array.from({ length: 14 }, () =>
      call('POST', '/api/agents/data-agent/chat', headers).status,
    );
    expect(statuses.filter((s) => s === 200).length).toBe(10);
    const denied = call('POST', '/api/agents/data-agent/chat', headers);
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  test('a different caller keeps its own budget', () => {
    setNodeEnv('development');
    expect(call('POST', '/api/agents/data-agent/chat', { 'x-forwarded-for': '198.51.100.7' }).status).toBe(200);
  });

  test('reads are never metered', () => {
    setNodeEnv('development');
    for (let i = 0; i < 80; i += 1) {
      expect(call('GET', '/api/agents', { 'x-forwarded-for': '203.0.113.99' }).status).toBe(200);
    }
  });
});
