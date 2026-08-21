import os from 'node:os';
import path from 'node:path';

/**
 * Where the store actually lives, and whether writes to it survive a restart.
 *
 * This matters because the app writes real user work (agent runs, tasks, brain
 * dumps, queued posts, contact tags). On a serverless host the only writable
 * directory is the instance's tmpdir, which is wiped between cold starts and is
 * NOT shared between concurrent instances — so those writes silently vanish.
 * Rather than pretend otherwise, the app reports it: /api/health surfaces
 * `durable: false` so a deploy that would lose data is visible immediately.
 */

export type StorageInfo = {
  path: string;
  driver: 'sqlite';
  ephemeral: boolean;
  durable: boolean;
  reason: string;
};

export type StorageEnv = Record<string, string | undefined>;

export function resolveDbPath(env: StorageEnv): string {
  const explicit = env.FOUNDER_OS_DB;
  if (explicit) return explicit;
  // Vercel's deployment bundle (process.cwd()) is read-only at runtime; only
  // /tmp is writable there. VERCEL is set on every Vercel deployment.
  if (env.VERCEL) return path.join(os.tmpdir(), 'founder-os.db');
  return path.join(process.cwd(), 'data', 'founder-os.db');
}

function isUnderTmp(target: string): boolean {
  const tmp = path.resolve(os.tmpdir());
  const resolved = path.resolve(target);
  return resolved === tmp || resolved.startsWith(tmp + path.sep);
}

export function describeStorage(env: StorageEnv): StorageInfo {
  const dbPath = resolveDbPath(env);
  const base = { path: dbPath, driver: 'sqlite' as const };

  if (dbPath === ':memory:') {
    return { ...base, ephemeral: true, durable: false, reason: 'in-memory database: nothing is persisted' };
  }
  if (env.VERCEL) {
    return {
      ...base,
      ephemeral: true,
      durable: false,
      reason:
        'serverless instance tmpdir: writes are wiped on cold start and are not shared between instances — point FOUNDER_OS_DB at a mounted volume or move to a managed database',
    };
  }
  if (isUnderTmp(dbPath)) {
    return {
      ...base,
      ephemeral: true,
      durable: false,
      reason: 'database lives under the system temp dir and can be cleared at any time',
    };
  }
  return { ...base, ephemeral: false, durable: true, reason: 'file-backed database on local disk' };
}
