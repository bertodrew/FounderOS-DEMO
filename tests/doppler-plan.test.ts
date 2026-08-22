import { describe, expect, test } from 'vitest';
import { REQUIRED_KEYS, buildSecretPlan, requiredKeyNames } from '@/lib/doppler-plan';

describe('requiredKeyNames', () => {
  test('covers the platform keys and every connector key the catalog declares', () => {
    const names = requiredKeyNames();
    expect(names).toEqual(expect.arrayContaining([
      'AUTH_PASSWORD', 'AUTH_SECRET', 'FOUNDER_OS_DB', 'AI_GATEWAY_API_KEY',
      'SLACK_BOT_TOKEN', 'STRIPE_SECRET_KEY', 'NOTION_API_KEY',
      'MANYCHAT_API_KEY', 'MANYCHAT_WEBHOOK_SECRET',
    ]));
  });

  test('has no duplicates — the catalog and the key slots overlap', () => {
    const names = requiredKeyNames();
    expect(new Set(names).size).toBe(names.length);
  });

  test('every name is a legal env var', () => {
    for (const name of requiredKeyNames()) expect(name).toMatch(/^[A-Z][A-Z0-9_]*$/);
  });
});

describe('buildSecretPlan', () => {
  const generate = (n: number) => 'g'.repeat(n);

  test('takes an existing value and records where it came from', () => {
    const plan = buildSecretPlan({
      available: { SLACK_BOT_TOKEN: 'xoxb-real-value' },
      sourceLabel: '.env.local',
      generate,
    });
    const slack = plan.entries.find((e) => e.name === 'SLACK_BOT_TOKEN')!;
    expect(slack.value).toBe('xoxb-real-value');
    expect(slack.source).toBe('.env.local');
  });

  test('generates the secrets it is allowed to invent, and only those', () => {
    const plan = buildSecretPlan({ available: {}, sourceLabel: '.env.local', generate });
    const generated = plan.entries.filter((e) => e.source === 'generated').map((e) => e.name);
    expect(generated.sort()).toEqual(['AUTH_SECRET', 'MANYCHAT_WEBHOOK_SECRET']);
    // The operator password is a human choice, so it is reported, never invented.
    expect(plan.missing).toContain('AUTH_PASSWORD');
    // A third-party credential is never invented — it is reported missing.
    expect(plan.entries.find((e) => e.name === 'STRIPE_SECRET_KEY')).toBeUndefined();
    expect(plan.missing).toContain('STRIPE_SECRET_KEY');
  });

  test('never overwrites a generated-type secret that already exists', () => {
    const plan = buildSecretPlan({
      available: { AUTH_SECRET: 'already-set' },
      sourceLabel: 'process.env',
      generate,
    });
    const token = plan.entries.find((e) => e.name === 'AUTH_SECRET')!;
    expect(token.value).toBe('already-set');
    expect(token.source).toBe('process.env');
  });

  test('masks every value for display and never exposes the secret', () => {
    const plan = buildSecretPlan({
      available: { SLACK_BOT_TOKEN: 'xoxb-super-secret-1234' },
      sourceLabel: '.env.local',
      generate,
    });
    const slack = plan.entries.find((e) => e.name === 'SLACK_BOT_TOKEN')!;
    expect(slack.masked).toBe('••••1234');
    expect(slack.masked).not.toContain('super-secret');
  });

  test('the payload is a flat name to value map ready for `doppler secrets upload`', () => {
    const plan = buildSecretPlan({
      available: { SLACK_BOT_TOKEN: 'xoxb-1', NOTION_API_KEY: 'ntn-2' },
      sourceLabel: '.env.local',
      generate,
    });
    expect(plan.payload.SLACK_BOT_TOKEN).toBe('xoxb-1');
    expect(plan.payload.NOTION_API_KEY).toBe('ntn-2');
    for (const value of Object.values(plan.payload)) expect(typeof value).toBe('string');
  });

  test('a blank or whitespace value counts as missing, not as configured', () => {
    const plan = buildSecretPlan({
      available: { SLACK_BOT_TOKEN: '   ' },
      sourceLabel: '.env.local',
      generate,
    });
    expect(plan.missing).toContain('SLACK_BOT_TOKEN');
    expect(plan.payload.SLACK_BOT_TOKEN).toBeUndefined();
  });

  test('required-for-production keys that stay missing are called out separately', () => {
    const plan = buildSecretPlan({ available: {}, sourceLabel: '.env.local', generate });
    // FOUNDER_OS_DB has no safe default to invent, and prod is unsafe without it.
    expect(plan.missingRequired).toContain('FOUNDER_OS_DB');
    expect(plan.missingRequired.every((n) => plan.missing.includes(n))).toBe(true);
  });
});

describe('REQUIRED_KEYS metadata', () => {
  test('every entry explains itself so the plan output is readable without the code', () => {
    for (const key of REQUIRED_KEYS) {
      expect(key.description.length, key.name).toBeGreaterThan(0);
      expect(['platform', 'connector']).toContain(key.origin);
    }
  });
});
