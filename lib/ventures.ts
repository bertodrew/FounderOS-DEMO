/**
 * The venture/profile lens over the OS.
 *
 * One database, one G-Brain, one agent roster: profiles never partition the
 * data. They are saved filters — each one names the agents that serve it per
 * life area, the brain tag that marks its pages, and the current executive
 * focus. Switching profile in the hierarchy or life map swaps which crew
 * lights up; the agents themselves keep full visibility of everything.
 *
 * Profiles are stored in the `profiles` table (lib/db.ts) and fully
 * user-managed via /api/profiles — create one per real company, delete the
 * seeded examples once you don't need them. Every helper here takes the
 * current profile list as a parameter rather than reading a hardcoded array.
 */
import type { Profile } from '@/lib/schemas';
import type { LifeArea } from '@/lib/life-map';
import { LIFE_AREAS } from '@/lib/life-map';

export type Venture = Profile;

export function getVenture(ventures: Venture[], id: string): Venture | null {
  return ventures.find((v) => v.id === id) ?? null;
}

/** Every agent serving a venture, across all its life areas. */
export function ventureAgentSet(ventures: Venture[], ventureId: string): Set<string> {
  const v = getVenture(ventures, ventureId);
  return new Set(v ? Object.values(v.areaAgents).flat() : []);
}

/** Which ventures an agent works for (shared infra agents serve all). */
export function venturesForAgent(ventures: Venture[], agentId: string): Venture[] {
  return ventures.filter((v) => ventureAgentSet(ventures, v.id).has(agentId));
}

/** Agents on one life area for one venture (the click-through interaction). */
export function ventureAreaAgents(ventures: Venture[], ventureId: string, areaId: string): string[] {
  return getVenture(ventures, ventureId)?.areaAgents[areaId] ?? [];
}

export function lifeAreaById(areaId: string): LifeArea | null {
  return LIFE_AREAS.find((a) => a.id === areaId) ?? null;
}
