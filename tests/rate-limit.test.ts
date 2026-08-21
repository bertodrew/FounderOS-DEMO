import { describe, expect, test } from 'vitest';
import { createRateLimiter, limitFor } from '@/lib/rate-limit';

describe('createRateLimiter', () => {
  test('allows up to the limit inside one window, then denies', () => {
    let now = 1_000;
    const rl = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => now });
    expect(rl.check('a').allowed).toBe(true);
    expect(rl.check('a').allowed).toBe(true);
    const third = rl.check('a');
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    const fourth = rl.check('a');
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBe(60);
  });

  test('keys are independent', () => {
    let now = 0;
    const rl = createRateLimiter({ limit: 1, windowMs: 1_000, now: () => now });
    expect(rl.check('a').allowed).toBe(true);
    expect(rl.check('b').allowed).toBe(true);
    expect(rl.check('a').allowed).toBe(false);
  });

  test('the window rolls over and frees the budget again', () => {
    let now = 0;
    const rl = createRateLimiter({ limit: 1, windowMs: 1_000, now: () => now });
    expect(rl.check('a').allowed).toBe(true);
    expect(rl.check('a').allowed).toBe(false);
    now = 1_001;
    expect(rl.check('a').allowed).toBe(true);
  });

  test('retryAfter counts down inside the window and is never zero while denied', () => {
    let now = 0;
    const rl = createRateLimiter({ limit: 1, windowMs: 10_000, now: () => now });
    rl.check('a');
    now = 9_500;
    const denied = rl.check('a');
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBe(1);
  });

  test('evicts expired keys so the map cannot grow without bound', () => {
    let now = 0;
    const rl = createRateLimiter({ limit: 1, windowMs: 1_000, now: () => now });
    for (let i = 0; i < 500; i += 1) {
      now = i * 2_000;
      rl.check(`key-${i}`);
    }
    // Bounded by the sweep interval, not by the number of distinct keys seen.
    expect(rl.size()).toBeLessThanOrEqual(65);
  });
});

describe('limitFor', () => {
  test('prices the LLM and upload routes tighter than plain writes', () => {
    const chat = limitFor('/api/agents/data-agent/chat');
    const upload = limitFor('/api/finances/bank-statement');
    const plain = limitFor('/api/contacts/tags');
    expect(chat).not.toBeNull();
    expect(upload).not.toBeNull();
    expect(plain).not.toBeNull();
    expect(chat!.limit).toBeLessThan(plain!.limit);
    expect(upload!.limit).toBeLessThan(plain!.limit);
  });

  test('covers every money-spending surface', () => {
    for (const p of [
      '/api/agents/x/chat',
      '/api/agents/x/run',
      '/api/agents/broadcast',
      '/api/agents/work',
      '/api/brain/dump',
      '/api/social/sync',
    ]) {
      expect(limitFor(p), p).not.toBeNull();
    }
  });

  test('reads are not priced here — the middleware only meters writes', () => {
    expect(limitFor('/agents')).toBeNull();
    expect(limitFor('/api/health')).toBeNull();
  });
});
