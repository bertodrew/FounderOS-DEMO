'use client';

/**
 * Create/rename/delete profiles inline next to the /org venture switcher.
 * Profiles are fully user-owned (lib/db.ts `profiles` table) — the two
 * seeded examples (Vantage, Launchpad Cohort) are ordinary editable/deletable
 * rows, not hardcoded.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Venture } from '@/lib/ventures';

export function ProfileManager({ ventures, activeId }: { ventures: Venture[]; activeId?: string }) {
  const router = useRouter();
  const active = activeId ? ventures.find((v) => v.id === activeId) : undefined;
  const [mode, setMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const open = mode !== 'closed';
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCreate = () => {
    setName('');
    setMode('create');
  };

  const startEdit = () => {
    if (!active) return;
    setName(active.name);
    setMode('edit');
  };

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const isEdit = mode === 'edit';
      const res = await fetch('/api/profiles', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { id: active!.id, name: name.trim() } : { name: name.trim() }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: unknown };
      if (!res.ok || !body.ok) throw new Error(isEdit ? 'could not save changes' : 'could not create profile');
      setMode('closed');
      setName('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this profile? This only removes the filter, not agents or data.')) return;
    setBusy(true);
    try {
      await fetch('/api/profiles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (open) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
          placeholder="Company name"
          className="w-40 rounded-md border border-os-border bg-os-surface2 px-2 py-1 font-mono text-[10.5px] text-os-text placeholder:text-os-dim focus:border-os-border-strong focus:outline-none"
        />
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() => void save()}
          className="rounded-lg border border-os-border-strong px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-os-text transition-colors hover:bg-os-text hover:text-os-bg disabled:opacity-40"
        >
          {busy ? '…' : mode === 'edit' ? 'Save' : 'Add'}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('closed');
            setError(null);
          }}
          className="text-[10px] uppercase tracking-[0.08em] text-os-dim hover:text-os-text"
        >
          Cancel
        </button>
        {error && <span className="text-[10px] text-os-err">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={startCreate}
        className="rounded-lg border border-dashed border-os-border px-3 py-1.5 text-xs font-semibold text-os-dim transition-colors hover:border-os-border-strong hover:text-os-text"
      >
        + New profile
      </button>
      {active && (
        <button
          type="button"
          disabled={busy}
          onClick={startEdit}
          className="text-[10px] uppercase tracking-[0.08em] text-os-dim transition-colors hover:text-os-text disabled:opacity-40"
        >
          Edit {active.name}
        </button>
      )}
      {activeId && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void remove(activeId)}
          className="text-[10px] uppercase tracking-[0.08em] text-os-dim transition-colors hover:text-os-err disabled:opacity-40"
        >
          Delete {ventures.find((v) => v.id === activeId)?.name}
        </button>
      )}
    </div>
  );
}
