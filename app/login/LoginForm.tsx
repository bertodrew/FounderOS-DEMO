'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!body.ok) throw new Error(body.error ?? 'login failed');
      router.push(params.get('next') || '/');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-os-bg px-4">
      <div className="w-full max-w-xs rounded-2xl border border-os-border bg-os-surface p-6">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.26em] text-os-dim">// founder os</div>
        <h1 className="mb-4 text-lg font-bold text-os-text">Sign in</h1>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          placeholder="Password"
          className="mb-3 w-full rounded-md border border-os-border bg-os-surface2 px-3 py-2 font-mono text-sm text-os-text placeholder:text-os-dim focus:border-os-border-strong focus:outline-none"
        />
        {error && <div className="mb-3 font-mono text-[11px] text-os-err">{error}</div>}
        <button
          type="button"
          disabled={busy || !password}
          onClick={() => void submit()}
          className="w-full rounded-lg border border-os-border-strong px-3 py-2 text-sm font-semibold text-os-text transition-colors hover:bg-os-text hover:text-os-bg disabled:opacity-40"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </div>
  );
}
