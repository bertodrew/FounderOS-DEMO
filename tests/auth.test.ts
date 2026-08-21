import { describe, expect, test } from 'vitest';
import {
  checkAccess,
  isMutating,
  operatorToken,
  presentedToken,
  timingSafeEquals,
  type AuthEnv,
} from '@/lib/auth';

const TOKEN = 'op_live_abcdef0123456789';

function req(method: string, pathname: string, headers: Record<string, string> = {}) {
  return { method, pathname, headers: new Headers(headers) };
}

describe('isMutating', () => {
  test('reads are safe, writes are not', () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS', 'get']) expect(isMutating(m)).toBe(false);
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) expect(isMutating(m)).toBe(true);
  });
});

describe('timingSafeEquals', () => {
  test('compares by value and rejects length mismatches', () => {
    expect(timingSafeEquals('abc', 'abc')).toBe(true);
    expect(timingSafeEquals('abc', 'abd')).toBe(false);
    expect(timingSafeEquals('abc', 'abcd')).toBe(false);
    expect(timingSafeEquals('', '')).toBe(false); // empty is never a valid secret
  });
});

describe('operatorToken', () => {
  test('reads FOUNDER_OS_TOKEN and ignores blank values', () => {
    expect(operatorToken({ FOUNDER_OS_TOKEN: TOKEN })).toBe(TOKEN);
    expect(operatorToken({ FOUNDER_OS_TOKEN: '   ' })).toBeUndefined();
    expect(operatorToken({})).toBeUndefined();
  });
});

describe('presentedToken', () => {
  test('accepts a bearer header or the session cookie', () => {
    expect(presentedToken(new Headers({ authorization: `Bearer ${TOKEN}` }))).toBe(TOKEN);
    expect(presentedToken(new Headers({ authorization: `bearer ${TOKEN}` }))).toBe(TOKEN);
    expect(presentedToken(new Headers({ 'x-founder-os-token': TOKEN }))).toBe(TOKEN);
    expect(presentedToken(new Headers({ cookie: `theme=mono; founder_os_token=${TOKEN}` }))).toBe(TOKEN);
    expect(presentedToken(new Headers())).toBeUndefined();
  });
});

describe('checkAccess', () => {
  const dev: AuthEnv = { NODE_ENV: 'development' };
  const prodNoToken: AuthEnv = { NODE_ENV: 'production' };
  const prod: AuthEnv = { NODE_ENV: 'production', FOUNDER_OS_TOKEN: TOKEN };

  test('reads are always open — the demo stays browsable', () => {
    for (const env of [dev, prodNoToken, prod]) {
      expect(checkAccess(req('GET', '/api/agents'), env).ok).toBe(true);
      expect(checkAccess(req('GET', '/api/keys'), env).ok).toBe(true);
    }
  });

  test('local dev keeps writes open so the demo works with no setup', () => {
    expect(checkAccess(req('POST', '/api/agents/x/run'), dev).ok).toBe(true);
  });

  test('production without a token fails closed — writes are disabled, not open', () => {
    const d = checkAccess(req('POST', '/api/agents/x/run'), prodNoToken);
    expect(d.ok).toBe(false);
    expect(d.ok === false && d.status).toBe(503);
    expect(d.ok === false && d.error).toMatch(/FOUNDER_OS_TOKEN/);
  });

  test('production with a token requires that exact token', () => {
    expect(checkAccess(req('POST', '/api/keys'), prod).ok).toBe(false);
    expect(checkAccess(req('POST', '/api/keys', { authorization: 'Bearer wrong' }), prod).ok).toBe(false);
    const denied = checkAccess(req('POST', '/api/keys'), prod);
    expect(denied.ok === false && denied.status).toBe(401);
    expect(checkAccess(req('POST', '/api/keys', { authorization: `Bearer ${TOKEN}` }), prod).ok).toBe(true);
    expect(checkAccess(req('POST', '/api/keys', { cookie: `founder_os_token=${TOKEN}` }), prod).ok).toBe(true);
  });

  test('a configured token gates writes in development too', () => {
    const devToken: AuthEnv = { NODE_ENV: 'development', FOUNDER_OS_TOKEN: TOKEN };
    expect(checkAccess(req('POST', '/api/agents/x/run'), devToken).ok).toBe(false);
    expect(checkAccess(req('POST', '/api/agents/x/run', { authorization: `Bearer ${TOKEN}` }), devToken).ok).toBe(true);
  });

  test('webhooks carry their own shared secret and bypass the operator gate', () => {
    expect(checkAccess(req('POST', '/api/webhooks/manychat'), prodNoToken).ok).toBe(true);
    expect(checkAccess(req('POST', '/api/webhooks/manychat'), prod).ok).toBe(true);
  });

  test('the health check is reachable unauthenticated for platform probes', () => {
    expect(checkAccess(req('GET', '/api/health'), prodNoToken).ok).toBe(true);
  });

  test('never leaks the expected token in the denial message', () => {
    const d = checkAccess(req('POST', '/api/keys'), prod);
    expect(d.ok === false && d.error).not.toContain(TOKEN);
  });
});
