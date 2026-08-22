import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { readEnvLocal } from '@/lib/creds';

// The connect route's Gmail branch calls the real ImapFlow to validate
// credentials before saving — mocked so the test suite never dials out.
let imapShouldSucceed = true;
vi.mock('imapflow', () => ({
  ImapFlow: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockImplementation(() =>
      imapShouldSucceed ? Promise.resolve() : Promise.reject(new Error('Invalid credentials (Failure)')),
    ),
    logout: vi.fn().mockResolvedValue(undefined),
  })),
}));
const { POST, DELETE } = await import('@/app/api/connections/connect/route');

/** The connect flow writes ONLY to .env.local (gitignored) — never to
 *  Alex's canonical machine files, never into the repo. */
describe('POST /api/connections/connect', () => {
  let tmp: string;
  const prevOverride = process.env.FOUNDER_OS_ENV_LOCAL;

  beforeEach(() => {
    tmp = path.join(os.tmpdir(), `alex-connect-${process.pid}-${Math.random().toString(36).slice(2)}`);
    process.env.FOUNDER_OS_ENV_LOCAL = tmp;
  });
  afterEach(() => {
    if (prevOverride === undefined) delete process.env.FOUNDER_OS_ENV_LOCAL;
    else process.env.FOUNDER_OS_ENV_LOCAL = prevOverride;
    try { fs.unlinkSync(tmp); } catch {}
    imapShouldSucceed = true;
  });

  const post = (body: unknown) =>
    POST(new Request('http://test/api/connections/connect', { method: 'POST', body: JSON.stringify(body) }));

  test('saves allowed keys for a listed integration and reports keySaved without echoing values', async () => {
    const res = await post({ slug: 'notion', values: { NOTION_API_KEY: 'ntn_secret_123' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.keySaved).toBe(true);
    expect(JSON.stringify(body)).not.toContain('ntn_secret_123');
    expect(readEnvLocal().NOTION_API_KEY).toBe('ntn_secret_123');
  });

  test('a no-connector tile saves its generic key', async () => {
    const res = await post({ slug: 'discord', values: { DISCORD_API_KEY: 'dsc-1' } });
    expect(res.status).toBe(200);
    expect(readEnvLocal().DISCORD_API_KEY).toBe('dsc-1');
  });

  test('rejects unknown slugs, foreign keys, and unsafe values', async () => {
    expect((await post({ slug: 'not-a-tool', values: { X_API_KEY: 'v' } })).status).toBe(400);
    // a key that does not belong to this integration must never be written
    expect((await post({ slug: 'notion', values: { ATTIO_API_KEY: 'steal' } })).status).toBe(400);
    expect(readEnvLocal().ATTIO_API_KEY).toBeUndefined();
    expect((await post({ slug: 'notion', values: { NOTION_API_KEY: 'a\nb' } })).status).toBe(400);
    expect((await post({ slug: 'notion', values: {} })).status).toBe(400);
    // guidance-only tiles (whatsapp needs Full Disk Access, not a key) take no keys
    expect((await post({ slug: 'whatsapp', values: { WHATSAPP_API_KEY: 'x' } })).status).toBe(400);
  });

  test('Gmail: saves the IMAP fields once the credentials actually connect', async () => {
    const res = await post({
      slug: 'gmail',
      values: { INBOX_1_HOST: 'imap.gmail.com', INBOX_1_USER: 'a@b.c', INBOX_1_PASS: 'good-pass', INBOX_1_NAME: 'Main' },
    });
    expect(res.status).toBe(200);
    expect(readEnvLocal().INBOX_1_HOST).toBe('imap.gmail.com');
  });

  test('Gmail: rejects and saves nothing when the credentials fail to connect', async () => {
    imapShouldSucceed = false;
    const res = await post({
      slug: 'gmail',
      values: { INBOX_1_HOST: 'imap.gmail.com', INBOX_1_USER: 'a@b.c', INBOX_1_PASS: 'wrong-pass', INBOX_1_NAME: 'Main' },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid credentials/);
    expect(readEnvLocal().INBOX_1_HOST).toBeUndefined();
  });

  test('DELETE removes exactly the integration keys (disconnect)', async () => {
    await post({ slug: 'notion', values: { NOTION_API_KEY: 'k1' } });
    await post({ slug: 'discord', values: { DISCORD_API_KEY: 'k2' } });
    const res = await DELETE(
      new Request('http://test/api/connections/connect', { method: 'DELETE', body: JSON.stringify({ slug: 'notion' }) }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).keySaved).toBe(false);
    expect(readEnvLocal().NOTION_API_KEY).toBeUndefined();
    expect(readEnvLocal().DISCORD_API_KEY).toBe('k2');
  });
});
