import type { IntentKind, TakeKind } from '@/types';

// Cost model — a simple function of kind + intent (TRD). Drafts sit at zero;
// renders cost a few credits. Surfaced to the UI BEFORE every action.
// This mirrors what the engine's quote() will return; kept here so Part C can
// show cost before the real engine exists.
const RENDER_COST: Record<IntentKind, number> = {
  social: 4,
  ad: 6,
  cinematic: 8,
};

export function quote(kind: TakeKind, intent: IntentKind): number {
  return kind === 'draft' ? 0 : RENDER_COST[intent];
}

/** Human string for a cost chip. */
export function costLabel(cost: number): string {
  return cost === 0 ? 'Free' : `${cost} cr`;
}
