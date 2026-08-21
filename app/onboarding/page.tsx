import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { Badge, Dot, SectionHead } from '@/components/terminal';
import { loadOnboarding } from '@/lib/onboarding-live';
import { dotStateFor } from '@/lib/onboarding';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const onboarding = await loadOnboarding();

  return (
    <div>
      <PageHeader eyebrow="setup" title="Onboarding" />

      {/* Progress summary */}
      <section className="mb-8">
        <div className="rounded-sm-t border border-os-border bg-os-surface px-4 py-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline gap-3">
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-sm font-semibold tracking-[0.06em]">
                  {onboarding.completed}
                </span>
                <span className="font-mono text-xs text-os-muted">
                  of {onboarding.total} complete
                </span>
              </div>
              <span className="h-px flex-1 bg-os-border" />
              <Badge tone={onboarding.productionReady ? 'ok' : 'warn'}>
                {onboarding.productionReady ? 'Production Ready' : `${onboarding.requiredRemaining} Required`}
              </Badge>
            </div>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section>
        <SectionHead label="Setup Steps" count={onboarding.steps.length} />
        <div className="flex flex-col gap-2.5">
          {onboarding.steps.map((step) => {
            const done = step.status === 'done';
            return (
              <div
                key={step.id}
                className={`rounded-sm-t border bg-os-surface px-4 py-3 ${
                  step.required ? 'border-os-border-strong' : 'border-os-border'
                } ${done ? 'opacity-[0.72]' : ''}`}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      <Dot state={dotStateFor(step.status)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <h3 className={`text-sm font-semibold ${done ? 'text-os-muted line-through decoration-os-dim' : ''}`}>
                          {step.title}
                        </h3>
                        {step.required && <Badge ghost>Required</Badge>}
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-os-dim [text-wrap:pretty]">{step.detail}</p>
                      <p className="mt-2 text-[11px] leading-relaxed text-os-muted">{step.action}</p>
                      <p className="mt-2 font-mono text-[10px] text-os-muted">{step.evidence}</p>
                    </div>
                  </div>
                  {step.href && (
                    <Link
                      href={step.href}
                      className="shrink-0 font-mono text-[10px] text-os-dim transition-colors hover:text-os-accent"
                    >
                      Go →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
