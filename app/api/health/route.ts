import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { describeStorage } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // better-sqlite3 is native — keep off the edge runtime

/**
 * Liveness + readiness probe. Reachable unauthenticated (platform health checks
 * cannot carry the operator token), so it reports posture, never secrets: no
 * credential values, no paths outside the store, no stack traces.
 *
 * `status` is "degraded" rather than "ok" when the deployment is configured in a
 * way that silently loses user work or leaves the app ungated. That is
 * deliberate: a green health check on a data-losing deploy is worse than none.
 */
export async function GET(): Promise<Response> {
  const startedAt = Date.now();
  const storage = describeStorage(process.env);

  let dbReachable = false;
  let seeded = false;
  try {
    seeded = getDb().departments.all().length > 0;
    dbReachable = true;
  } catch {
    dbReachable = false;
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const authGated = Boolean(process.env.AUTH_PASSWORD && process.env.AUTH_SECRET);

  const warnings: string[] = [];
  if (!storage.durable) warnings.push(`storage is not durable: ${storage.reason}`);
  if (isProduction && !authGated) {
    warnings.push('AUTH_PASSWORD/AUTH_SECRET unset: the app is failing closed, nothing is reachable');
  }

  const status = !dbReachable ? 'error' : warnings.length > 0 ? 'degraded' : 'ok';

  return NextResponse.json(
    {
      status,
      uptimeSeconds: Math.round(process.uptime()),
      environment: process.env.NODE_ENV ?? 'development',
      checks: {
        database: { reachable: dbReachable, seeded },
        storage: { durable: storage.durable, ephemeral: storage.ephemeral, reason: storage.reason },
        auth: { gated: authGated, enforced: isProduction },
      },
      warnings,
      latencyMs: Date.now() - startedAt,
    },
    { status: dbReachable ? 200 : 503 },
  );
}
