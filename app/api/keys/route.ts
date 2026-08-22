import { NextResponse } from 'next/server';
import path from 'node:path';
import { z } from 'zod';
import { KEY_SLOTS, listKeyStatuses, upsertEnvLocal } from '@/lib/keys';

export const dynamic = 'force-dynamic';

const ENV_LOCAL = path.join(process.cwd(), '.env.local');

export async function GET() {
  // masked statuses only — raw values never cross this boundary
  return NextResponse.json({ keys: listKeyStatuses() });
}

const SetKeySchema = z.object({
  envVar: z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
  value: z.string().min(1).max(4096),
});

export async function POST(request: Request) {
  const parsed = SetKeySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { envVar, value } = parsed.data;
  if (!KEY_SLOTS.some((s) => s.envVar === envVar)) {
    return NextResponse.json({ error: `unknown key slot: ${envVar}` }, { status: 400 });
  }
  try {
    upsertEnvLocal(ENV_LOCAL, envVar, value);
  } catch (err) {
    // Serverless bundles are read-only, and a container's disk does not survive
    // a redeploy — so say that plainly instead of a 500 with a stack trace.
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'EROFS' || code === 'EACCES' || code === 'EPERM') {
      return NextResponse.json(
        {
          error:
            'This deployment has a read-only filesystem. Set connector credentials as environment variables on the host instead of pasting them here.',
        },
        { status: 501 },
      );
    }
    return NextResponse.json({ error: 'could not save that key' }, { status: 500 });
  }
  process.env[envVar] = value; // live immediately; .env.local persists across restarts
  return NextResponse.json({ ok: true, envVar });
}
