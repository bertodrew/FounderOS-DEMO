import { afterEach, describe, expect, test, vi } from 'vitest';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

describe('POST /api/auth/login', () => {
  afterEach(() => vi.unstubAllEnvs());

  const post = (body: unknown) =>
    import('@/app/api/auth/login/route').then(({ POST }) =>
      POST(new Request('http://test/api/auth/login', { method: 'POST', body: JSON.stringify(body) })),
    );

  test('503s when AUTH_PASSWORD/AUTH_SECRET are not configured', async () => {
    vi.stubEnv('AUTH_PASSWORD', '');
    vi.stubEnv('AUTH_SECRET', '');
    const res = await post({ password: 'anything' });
    expect(res.status).toBe(503);
  });

  test('401s on the wrong password and sets no cookie', async () => {
    vi.stubEnv('AUTH_PASSWORD', 'correct-horse');
    vi.stubEnv('AUTH_SECRET', 'sekret');
    const res = await post({ password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  test('200s on the right password and sets a verifiable session cookie', async () => {
    vi.stubEnv('AUTH_PASSWORD', 'correct-horse');
    vi.stubEnv('AUTH_SECRET', 'sekret');
    const res = await post({ password: 'correct-horse' });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toMatch(/HttpOnly/i);
    const token = setCookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];
    expect(await verifySessionToken(token, 'sekret')).toBe(true);
  });

  test('rejects a body with no password', async () => {
    vi.stubEnv('AUTH_PASSWORD', 'correct-horse');
    vi.stubEnv('AUTH_SECRET', 'sekret');
    expect((await post({})).status).toBe(400);
  });
});

describe('POST /api/auth/logout', () => {
  test('clears the session cookie', async () => {
    const { POST } = await import('@/app/api/auth/logout/route');
    const res = await POST();
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toMatch(/Max-Age=0/i);
  });
});
