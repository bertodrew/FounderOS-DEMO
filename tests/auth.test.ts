import { describe, expect, test } from 'vitest';
import { createSessionToken, verifySessionToken } from '@/lib/auth';

describe('session token', () => {
  test('a token created with a secret verifies with that same secret', async () => {
    const token = await createSessionToken('test-secret');
    expect(await verifySessionToken(token, 'test-secret')).toBe(true);
  });

  test('rejects a token signed with a different secret', async () => {
    const token = await createSessionToken('test-secret');
    expect(await verifySessionToken(token, 'wrong-secret')).toBe(false);
  });

  test('rejects a tampered payload', async () => {
    const token = await createSessionToken('test-secret');
    const [, sig] = token.split('.');
    const tampered = `${Buffer.from(JSON.stringify({ exp: Date.now() + 999999999 })).toString('base64url')}.${sig}`;
    expect(await verifySessionToken(tampered, 'test-secret')).toBe(false);
  });

  test('rejects missing, empty, or malformed tokens', async () => {
    expect(await verifySessionToken(undefined, 'test-secret')).toBe(false);
    expect(await verifySessionToken('', 'test-secret')).toBe(false);
    expect(await verifySessionToken('not-a-real-token', 'test-secret')).toBe(false);
  });

  test('rejects an expired token', async () => {
    // Build a token with an already-past exp using the same signing scheme.
    const past = Buffer.from(JSON.stringify({ exp: Date.now() - 1000 })).toString('base64url');
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('test-secret'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(past))).toString(
      'base64url',
    );
    expect(await verifySessionToken(`${past}.${sig}`, 'test-secret')).toBe(false);
  });
});
