/**
 * Riona AI connector — talks to the companion riona-ai-agent service
 * (Express API, deployed separately as a long-running process; it can't run
 * on Vercel's serverless functions, same constraint as G-Brain/Optimal
 * Engine). Status is a cheap unauthenticated reachability check
 * (`GET /api/status`) — it never logs into Instagram just to paint a dot.
 * Actions (`rionaLogin`, `rionaInteract`) authenticate on demand and are
 * meant to be called explicitly, not on every dashboard poll.
 */
import type { ConnectorStatus } from '@/lib/connectors/types';

type RionaEnv = Record<string, string | undefined>;

function baseUrl(env: RionaEnv): string | undefined {
  return env.RIONA_BASE_URL?.replace(/\/+$/, '');
}

export async function rionaStatus(env: RionaEnv = process.env): Promise<ConnectorStatus> {
  const base = { id: 'riona', name: 'Riona AI', kind: 'social' } as const;
  const url = baseUrl(env);
  if (!url) {
    return {
      ...base,
      state: 'not_configured',
      detail: 'Set RIONA_BASE_URL to the deployed riona-ai-agent service (Railway, not Vercel).',
    };
  }
  try {
    const res = await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { dbConnected?: boolean };
    return {
      ...base,
      state: body.dbConnected ? 'connected' : 'error',
      detail: body.dbConnected
        ? 'Service reachable · MongoDB connected'
        : 'Service reachable but its MongoDB is not connected.',
    };
  } catch (err) {
    return {
      ...base,
      state: 'error',
      detail: `RIONA_BASE_URL set but unreachable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export type RionaSession = { cookie: string };

/** Logs into the Riona service's own Instagram session (JWT set as an
 *  httpOnly cookie) — required before any action endpoint. */
export async function rionaLogin(
  env: RionaEnv = process.env,
): Promise<{ ok: true; session: RionaSession } | { ok: false; error: string }> {
  const url = baseUrl(env);
  if (!url) return { ok: false, error: 'RIONA_BASE_URL not set' };
  const username = env.RIONA_IG_USERNAME;
  const password = env.RIONA_IG_PASSWORD;
  if (!username || !password) return { ok: false, error: 'RIONA_IG_USERNAME / RIONA_IG_PASSWORD not set' };
  try {
    const res = await fetch(`${url}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, error: `login failed: HTTP ${res.status}` };
    const setCookie = res.headers.get('set-cookie');
    const token = setCookie?.match(/token=([^;]+)/)?.[1];
    if (!token) return { ok: false, error: 'login succeeded but no session cookie was returned' };
    return { ok: true, session: { cookie: `token=${token}` } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Runs one interaction pass (like/comment on the configured feed) against
 *  the already-authenticated Instagram session. */
export async function rionaInteract(
  env: RionaEnv = process.env,
): Promise<{ ok: boolean; summary: string }> {
  const url = baseUrl(env);
  if (!url) return { ok: false, summary: 'RIONA_BASE_URL not set' };
  const login = await rionaLogin(env);
  if (!login.ok) return { ok: false, summary: login.error };
  try {
    const res = await fetch(`${url}/api/interact`, {
      method: 'POST',
      headers: { Cookie: login.session.cookie },
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return { ok: false, summary: `interact failed: HTTP ${res.status}` };
    return { ok: true, summary: 'Instagram interaction pass completed' };
  } catch (err) {
    return { ok: false, summary: err instanceof Error ? err.message : String(err) };
  }
}
