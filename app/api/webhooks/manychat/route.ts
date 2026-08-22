import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { parseManyChatWebhook } from '@/lib/connectors/manychat-webhook';
import { timingSafeEquals } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // better-sqlite3 is native — keep off the edge runtime

/** A DM payload is a few KB; anything larger is not one. */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * ManyChat "External Request" ingest. ManyChat's API can't be polled for DMs,
 * so this push endpoint is how the /social Instagram DM inbox goes live: point a
 * ManyChat automation's External Request (POST) at this URL with a JSON body
 * carrying the contact + message. Each message upserts by id, so replays don't
 * duplicate.
 *
 * ManyChat has no signed-payload scheme, so the shared header IS the auth: the
 * request must carry `x-manychat-secret` matching MANYCHAT_WEBHOOK_SECRET (add
 * it in the ManyChat External Request headers). With the secret unset this
 * would be an open write endpoint, so in production the webhook refuses to
 * serve at all rather than accept anonymous writes; locally it stays open so
 * the demo works with no setup.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.MANYCHAT_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'webhook disabled: set MANYCHAT_WEBHOOK_SECRET' },
        { status: 503 },
      );
    }
  } else if (!timingSafeEquals(request.headers.get('x-manychat-secret') ?? '', secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'payload too large' }, { status: 413 });
  }

  const raw = await request.json().catch(() => null);
  const message = parseManyChatWebhook(raw);
  if (!message) {
    return NextResponse.json({ error: 'payload missing a subscriber id' }, { status: 400 });
  }

  getDb().social.upsertDmMessage(message);
  return NextResponse.json({ ok: true, id: message.id, subscriberId: message.subscriberId });
}

/** Lightweight health check: how many DMs are stored. */
export async function GET(): Promise<Response> {
  const secret = process.env.MANYCHAT_WEBHOOK_SECRET;
  return NextResponse.json({
    ok: true,
    endpoint: 'manychat-webhook',
    secured: Boolean(secret),
    stored: getDb().social.dmMessages('instagram').length,
  });
}
