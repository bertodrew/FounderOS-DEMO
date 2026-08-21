/**
 * Live onboarding state loader.
 * Shared between the page and the API route to avoid drift.
 */

import { getDb } from '@/lib/data';
import { allConnectorStatuses } from '@/lib/connectors';
import { buildOnboarding } from '@/lib/onboarding';
import { describeStorage } from '@/lib/storage';
import { operatorToken } from '@/lib/auth';
import { runtimeEnv } from '@/lib/creds';

const RUN_LOOKBACK = 50;

export async function loadOnboarding() {
  const env = runtimeEnv();
  const connectors = await allConnectorStatuses();

  const state = buildOnboarding({
    production: process.env.NODE_ENV === 'production',
    storage: describeStorage(process.env),
    writesGated: Boolean(operatorToken(process.env)),
    llm: {
      configured: connectors.find((c) => c.id === 'llm')?.state === 'connected',
      detail: connectors.find((c) => c.id === 'llm')?.detail ?? 'LLM connector not reporting',
    },
    connectors: connectors
      .filter((c) => c.id !== 'llm')
      .map((c) => ({ id: c.id, name: c.name, state: c.state })),
    agentRuns: getDb().agentRuns.recent(RUN_LOOKBACK).length,
    manychatConfigured: Boolean(env.MANYCHAT_API_KEY),
    webhookSecretSet: Boolean(env.MANYCHAT_WEBHOOK_SECRET),
  });

  return state;
}
