import { afterEach, describe, expect, test, vi } from 'vitest';
import { imapClientOptions, parseInboxConfigs, testImapConnection } from '@/lib/connectors/email';
import { configuredProcessors } from '@/lib/connectors/payments';
import { metaAdsStatus } from '@/lib/connectors/meta-ads';
import { ghlStatus } from '@/lib/connectors/ghl';
import { githubStatus } from '@/lib/connectors/github';
import { odooStatus } from '@/lib/connectors/odoo';
import { rionaStatus, rionaLogin } from '@/lib/connectors/riona';

describe('parseInboxConfigs', () => {
  test('returns empty when nothing is configured', () => {
    expect(parseInboxConfigs({})).toEqual([]);
  });

  test('parses up to four complete inbox slots', () => {
    const env = {
      INBOX_1_HOST: 'imap.gmail.com',
      INBOX_1_USER: 'admin@founderos.ai',
      INBOX_1_PASS: 'app-pass-1',
      INBOX_2_HOST: 'imap.gmail.com',
      INBOX_2_USER: 'alex@example.com',
      INBOX_2_PASS: 'app-pass-2',
      INBOX_2_NAME: 'LC Main',
      INBOX_3_HOST: 'imap.fastmail.com',
      INBOX_3_PORT: '1993',
      INBOX_3_USER: 'ops@vantage.co',
      INBOX_3_PASS: 'app-pass-3',
      INBOX_4_HOST: 'imap.gmail.com',
      INBOX_4_USER: 'personal@gmail.com',
      INBOX_4_PASS: 'app-pass-4',
    };
    const inboxes = parseInboxConfigs(env);
    expect(inboxes).toHaveLength(4);
    expect(inboxes[0]).toEqual({
      id: 'inbox-1',
      name: 'admin@founderos.ai',
      host: 'imap.gmail.com',
      port: 993,
      user: 'admin@founderos.ai',
      pass: 'app-pass-1',
      smtpHost: 'smtp.gmail.com', // imap. → smtp. default
      smtpPort: 465,
    });
    expect(inboxes[1].name).toBe('LC Main');
    expect(inboxes[2].port).toBe(1993);
  });

  test('imap clients fail fast: connect/greeting/socket timeouts are always set', () => {
    // Without these, a throttled Gmail connect hangs the home render and the
    // comms feed for tens of seconds (dashboards must degrade, not stall).
    const opts = imapClientOptions({
      id: 'inbox-1', name: 'x', host: 'imap.gmail.com', port: 993,
      user: 'a@b.c', pass: 'p', smtpHost: 'smtp.gmail.com', smtpPort: 465,
    });
    expect(opts.connectionTimeout).toBeLessThanOrEqual(5000);
    expect(opts.greetingTimeout).toBeLessThanOrEqual(5000);
    expect(opts.socketTimeout).toBeLessThanOrEqual(10000);
    expect(opts.host).toBe('imap.gmail.com');
    expect(opts.auth).toEqual({ user: 'a@b.c', pass: 'p' });
  });

  test('skips slots that are missing host, user, or pass', () => {
    const env = {
      INBOX_1_HOST: 'imap.gmail.com',
      INBOX_1_USER: 'a@b.c',
      // no pass — incomplete
      INBOX_2_HOST: 'imap.gmail.com',
      INBOX_2_USER: 'x@y.z',
      INBOX_2_PASS: 'ok',
    };
    const inboxes = parseInboxConfigs(env);
    expect(inboxes).toHaveLength(1);
    expect(inboxes[0].id).toBe('inbox-2');
  });
});

describe('metaAdsStatus', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('reports not_configured without a token — never a fake connected', async () => {
    vi.stubEnv('META_ADS_ACCESS_TOKEN', '');
    const status = await metaAdsStatus();
    expect(status.id).toBe('meta-ads');
    expect(status.kind).toBe('ads');
    expect(status.state).toBe('not_configured');
    expect(status.detail).toMatch(/META_ADS_ACCESS_TOKEN/);
  });

  test('reports connected once META_ADS_ACCESS_TOKEN is set', async () => {
    vi.stubEnv('META_ADS_ACCESS_TOKEN', 'EAAG-test-token');
    const status = await metaAdsStatus();
    expect(status.state).toBe('connected');
  });
});

