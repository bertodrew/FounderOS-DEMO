/**
 * Builds the secret payload for the Doppler project that backs a deployment.
 *
 * Two rules the planner will not break:
 *   1. It NEVER invents a third-party credential. A missing Stripe key is
 *      reported as missing, not filled with a placeholder that would later
 *      look configured and fail at the first real call.
 *   2. It only generates the secrets that are genuinely ours to generate —
 *      the operator token and the webhook shared secret — and only when they
 *      do not already exist, so re-running never rotates a live secret out
 *      from under a running deployment.
 *
 * Key names come from the same catalog the Connections board uses, so a
 * connector added there is covered here without a second list to maintain.
 */
import { INTEGRATIONS, connectKeysFor } from '@/lib/integrations-catalog';
import { KEY_SLOTS, maskSecret } from '@/lib/keys';

export type KeyOrigin = 'platform' | 'connector';

export type RequiredKey = {
  name: string;
  origin: KeyOrigin;
  description: string;
  /** Safe for us to generate when absent. Never true for a third-party key. */
  generated?: boolean;
  /** A production deployment is unsafe or broken without this. */
  requiredForProduction?: boolean;
};

/** Keys the platform itself needs, beyond anything a connector asks for. */
const PLATFORM_KEYS: RequiredKey[] = [
  {
    name: 'FOUNDER_OS_TOKEN',
    origin: 'platform',
    description: 'Operator token gating every write endpoint',
    generated: true,
    requiredForProduction: true,
  },
  {
    name: 'FOUNDER_OS_DB',
    origin: 'platform',
    description: 'Absolute path to the SQLite store, on a mounted volume',
    requiredForProduction: true,
  },
  {
    name: 'MANYCHAT_WEBHOOK_SECRET',
    origin: 'platform',
    description: 'Shared secret verifying the ManyChat DM webhook',
    generated: true,
  },
  {
    name: 'AI_GATEWAY_API_KEY',
    origin: 'platform',
    description: 'Vercel AI Gateway key powering agent and Conductor chat',
  },
];

function connectorKeys(): RequiredKey[] {
  const seen = new Set(PLATFORM_KEYS.map((k) => k.name));
  const out: RequiredKey[] = [];

  const add = (name: string, description: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    out.push({ name, origin: 'connector', description });
  };

  for (const integration of INTEGRATIONS) {
    // Only entries wired to a real connector — the rest of the catalog is a
    // marketplace tile with nothing behind it yet.
    if (!integration.connectorId) continue;
    for (const key of connectKeysFor(integration)) add(key, `${integration.name} credential`);
  }
  for (const slot of KEY_SLOTS) add(slot.envVar, slot.label);

  return out;
}

export const REQUIRED_KEYS: RequiredKey[] = [...PLATFORM_KEYS, ...connectorKeys()];

export function requiredKeyNames(): string[] {
  return REQUIRED_KEYS.map((k) => k.name);
}

export type PlanEntry = {
  name: string;
  description: string;
  source: string;
  value: string;
  masked: string;
};

export type SecretPlan = {
  entries: PlanEntry[];
  payload: Record<string, string>;
  /** Declared keys with no value anywhere. */
  missing: string[];
  /** The subset of `missing` that a production deploy actually needs. */
  missingRequired: string[];
};

export type PlanInput = {
  /** Merged view of wherever values legitimately live on this machine. */
  available: Record<string, string | undefined>;
  /** Where `available` came from, for the plan's own report. */
  sourceLabel: string;
  /** Injected so the planner stays pure and testable. */
  generate: (bytes: number) => string;
};

const GENERATED_BYTES = 32;

export function buildSecretPlan(input: PlanInput): SecretPlan {
  const entries: PlanEntry[] = [];
  const missing: string[] = [];
  const missingRequired: string[] = [];

  for (const key of REQUIRED_KEYS) {
    const existing = input.available[key.name]?.trim();
    if (existing) {
      entries.push({
        name: key.name,
        description: key.description,
        source: input.sourceLabel,
        value: existing,
        masked: maskSecret(existing),
      });
      continue;
    }

    if (key.generated) {
      const value = input.generate(GENERATED_BYTES);
      entries.push({
        name: key.name,
        description: key.description,
        source: 'generated',
        value,
        masked: maskSecret(value),
      });
      continue;
    }

    missing.push(key.name);
    if (key.requiredForProduction) missingRequired.push(key.name);
  }

  return {
    entries,
    payload: Object.fromEntries(entries.map((e) => [e.name, e.value])),
    missing,
    missingRequired,
  };
}
