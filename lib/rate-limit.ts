/**
 * Fixed-window rate limiter for the write surface.
 *
 * Scope, honestly stated: this is per-process, in-memory state. On a single
 * container (Railway, a VM, `npm start`) it is a real limit. On a horizontally
 * scaled or serverless host each instance keeps its own counter, so the
 * effective limit is `limit x instances` — enough to stop a naive script from
 * draining an LLM budget, not a substitute for an edge WAF or a shared store.
 * Swap the store for Redis/Upstash when there is more than one instance.
 *
 * Imported by `middleware.ts`, so it must stay edge-safe: no node builtins.
 */

export type RateLimitConfig = { limit: number; windowMs: number };

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

type Bucket = { count: number; resetAt: number };

/** Sweep expired buckets every N checks so a key-per-IP map cannot grow forever. */
const SWEEP_EVERY = 64;

export function createRateLimiter(opts: RateLimitConfig & { now?: () => number }) {
  const { limit, windowMs } = opts;
  const now = opts.now ?? Date.now;
  const buckets = new Map<string, Bucket>();
  let sinceSweep = 0;

  function sweep(at: number): void {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= at) buckets.delete(key);
    }
  }

  return {
    check(key: string): RateLimitResult {
      const at = now();
      sinceSweep += 1;
      if (sinceSweep >= SWEEP_EVERY) {
        sinceSweep = 0;
        sweep(at);
      }

      const existing = buckets.get(key);
      const bucket =
        existing && existing.resetAt > at ? existing : { count: 0, resetAt: at + windowMs };
      bucket.count += 1;
      buckets.set(key, bucket);

      const allowed = bucket.count <= limit;
      return {
        allowed,
        remaining: Math.max(0, limit - bucket.count),
        // Always round UP so a denied caller is never told to retry in 0s.
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - at) / 1000)),
      };
    },
    size(): number {
      return buckets.size;
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

/**
 * Cost classes. An LLM call or a PDF shell-out is worth orders of magnitude
 * more than a tag write, so they get their own tighter budget.
 */
const EXPENSIVE: RateLimitConfig = { limit: 10, windowMs: 60_000 };
const UPLOAD: RateLimitConfig = { limit: 5, windowMs: 60_000 };
const WRITE: RateLimitConfig = { limit: 60, windowMs: 60_000 };

/** Matched against the pathname of a MUTATING request only. */
const RULES: { test: (path: string) => boolean; config: RateLimitConfig }[] = [
  { test: (p) => /^\/api\/agents\/[^/]+\/(chat|run)$/.test(p), config: EXPENSIVE },
  { test: (p) => p === '/api/agents/broadcast' || p === '/api/agents/work', config: EXPENSIVE },
  { test: (p) => p === '/api/brain/dump' || p === '/api/social/sync', config: EXPENSIVE },
  { test: (p) => p === '/api/comms/reply' || p === '/api/social/dm/reply', config: EXPENSIVE },
  { test: (p) => p === '/api/finances/bank-statement' || p === '/api/finances/statements', config: UPLOAD },
  { test: (p) => p.startsWith('/api/'), config: WRITE },
];

export function limitFor(pathname: string): RateLimitConfig | null {
  if (pathname === '/api/health') return null;
  return RULES.find((r) => r.test(pathname))?.config ?? null;
}
