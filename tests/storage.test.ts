import { describe, expect, test } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { describeStorage, resolveDbPath } from '@/lib/storage';

describe('resolveDbPath', () => {
  test('an explicit FOUNDER_OS_DB always wins', () => {
    expect(resolveDbPath({ FOUNDER_OS_DB: '/srv/data/os.db', VERCEL: '1' })).toBe('/srv/data/os.db');
    expect(resolveDbPath({ FOUNDER_OS_DB: ':memory:' })).toBe(':memory:');
  });

  test('defaults to the repo data dir', () => {
    expect(resolveDbPath({})).toBe(path.join(process.cwd(), 'data', 'founder-os.db'));
  });

  test('falls back to the only writable dir on Vercel', () => {
    expect(resolveDbPath({ VERCEL: '1' })).toBe(path.join(os.tmpdir(), 'founder-os.db'));
  });
});

describe('describeStorage', () => {
  test('flags the Vercel tmpdir as ephemeral and says why', () => {
    const info = describeStorage({ VERCEL: '1' });
    expect(info.ephemeral).toBe(true);
    expect(info.reason).toMatch(/serverless|tmp/i);
    expect(info.durable).toBe(false);
  });

  test('flags an in-memory db as ephemeral', () => {
    expect(describeStorage({ FOUNDER_OS_DB: ':memory:' }).ephemeral).toBe(true);
  });

  test('flags any path under the system temp dir as ephemeral, however it was set', () => {
    const info = describeStorage({ FOUNDER_OS_DB: path.join(os.tmpdir(), 'nested', 'os.db') });
    expect(info.ephemeral).toBe(true);
  });

  test('a real disk path is durable', () => {
    const info = describeStorage({ FOUNDER_OS_DB: '/srv/data/os.db' });
    expect(info.ephemeral).toBe(false);
    expect(info.durable).toBe(true);
  });

  test('never echoes anything but the path — no credentials in the report', () => {
    const info = describeStorage({ FOUNDER_OS_DB: '/srv/data/os.db', STRIPE_SECRET_KEY: 'sk_live_x' });
    expect(JSON.stringify(info)).not.toContain('sk_live_x');
  });
});
