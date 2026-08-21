/**
 * GitHub connector — validates a personal access token against the real API
 * (GET /user) so "connected" always means the token actually authenticates,
 * never a fake status from mere presence.
 */
import type { ConnectorStatus } from '@/lib/connectors/types';

const KEY = 'GITHUB_TOKEN';

export async function githubStatus(
  env: Record<string, string | undefined> = process.env,
): Promise<ConnectorStatus> {
  const base = { id: 'github', name: 'GitHub', kind: 'developer' } as const;
  const token = env[KEY];
  if (!token) {
    return {
      ...base,
      state: 'not_configured',
      detail: 'Set GITHUB_TOKEN (a personal access token with repo/read scope) in .env.local.',
    };
  }
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const user = (await res.json()) as { login?: string; public_repos?: number };
    return {
      ...base,
      state: 'connected',
      detail: `Authenticated as ${user.login ?? 'unknown'} · ${user.public_repos ?? 0} public repos`,
      meta: { login: user.login ?? '', publicRepos: user.public_repos ?? 0 },
    };
  } catch (err) {
    return {
      ...base,
      state: 'error',
      detail: `Token found but validation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
