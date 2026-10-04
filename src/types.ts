// ─────────────────────────────────────────────────────────────────────────────
// SHARED DATA MODEL — frozen in Step 0, consumed by all three workstreams.
// Verbatim from the TRD, with two agreed UI-facing extensions marked below.
// ─────────────────────────────────────────────────────────────────────────────

export type TakeStatus = 'queued' | 'generating' | 'ready' | 'failed';
/** What the engine generates. */
export type GenerationKind = 'draft' | 'render';
/** Every take: generated ones, plus edits made in the browser (extension, see EditRecipe). */
export type TakeKind = GenerationKind | 'edit';
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

  // Edit extension (store → UI): present on kind 'edit' only. The take keeps its
  // source's assetUrl untouched; the recipe is applied on playback and download.
  edit?: EditRecipe;

  createdAt: number;
}

/** Fixed picture shapes offered for cropping and reframing (width:height). */
export type FrameAspect = '16:9' | '9:16' | '1:1' | '4:5';

/**
 * A non-destructive edit of a take's picture, applied in this order:
 * trim → crop → reframe → upscale. Positions are fractions of the source
 * frame, so one recipe fits a clip at any pixel size.
 */
export interface EditRecipe {
  /** The kept part of the source frame, as fractions (0–1) of its width and height. */
  crop: { x: number; y: number; width: number; height: number };
  /** Shape lock used while cropping: free, the source's own shape, or a fixed ratio. */
  cropAspect: 'free' | 'original' | FrameAspect;
  /** Output shape: the crop's own shape, or a new ratio (reframe). */
  frame: 'crop' | FrameAspect;
  /** When the output shape differs from the crop: fill it (cut the overflow) or fit inside (add bars). */
  fit: 'fill' | 'fit';
  /** Where the picture sits along the axis that has room: 0 start, 0.5 centre, 1 end. */
  position: { x: number; y: number };
  /** What fills the bars when the picture is fitted inside the frame. */
  background: 'blur' | 'black' | 'white';
  /** Upscale target for the output's short side. */
  upscale: 'none' | '1080p' | '1440p' | '4k';
  /** Kept time range in seconds; null keeps the whole clip. */
  trim: { start: number; end: number } | null;
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
