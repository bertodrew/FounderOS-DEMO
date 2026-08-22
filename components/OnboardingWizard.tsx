'use client';

/**
 * First-run guided setup: walks through the real (non-decorative) connectors
 * in logical groups instead of dropping a new user on the flat 60-tile
 * /integrations grid. Pure UI composition — reuses ConnectionCard, so
 * connecting here is byte-for-byte the same flow as /integrations.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { ConnectionCard } from '@/components/ConnectionCard';
import type { CatalogEntry } from '@/lib/integrations-catalog';

export const ONBOARDING_DONE_KEY = 'founderos-onboarding-done';

const STEPS: { title: string; blurb: string; slugs: string[] }[] = [
  { title: 'AI & agents', blurb: 'Powers agent chat and the Conductor — do this one first.', slugs: ['anthropic'] },
  { title: 'Email & calendar', blurb: 'Gmail also unlocks Google Calendar automatically — same app password.', slugs: ['gmail', 'googlecalendar'] },
  { title: 'Team comms', blurb: 'WhatsApp reads a local Mac chat database — nothing to paste here.', slugs: ['slack', 'whatsapp'] },
  { title: 'CRM & sales', blurb: '', slugs: ['attio', 'gohighlevel', 'odoo'] },
  { title: 'Payments', blurb: '', slugs: ['stripe'] },
  { title: 'Marketing & social', blurb: '', slugs: ['zernio', 'riona', 'arcads', 'meta', 'manychat'] },
  { title: 'Growth & knowledge', blurb: 'Obsidian reads a local vault — nothing to paste here.', slugs: ['beehiiv', 'webinarjam', 'trakyo', 'notion', 'github', 'vercel', 'miro', 'obsidian'] },
];

export function OnboardingWizard({
  catalog,
  detailByConnector,
}: {
  catalog: CatalogEntry[];
  detailByConnector: Record<string, string>;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const bySlug = useMemo(() => new Map(catalog.map((c) => [c.slug, c])), [catalog]);
  const totalConnected = catalog.filter((c) => c.connected).length;

  const finish = () => {
    try {
      localStorage.setItem(ONBOARDING_DONE_KEY, '1');
    } catch {
      // localStorage unavailable (private mode, etc.) — fine, just means the
      // dashboard banner may reappear next visit.
    }
    router.push('/');
    router.refresh();
  };

  const last = step === STEPS.length - 1;
  const current = STEPS[step];
  const entries = current.slugs.map((s) => bySlug.get(s)).filter((e): e is CatalogEntry => Boolean(e));

  return (
    <div>
      <div className="mb-5 flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <button
            key={s.title}
            type="button"
            onClick={() => setStep(i)}
            title={s.title}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i === step ? 'bg-os-text' : i < step ? 'bg-os-border-strong' : 'bg-os-border'
            }`}
          />
        ))}
      </div>

      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">
        Step {step + 1} / {STEPS.length}
      </div>
      <h2 className="mb-1 text-lg font-bold text-os-text">{current.title}</h2>
      {current.blurb && <p className="mb-4 text-[12.5px] text-os-muted">{current.blurb}</p>}
      {!current.blurb && <div className="mb-4" />}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => (
          <ConnectionCard key={entry.slug} entry={entry} guidance={detailByConnector[entry.slug]} />
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-os-border pt-4">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-os-dim transition-colors hover:text-os-text disabled:opacity-30"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>

        <span className="font-mono text-[11px] text-os-dim">{totalConnected} connected so far</span>

        {last ? (
          <button
            type="button"
            onClick={finish}
            className="flex items-center gap-1.5 rounded-full border border-os-border-strong px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-os-text transition-colors hover:bg-os-text hover:text-os-bg"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Finish
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            className="flex items-center gap-1.5 rounded-full border border-os-border-strong px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-os-text transition-colors hover:bg-os-text hover:text-os-bg"
          >
            Next <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="mt-3 text-center">
        <button type="button" onClick={finish} className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-os-dim hover:text-os-text">
          Skip — finish this later on /integrations
        </button>
      </div>
    </div>
  );
}
