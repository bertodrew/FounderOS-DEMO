import { NextResponse } from 'next/server';
import { loadOnboarding } from '@/lib/onboarding-live';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // better-sqlite3 is native — keep off the edge runtime

/**
 * Live setup state. Reports posture only — which knobs are set, never their
 * values — so it stays safe to read without the operator token, the same way
 * /api/health does.
 */
export async function GET(): Promise<Response> {
  const state = await loadOnboarding();
  return NextResponse.json(state);
}
