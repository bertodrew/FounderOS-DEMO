import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ profiles: getDb().profiles.all() });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(80),
  kind: z.string().max(80).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'profile'
  );
}

export async function POST(request: Request) {
  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const db = getDb();
  const existing = db.profiles.all();

  const base = slugify(parsed.data.name);
  let id = base;
  let n = 2;
  while (existing.some((p) => p.id === id)) id = `${base}-${n++}`;

  const profile = {
    id,
    name: parsed.data.name,
    kind: parsed.data.kind ?? '',
    color: parsed.data.color ?? '#3df08c',
    detail: '',
    brainTag: id,
    focus: [],
    areaAgents: {},
    order: (existing.at(-1)?.order ?? 0) + 1,
  };
  db.profiles.insert(profile);
  return NextResponse.json({ ok: true, profile });
}

const DeleteSchema = z.object({ id: z.string().min(1) });

export async function DELETE(request: Request) {
  const parsed = DeleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  getDb().profiles.delete(parsed.data.id);
  return NextResponse.json({ ok: true });
}
