'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, X } from 'lucide-react';
import { ONBOARDING_DONE_KEY } from '@/components/OnboardingWizard';

/** Dismissible nudge toward /onboarding while setup looks incomplete. Reads
 *  localStorage client-side only, so it never affects server rendering or
 *  shows a flash of the wrong state to a screen reader / no-JS client. */
export function OnboardingBanner({ connected, total }: { connected: number; total: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (connected >= total) return;
    try {
      if (localStorage.getItem(ONBOARDING_DONE_KEY)) return;
    } catch {
      // localStorage unavailable — default to showing the nudge.
    }
    setVisible(true);
  }, [connected, total]);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(ONBOARDING_DONE_KEY, '1');
    } catch {
      // best-effort only
    }
    setVisible(false);
  };

  return (
    <div className="mb-[18px] flex items-center gap-3 rounded-lg-t border border-os-border-strong bg-os-surface px-4 py-2.5">
      <span className="font-mono text-[12px] text-os-text">
        {connected} of {total} tools connected — finish setup
      </span>
      <Link href="/onboarding" className="hoverable ml-auto flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.08em] text-os-accent">
        Continue <ArrowUpRight className="h-3 w-3" />
      </Link>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="text-os-dim transition-colors hover:text-os-text">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
