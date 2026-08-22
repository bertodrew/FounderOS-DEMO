/**
 * Vercel connector — validates VERCEL_TOKEN against the real API (GET /v2/user)
 * so "connected" always means the token actually authenticates, and exposes a
 * per-project deployment lookup for the portfolio board (app/projects).
 */
import type { ConnectorStatus } from '@/lib/connectors/types';

const KEY = 'VERCEL_TOKEN';

function authHeader(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

function teamQuery(env: Record<string, string | undefined>): string {
  return env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}` : '';
}

export async function vercelStatus(
  env: Record<string, string | undefined> = process.env,
): Promise<ConnectorStatus> {
  const base = { id: 'vercel', name: 'Vercel', kind: 'developer' } as const;
  const token = env[KEY];
  if (!token) {
    return {
      ...base,
      state: 'not_configured',
      detail: 'Set VERCEL_TOKEN (Account Settings → Tokens) in .env.local. Add VERCEL_TEAM_ID too if the projects live under a team.',
    };
  }
  try {
    const res = await fetch('https://api.vercel.com/v2/user', {
      headers: authHeader(token),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { user?: { username?: string } };
    return {
      ...base,
      state: 'connected',
      detail: `Authenticated as ${body.user?.username ?? 'unknown'}`,
      meta: { username: body.user?.username ?? '' },
    };
  } catch (err) {
    return {
      ...base,
      state: 'error',
      detail: `Token found but validation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export type VercelDeploymentInfo = {
  state: 'connected' | 'not_configured' | 'error';
  detail: string;
  url?: string;
  readyState?: string;
  createdAt?: string;
};

/** Latest deployment for one Vercel project — used by the portfolio board. */
export async function latestDeployment(
  vercelProjectId: string,
  env: Record<string, string | undefined> = process.env,
): Promise<VercelDeploymentInfo> {
  const token = env[KEY];
  if (!token) return { state: 'not_configured', detail: 'VERCEL_TOKEN not set' };
  try {
    const res = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(vercelProjectId)}&limit=1${teamQuery(env).replace('?', '&')}`,
      { headers: authHeader(token), signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as {
      deployments?: { url?: string; readyState?: string; createdAt?: number }[];
    };
    const d = body.deployments?.[0];
    if (!d) return { state: 'error', detail: 'No deployments found for this project yet' };
    return {
      state: 'connected',
      detail: `${d.readyState ?? 'unknown'} · ${d.url ?? ''}`,
      url: d.url,
      readyState: d.readyState,
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : undefined,
    };
  } catch (err) {
    return { state: 'error', detail: err instanceof Error ? err.message : String(err) };
  }
}
