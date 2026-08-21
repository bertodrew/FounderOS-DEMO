import { NextResponse, type NextRequest } from 'next/server';
import { checkAccess } from '@/lib/auth';
import { createRateLimiter, limitFor, type RateLimiter } from '@/lib/rate-limit';

/**
 * The single choke point in front of every request:
 *   1. security headers on everything,
 *   2. the operator gate on writes (see lib/auth.ts),
 *   3. a per-IP budget on the write surface (see lib/rate-limit.ts).
 *
 * Runs on the edge runtime, so everything it imports must be edge-safe.
 */

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-DNS-Prefetch-Control': 'off',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  // Pragmatic, not nonce-based: Next.js inlines its bootstrap script, and the
  // brain/funnel visualizations compute inline styles. Tightening this to a
  // per-request nonce is a follow-up, not a blocker.
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
};

/** HSTS only makes sense once the deployment actually terminates TLS. */
function applySecurityHeaders(res: NextResponse, req: NextRequest): NextResponse {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.headers.set(name, value);
  if (req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https') {
    res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }
  return res;
}

/** One limiter per cost class, kept warm across requests on this instance. */
const limiters = new Map<string, RateLimiter>();

function limiterFor(limit: number, windowMs: number): RateLimiter {
  const key = `${limit}:${windowMs}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = createRateLimiter({ limit, windowMs });
    limiters.set(key, limiter);
  }
  return limiter;
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

function deny(req: NextRequest, status: number, error: string, extra?: Record<string, string>) {
  const res = NextResponse.json({ error }, { status });
  if (extra) for (const [k, v] of Object.entries(extra)) res.headers.set(k, v);
  return applySecurityHeaders(res, req);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const decision = checkAccess(
    { method: req.method, pathname, headers: req.headers },
    process.env as Record<string, string | undefined>,
  );
  if (!decision.ok) return deny(req, decision.status, decision.error);

  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    const config = limitFor(pathname);
    if (config) {
      const result = limiterFor(config.limit, config.windowMs).check(`${clientIp(req)}|${pathname}`);
      if (!result.allowed) {
        return deny(req, 429, 'Too many requests — slow down.', {
          'Retry-After': String(result.retryAfterSeconds),
        });
      }
    }
  }

  return applySecurityHeaders(NextResponse.next(), req);
}

export const config = {
  // Everything except Next's own static output and the favicon.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
