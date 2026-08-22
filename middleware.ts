import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';
import { createRateLimiter, limitFor, type RateLimiter } from '@/lib/rate-limit';

/**
 * The single choke point in front of every request:
 *   1. security headers on everything,
 *   2. the single-operator password gate,
 *   3. a per-IP budget on the write surface.
 *
 * Local `next dev` stays open (NODE_ENV !== 'production') so the dev workflow
 * needs no setup; a real deployment enforces the gate, and fails CLOSED if
 * AUTH_PASSWORD/AUTH_SECRET aren't set, since the point is protecting the data,
 * not defaulting back to open.
 *
 * Runs on the edge runtime, so everything it imports must stay edge-safe.
 */

/** Exempt from the session gate, each for its own reason:
 *  - /login and /api/auth/login are how you get a session in the first place;
 *  - /api/webhooks/* is called by third parties that cannot hold a cookie, so
 *    each carries its own per-integration secret (e.g. MANYCHAT_WEBHOOK_SECRET);
 *  - /api/health must answer an unauthenticated platform probe. Railway's
 *    healthcheckPath points at it, and a gated health check fails every deploy. */
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/webhooks', '/api/health'];

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
function harden(res: NextResponse, req: NextRequest): NextResponse {
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

/** Metered even on public paths: the webhooks are exempt from the session gate,
 *  so without this they would be an unmetered write surface. */
function rateLimited(req: NextRequest): NextResponse | null {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return null;
  const config = limitFor(req.nextUrl.pathname);
  if (!config) return null;
  const result = limiterFor(config.limit, config.windowMs).check(
    `${clientIp(req)}|${req.nextUrl.pathname}`,
  );
  if (result.allowed) return null;
  const res = NextResponse.json({ error: 'Too many requests — slow down.' }, { status: 429 });
  res.headers.set('Retry-After', String(result.retryAfterSeconds));
  return harden(res, req);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const limited = rateLimited(req);
  if (limited) return limited;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return harden(NextResponse.next(), req);
  }
  if (process.env.NODE_ENV !== 'production') return harden(NextResponse.next(), req);

  const secret = process.env.AUTH_SECRET;
  const password = process.env.AUTH_PASSWORD;
  const configured = Boolean(secret && password);
  const ok = configured && (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, secret!));
  if (ok) return harden(NextResponse.next(), req);

  if (pathname.startsWith('/api/')) {
    return harden(
      NextResponse.json(
        { error: configured ? 'unauthorized' : 'AUTH_PASSWORD/AUTH_SECRET not configured' },
        { status: configured ? 401 : 503 },
      ),
      req,
    );
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return harden(NextResponse.redirect(url), req);
}
