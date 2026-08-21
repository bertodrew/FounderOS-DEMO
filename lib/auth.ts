/**
 * Operator access gate.
 *
 * The demo is meant to stay browsable with zero setup, so READS are always
 * open. WRITES are the dangerous surface: they spend LLM credits, write
 * credentials to disk, and mutate the store. The rule is fail-closed in
 * production:
 *
 *   - FOUNDER_OS_TOKEN set   -> every write must present that token.
 *   - unset, not production  -> writes stay open (local dev, `npm run dev`).
 *   - unset, production      -> writes are DISABLED (503), never open.
 *
 * Webhooks carry their own shared secret and are gated in their own handler.
 * This module is imported by `middleware.ts`, so it must stay edge-safe:
 * no node builtins, no filesystem, no `process` beyond what is passed in.
 */

export type AuthEnv = Record<string, string | undefined>;

export type Decision = { ok: true } | { ok: false; status: number; error: string };

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Paths that answer unauthenticated regardless of method. */
const OPEN_PREFIXES = [
  '/api/webhooks/', // machine-to-machine, gated by its own shared secret
  '/api/health', // platform liveness probes must not need a credential
];

export function isMutating(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

export function isProduction(env: AuthEnv): boolean {
  return env.NODE_ENV === 'production';
}

export function operatorToken(env: AuthEnv): string | undefined {
  const raw = env.FOUNDER_OS_TOKEN?.trim();
  return raw ? raw : undefined;
}

/** Constant-time string compare. An empty string is never a valid secret. */
export function timingSafeEquals(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** `Authorization: Bearer …`, `x-founder-os-token`, or the session cookie. */
export function presentedToken(headers: Headers): string | undefined {
  const auth = headers.get('authorization');
  if (auth) {
    const match = /^bearer\s+(.+)$/i.exec(auth.trim());
    if (match) return match[1].trim();
  }
  const header = headers.get('x-founder-os-token')?.trim();
  if (header) return header;
  const cookie = headers.get('cookie');
  if (cookie) {
    for (const part of cookie.split(';')) {
      const [name, ...rest] = part.split('=');
      if (name?.trim() === 'founder_os_token') {
        const value = rest.join('=').trim();
        if (value) return value;
      }
    }
  }
  return undefined;
}

export type AccessRequest = { method: string; pathname: string; headers: Headers };

export function checkAccess(req: AccessRequest, env: AuthEnv): Decision {
  if (OPEN_PREFIXES.some((p) => req.pathname.startsWith(p))) return { ok: true };
  if (!isMutating(req.method)) return { ok: true };

  const expected = operatorToken(env);
  if (!expected) {
    if (!isProduction(env)) return { ok: true };
    return {
      ok: false,
      status: 503,
      error:
        'Writes are disabled: set FOUNDER_OS_TOKEN in the deployment environment to enable them.',
    };
  }

  const presented = presentedToken(req.headers);
  if (presented && timingSafeEquals(presented, expected)) return { ok: true };
  return { ok: false, status: 401, error: 'Operator token required for this request.' };
}
