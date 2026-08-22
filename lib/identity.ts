/**
 * The operator's display name — the one identity string every page/seed
 * greeting reads instead of hardcoding a specific person's name. Override
 * with FOUNDER_NAME; defaults to a generic label so a fresh clone doesn't
 * greet a stranger by someone else's name.
 */
export const FOUNDER_NAME = process.env.FOUNDER_NAME?.trim() || 'Founder';
