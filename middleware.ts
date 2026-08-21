import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

/**
 * Single-operator password gate for the whole app. Local `next dev` stays
 * open (NODE_ENV !== 'production') so the dev workflow needs no setup; a
 * real deployment (`next start`, i.e. Vercel/Railway) enforces it — and
 * fails CLOSED if AUTH_PASSWORD/AUTH_SECRET aren't set, since the whole
 * point is protecting the data, not defaulting back to open.
 *
 * /api/webhooks/* carry their own per-integration secret (e.g.
 * MANYCHAT_WEBHOOK_SECRET) and are called by third parties that can't hold
 * a session cookie, so they're exempt here.
 */
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/webhooks'];

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (process.env.NODE_ENV !== 'production') return NextResponse.next();

  const secret = process.env.AUTH_SECRET;
  const password = process.env.AUTH_PASSWORD;
  const configured = Boolean(secret && password);
  const ok = configured && (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, secret!));
  if (ok) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: configured ? 'unauthorized' : 'AUTH_PASSWORD/AUTH_SECRET not configured' },
      { status: configured ? 401 : 503 },
    );
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}
