/**
 * The setup path from "cloned it" to "safe to point at the internet".
 *
 * Every step is decided by a real signal — storage durability, whether the
 * write gate is armed, whether a connector actually reports `connected` — and
 * carries that signal as `evidence`. Same rule as the connectors themselves:
 * never a green check that isn't earned. A step the deployment does not need
 * (the ManyChat webhook when ManyChat is not in use) is not shown at all,
 * rather than shown as permanently incomplete.
 */

export type StepStatus = 'done' | 'todo' | 'attention';

/** Translate a step status into the vocabulary `Dot` understands. Its lookup
 *  falls back to 'off' for anything unknown, so an untranslated status would
 *  render every step grey and lose the page's only status signal. */
export function dotStateFor(status: StepStatus): 'ok' | 'warn' | 'off' {
  if (status === 'done') return 'ok';
  if (status === 'attention') return 'warn';
  return 'off';
}

export type OnboardingStep = {
  id: string;
  title: string;
  /** Why this matters — the consequence of leaving it undone. */
  detail: string;
  /** The next concrete move. */
  action: string;
  /** The observed state that decided the status. */
  evidence: string;
  status: StepStatus;
  /** Must be done before this deployment is safe to expose. */
  required: boolean;
  /** Where in the app to go and do it, when there is such a place. */
  href?: string;
};

export type ConnectorSummary = {
  id: string;
  name: string;
  state: 'connected' | 'not_configured' | 'error';
};

export type OnboardingInput = {
  production: boolean;
  storage: { durable: boolean; reason: string };
  writesGated: boolean;
  llm: { configured: boolean; detail: string };
  connectors: ConnectorSummary[];
  /** Recent runs observed (the caller may cap its lookback). */
  agentRuns: number;
  manychatConfigured: boolean;
  webhookSecretSet: boolean;
};

export type OnboardingState = {
  steps: OnboardingStep[];
  completed: number;
  total: number;
  requiredRemaining: number;
  productionReady: boolean;
};

/** Undone required work is an alarm in production and a to-do before it. */
function pending(production: boolean): StepStatus {
  return production ? 'attention' : 'todo';
}

export function buildOnboarding(input: OnboardingInput): OnboardingState {
  const steps: OnboardingStep[] = [];

  steps.push({
    id: 'storage',
    title: 'Give the store a durable home',
    detail:
      'Agent runs, tasks, brain dumps, queued posts and contact tags are written to the store. If it is not durable, they disappear on the next restart without an error.',
    action: 'Point FOUNDER_OS_DB at a mounted volume, then re-check /api/health.',
    evidence: input.storage.reason,
    status: input.storage.durable ? 'done' : 'attention',
    required: true,
  });

  steps.push({
    id: 'access',
    title: 'Arm the write gate',
    detail:
      'Reads are public by design. Writes spend LLM budget, save credentials and mutate the store, so they need an operator token before this is reachable from the internet.',
    action: 'Set FOUNDER_OS_TOKEN (openssl rand -hex 32) in the deployment environment.',
    evidence: input.writesGated
      ? 'FOUNDER_OS_TOKEN is set: writes require it'
      : input.production
        ? 'FOUNDER_OS_TOKEN is unset: every write endpoint is answering 503'
        : 'FOUNDER_OS_TOKEN is unset: writes are open, which is fine locally',
    status: input.writesGated ? 'done' : pending(input.production),
    required: true,
  });

  steps.push({
    id: 'llm',
    title: 'Wire the agents to a model',
    detail:
      'Without a gateway key the agents and the Conductor cannot think: /agents renders, but Run and chat fail on every call.',
    action: 'Add AI_GATEWAY_API_KEY, then run any agent from /agents to confirm.',
    evidence: input.llm.detail,
    status: input.llm.configured ? 'done' : 'todo',
    required: false,
    href: '/agents',
  });

  const connected = input.connectors.filter((c) => c.state === 'connected');
  const failing = input.connectors.filter((c) => c.state === 'error');
  const connectorEvidence = [
    `${connected.length} of ${input.connectors.length} connectors reporting connected`,
    failing.length > 0 ? `errors: ${failing.map((c) => c.name).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  steps.push({
    id: 'connectors',
    title: 'Connect a real source',
    detail:
      'Until a connector is live every page is showing seeded placeholder data. One real source is what turns the demo into your operating picture.',
    action: 'Open the Connections board and connect the source you check most often.',
    evidence: connectorEvidence,
    status: connected.length > 0 ? 'done' : 'todo',
    required: false,
    href: '/integrations',
  });

  // Only relevant once ManyChat is actually in use — an unset secret leaves an
  // open write endpoint, so for those deployments it is blocking.
  if (input.manychatConfigured) {
    steps.push({
      id: 'webhook',
      title: 'Secure the ManyChat webhook',
      detail:
        'The DM inbox is fed by an unauthenticated push endpoint. Its shared secret is the only thing standing between that endpoint and anyone who finds the URL.',
      action: 'Set MANYCHAT_WEBHOOK_SECRET and add the same value as an x-manychat-secret header in the ManyChat External Request.',
      evidence: input.webhookSecretSet
        ? 'MANYCHAT_WEBHOOK_SECRET is set: the webhook verifies every request'
        : 'MANYCHAT_WEBHOOK_SECRET is unset: in production the webhook refuses to serve',
      status: input.webhookSecretSet ? 'done' : 'attention',
      required: true,
    });
  }

  steps.push({
    id: 'first-run',
    title: 'Run an agent end to end',
    detail:
      'The last thing that proves the wiring: a run that reaches a real connector, persists, and shows up on the roster.',
    action: 'Hit Run on any agent and watch its last-run state update.',
    evidence:
      input.agentRuns > 0
        ? `${input.agentRuns} recent agent run${input.agentRuns === 1 ? '' : 's'} recorded`
        : 'no agent has run yet',
    status: input.agentRuns > 0 ? 'done' : 'todo',
    required: false,
    href: '/agents',
  });

  const completed = steps.filter((s) => s.status === 'done').length;
  const requiredRemaining = steps.filter((s) => s.required && s.status !== 'done').length;

  return {
    steps,
    completed,
    total: steps.length,
    requiredRemaining,
    productionReady: requiredRemaining === 0,
  };
}
