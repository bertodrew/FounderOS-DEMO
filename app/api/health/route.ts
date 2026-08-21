import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { describeStorage } from '@/lib/storage';
import { operatorToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // better-sqlite3 is native — keep off the edge runtime

/**
 * Liveness + readiness probe. Reachable unauthenticated (platform health checks
 * cannot carry the operator token), so it reports posture, never secrets: no
 * credential values, no paths outside the store, no stack traces.
 *
 * `status` is "degraded" rather than "ok" when the deployment is configured in a
 * way that silently loses user work or leaves writes ungated. That is
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
  const writesGated = Boolean(operatorToken(process.env));

  const warnings: string[] = [];
  if (!storage.durable) warnings.push(`storage is not durable: ${storage.reason}`);
  if (isProduction && !writesGated) {
    warnings.push('FOUNDER_OS_TOKEN is unset: all write endpoints are disabled');
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
        writes: { gated: writesGated, enabled: writesGated || !isProduction },
      },
      warnings,
      latencyMs: Date.now() - startedAt,
    },
    { status: dbReachable ? 200 : 503 },
  );
}
