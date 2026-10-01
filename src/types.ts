// ─────────────────────────────────────────────────────────────────────────────
// SHARED DATA MODEL — frozen in Step 0, consumed by all three workstreams.
// Verbatim from the TRD, with two agreed UI-facing extensions marked below.
// ─────────────────────────────────────────────────────────────────────────────

export type TakeStatus = 'queued' | 'generating' | 'ready' | 'failed';
export type TakeKind = 'draft' | 'render';
export type IntentKind = 'social' | 'ad' | 'cinematic';

export interface Intent {
  kind: IntentKind;
  subject: string;
  style: string;
  motion: string;
  mood: string;
}

export interface Take {
  id: string;
  parentId: string | null; // null for a root take; set for a branch or variant
  kind: TakeKind;
  status: TakeStatus;
  prompt: string;
  intent: Intent;
  assetUrl?: string; // present when ready
  error?: string; // present when failed
  cost: number; // credits, shown before commit

  // Agreed Step-0 extensions (engine → store → UI):
  progress?: number; // 0..1 while generating/rendering — drives visible progress
  label?: string; // human label for the rail, e.g. "Draft 2", "Render", "Nudge"

  createdAt: number;
}

export interface Project {
  id: string;
  title: string;
  takes: Take[]; // flat list, forms a tree via parentId
  activeTakeId: string | null;
  credits: number; // simulated balance
  createdAt: number;
}

// Corrective nudges surfaced by the recovery UI. Each maps to one parameter change.
export type Nudge =
  | 'too-fast'
  | 'too-slow'
  | 'wrong-character'
  | 'more-cinematic'
  | 'less-busy';

export const INTENT_LABELS: Record<IntentKind, string> = {
  social: 'Social short',
  ad: 'Product ad',
  cinematic: 'Cinematic clip',
};

export const NUDGE_LABELS: Record<Nudge, string> = {
  'too-fast': 'Too fast',
  'too-slow': 'Too slow',
  'wrong-character': 'Wrong character',
  'more-cinematic': 'More cinematic',
  'less-busy': 'Less busy',
};
