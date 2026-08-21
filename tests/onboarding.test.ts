import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { INTEGRATIONS } from '@/lib/integrations-catalog';

// The wizard's step->slug map lives in a client component and isn't
// exported as data, so parse it out of the source — same "no page escapes"
// spirit as tests/smoke.test.ts, applied to the onboarding step coverage.
function wizardSlugs(): string[] {
  const src = readFileSync(path.join(process.cwd(), 'components/OnboardingWizard.tsx'), 'utf8');
  const slugs = new Set<string>();
  for (const m of src.matchAll(/slugs:\s*\[([^\]]*)\]/g)) {
    for (const s of m[1].matchAll(/'([^']+)'/g)) slugs.add(s[1]);
  }
  return [...slugs];
}

describe('onboarding wizard step coverage', () => {
  const slugs = wizardSlugs();
  const realConnectorSlugs = INTEGRATIONS.filter((i) => i.connectorId).map((i) => i.slug);

  test('every wizard step slug is a real catalog entry', () => {
    const catalogSlugs = new Set(INTEGRATIONS.map((i) => i.slug));
    for (const s of slugs) expect(catalogSlugs.has(s), `'${s}' is not in INTEGRATIONS`).toBe(true);
  });

  test('every real (connectorId-bearing) integration is covered by some step', () => {
    const covered = new Set(slugs);
    const missing = realConnectorSlugs.filter((s) => !covered.has(s));
    expect(missing, `real connectors missing from the wizard: ${missing.join(', ')}`).toEqual([]);
  });

  test('no step references a decorative (no-connectorId) catalog entry', () => {
    const real = new Set(realConnectorSlugs);
    const decorative = slugs.filter((s) => !real.has(s));
    expect(decorative, `wizard references decorative slugs: ${decorative.join(', ')}`).toEqual([]);
  });
});
