import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const Body = z.object({ password: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 });

  const expected = process.env.AUTH_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  if (!expected || !secret) {
    return NextResponse.json(
      { ok: false, error: 'AUTH_PASSWORD/AUTH_SECRET not set — auth is not configured' },
      { status: 503 },
    );
  }
  if (parsed.data.password !== expected) {
    return NextResponse.json({ ok: false, error: 'wrong password' }, { status: 401 });
  }

  const token = await createSessionToken(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  });
  return res;
}
