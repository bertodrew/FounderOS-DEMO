/**
 * Single-operator session auth — a signed, expiring cookie, no user table.
 * Uses Web Crypto (crypto.subtle) so the same code runs in both the Edge
 * middleware and the Node.js API routes without a runtime-specific fork.
 */
export const SESSION_COOKIE = 'founderos_session';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toB64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function createSessionToken(secret: string): Promise<string> {
  const payload = toB64Url(new TextEncoder().encode(JSON.stringify({ exp: Date.now() + SESSION_MS })));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return `${payload}.${toB64Url(sig)}`;
}

export async function verifySessionToken(token: string | undefined | null, secret: string): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  try {
    const key = await hmacKey(secret);
    const valid = await crypto.subtle.verify('HMAC', key, fromB64Url(sig) as BufferSource, new TextEncoder().encode(payload));
    if (!valid) return false;
    const { exp } = JSON.parse(new TextDecoder().decode(fromB64Url(payload))) as { exp?: number };
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

/**
 * Constant-time string compare for shared secrets that are checked outside the
 * session gate. `/api/webhooks/*` is exempt from the middleware (third parties
 * cannot hold a session cookie), so its per-integration secret is the only
 * thing guarding a write endpoint and deserves a compare that does not leak
 * the answer through timing. Kept here, edge-safe, so both runtimes can use it.
 */
export function timingSafeEquals(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