describe('ghlStatus', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('needs BOTH the private-integration token and the location id', async () => {
    vi.stubEnv('GHL_API_KEY', 'pit-token');
    vi.stubEnv('GHL_LOCATION_ID', '');
    expect((await ghlStatus()).state).toBe('not_configured');
    vi.stubEnv('GHL_LOCATION_ID', 'loc_123');
    const status = await ghlStatus();
    expect(status.state).toBe('connected');
    expect(status.id).toBe('ghl');
    expect(status.kind).toBe('crm');
  });
});

describe('testImapConnection', () => {
  test('resolves ok when the injected client connects', async () => {
    const FakeImapFlow = vi.fn().mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn().mockResolvedValue(undefined),
    }));
    const result = await testImapConnection(
      { host: 'imap.gmail.com', user: 'a@b.c', pass: 'good-pass' },
      FakeImapFlow as never,
    );
    expect(result.ok).toBe(true);
  });

  test('reports the real error when the injected client rejects', async () => {
    const FakeImapFlow = vi.fn().mockImplementation(() => ({
      connect: vi.fn().mockRejectedValue(new Error('Invalid credentials (Failure)')),
      logout: vi.fn().mockResolvedValue(undefined),
    }));
    const result = await testImapConnection(
      { host: 'imap.gmail.com', user: 'a@b.c', pass: 'wrong-pass' },
      FakeImapFlow as never,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid credentials/);
  });
});

describe('githubStatus', () => {
  test('reports not_configured without a token', async () => {
    const status = await githubStatus({});
    expect(status.id).toBe('github');
    expect(status.kind).toBe('developer');
    expect(status.state).toBe('not_configured');
    expect(status.detail).toMatch(/GITHUB_TOKEN/);
  });
});

describe('odooStatus', () => {
  test('reports not_configured unless all four fields are set', async () => {
    expect((await odooStatus({})).state).toBe('not_configured');
    expect(
      (
        await odooStatus({
          ODOO_URL: 'https://x.odoo.com',
          ODOO_DB: 'x',
          ODOO_USERNAME: 'a@b.c',
          // no ODOO_API_KEY
        })
      ).state,
    ).toBe('not_configured');
  });
});

describe('rionaStatus', () => {
  test('reports not_configured without RIONA_BASE_URL', async () => {
    const status = await rionaStatus({});
    expect(status.id).toBe('riona');
    expect(status.kind).toBe('social');
    expect(status.state).toBe('not_configured');
    expect(status.detail).toMatch(/RIONA_BASE_URL/);
  });
});

describe('rionaLogin', () => {
  test('fails fast when IG credentials are missing, even with a base URL set', async () => {
    const result = await rionaLogin({ RIONA_BASE_URL: 'https://example.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/RIONA_IG_USERNAME/);
  });

  test('fails without RIONA_BASE_URL regardless of credentials', async () => {
    const result = await rionaLogin({ RIONA_IG_USERNAME: 'a', RIONA_IG_PASSWORD: 'b' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/RIONA_BASE_URL/);
  });
});

describe('configuredProcessors', () => {
  test('reports all processors unconfigured with an empty env', () => {
    const procs = configuredProcessors({});
    expect(procs.length).toBeGreaterThanOrEqual(3);
    expect(procs.every((p) => !p.configured)).toBe(true);
  });

  test('detects Stripe when STRIPE_SECRET_KEY is set', () => {
    const procs = configuredProcessors({ STRIPE_SECRET_KEY: 'sk_test_123' });
    const stripe = procs.find((p) => p.id === 'stripe');
    expect(stripe?.configured).toBe(true);
  });

  test('detects PayPal only when both client id and secret are set', () => {
    expect(
      configuredProcessors({ PAYPAL_CLIENT_ID: 'cid' }).find((p) => p.id === 'paypal')?.configured,
    ).toBe(false);
    expect(
      configuredProcessors({ PAYPAL_CLIENT_ID: 'cid', PAYPAL_CLIENT_SECRET: 'sec' }).find(
        (p) => p.id === 'paypal',
      )?.configured,
    ).toBe(true);
  });
});
