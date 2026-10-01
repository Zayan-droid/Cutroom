import type { Intent, TakeKind } from '../types.ts';

const RENDER_CREDITS = { social: 4, ad: 6, cinematic: 8 } as const;

/** A quote, never a debit: the store charges only a successful paid render. */
export function quote(kind: TakeKind, intent: Intent): number {
  return kind === 'draft' ? 0 : RENDER_CREDITS[intent.kind];
}
