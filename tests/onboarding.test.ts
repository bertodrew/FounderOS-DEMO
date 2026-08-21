import { describe, expect, test } from 'vitest';
import { buildOnboarding, dotStateFor, type OnboardingInput } from '@/lib/onboarding';
import { dotState } from '@/components/terminal';

/** A deployment with nothing configured: fresh clone, `npm run dev`. */
const fresh: OnboardingInput = {
  production: false,
  storage: { durable: true, reason: 'file-backed database on local disk' },
  writesGated: false,
  llm: { configured: false, detail: 'AI_GATEWAY_API_KEY not set' },
  connectors: [
    { id: 'slack', name: 'Slack', state: 'not_configured' },
    { id: 'payments', name: 'Stripe', state: 'not_configured' },
  ],
  agentRuns: 0,
  manychatConfigured: false,
  webhookSecretSet: false,
};

/** Everything wired, running for real. */
const ready: OnboardingInput = {
  production: true,
  storage: { durable: true, reason: 'file-backed database on local disk' },
  writesGated: true,
  llm: { configured: true, detail: 'gateway · anthropic/claude-sonnet-5' },
  connectors: [
    { id: 'slack', name: 'Slack', state: 'connected' },
    { id: 'payments', name: 'Stripe', state: 'connected' },
  ],
  agentRuns: 4,
  manychatConfigured: false,
  webhookSecretSet: false,
};

describe('buildOnboarding', () => {
  test('a fresh local clone is usable but not production-ready', () => {
    const state = buildOnboarding(fresh);
    expect(state.productionReady).toBe(false);
    expect(state.requiredRemaining).toBeGreaterThan(0);
    expect(state.total).toBe(state.steps.length);
  });

  test('a fully wired production deploy reports ready with nothing required left', () => {
    const state = buildOnboarding(ready);
    expect(state.productionReady).toBe(true);
    expect(state.requiredRemaining).toBe(0);
    expect(state.steps.filter((s) => s.required && s.status !== 'done')).toEqual([]);
  });

  test('every step carries the real signal that decided it, never a bare boolean', () => {
    for (const step of buildOnboarding(fresh).steps) {
      expect(step.evidence.length, step.id).toBeGreaterThan(0);
      expect(step.action.length, step.id).toBeGreaterThan(0);
    }
  });

  test('steps are ordered by what blocks what — storage and access come first', () => {
    const ids = buildOnboarding(fresh).steps.map((s) => s.id);
    expect(ids.indexOf('storage')).toBeLessThan(ids.indexOf('connectors'));
    expect(ids.indexOf('access')).toBeLessThan(ids.indexOf('connectors'));
  });
});

describe('storage step', () => {
  test('an ephemeral store is flagged as needing attention and quotes the reason', () => {
    const state = buildOnboarding({
      ...ready,
      storage: { durable: false, reason: 'serverless instance tmpdir: writes are wiped' },
    });
    const step = state.steps.find((s) => s.id === 'storage')!;
    expect(step.status).toBe('attention');
    expect(step.evidence).toContain('wiped');
    expect(state.productionReady).toBe(false);
  });
});

describe('access step', () => {
  test('ungated writes in production are the blocking failure', () => {
    const state = buildOnboarding({ ...ready, writesGated: false });
    const step = state.steps.find((s) => s.id === 'access')!;
    expect(step.status).toBe('attention');
    expect(step.required).toBe(true);
    expect(state.productionReady).toBe(false);
  });

  test('ungated writes in local dev are a todo, not an alarm', () => {
    const step = buildOnboarding(fresh).steps.find((s) => s.id === 'access')!;
    expect(step.status).toBe('todo');
  });
});

describe('connectors step', () => {
  test('counts only connectors that actually report connected', () => {
    const step = buildOnboarding({
      ...fresh,
      connectors: [
        { id: 'slack', name: 'Slack', state: 'connected' },
        { id: 'payments', name: 'Stripe', state: 'error' },
        { id: 'notion', name: 'Notion', state: 'not_configured' },
      ],
    }).steps.find((s) => s.id === 'connectors')!;
    expect(step.status).toBe('done');
    expect(step.evidence).toMatch(/1 of 3/);
  });

  test('a connector in error state is surfaced, not hidden behind the count', () => {
    const step = buildOnboarding({
      ...fresh,
      connectors: [
        { id: 'slack', name: 'Slack', state: 'connected' },
        { id: 'payments', name: 'Stripe', state: 'error' },
      ],
    }).steps.find((s) => s.id === 'connectors')!;
    expect(step.evidence).toContain('Stripe');
  });
});

describe('conditional steps', () => {
  test('the webhook step only appears once ManyChat is actually in use', () => {
    expect(buildOnboarding(fresh).steps.find((s) => s.id === 'webhook')).toBeUndefined();
    const withManychat = buildOnboarding({ ...fresh, manychatConfigured: true });
    expect(withManychat.steps.find((s) => s.id === 'webhook')).toBeDefined();
  });

  test('a ManyChat deploy without its webhook secret is production-blocking', () => {
    const state = buildOnboarding({ ...ready, manychatConfigured: true, webhookSecretSet: false });
    const step = state.steps.find((s) => s.id === 'webhook')!;
    expect(step.status).toBe('attention');
    expect(state.productionReady).toBe(false);
  });
});

describe('first run step', () => {
  test('is done once an agent has actually run', () => {
    expect(buildOnboarding(fresh).steps.find((s) => s.id === 'first-run')!.status).toBe('todo');
    expect(buildOnboarding(ready).steps.find((s) => s.id === 'first-run')!.status).toBe('done');
  });

  test('is not required — the demo is browsable without it', () => {
    expect(buildOnboarding(fresh).steps.find((s) => s.id === 'first-run')!.required).toBe(false);
  });
});

describe('dotStateFor', () => {
  test('maps every step status onto a state the Dot primitive actually knows', () => {
    // Dot falls back to 'off' for unknown strings, so an untranslated status
    // would render every step grey and silently kill the page's status signal.
    expect(dotStateFor('done')).toBe('ok');
    expect(dotStateFor('attention')).toBe('warn');
    expect(dotStateFor('todo')).toBe('off');
  });

  test('the mapped values are ones dotState resolves, not its fallback', () => {
    for (const status of ['done', 'attention'] as const) {
      expect(dotState(dotStateFor(status))).not.toBe('off');
    }
  });
});
