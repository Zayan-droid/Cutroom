// ─────────────────────────────────────────────────────────────────────────────
// STORY ENGINE SEAM — frozen in Step 0, co-owned by both halves.
// The engine returns a skeleton timeline SYNCHRONOUSLY (storyboard for optimistic
// UI), then pushes each state change via onUpdate — exactly like GenerationEngine.
// ─────────────────────────────────────────────────────────────────────────────

import type { LangCode, StoryTimeline } from './types.ts';

export interface StoryInput {
  prompt: string;
  lang: LangCode;
  targetMs?: number; // defaults to 180_000 (3:00)
}

/** Each call receives an independent, immutable snapshot of the whole timeline. */
export type StoryUpdate = (timeline: StoryTimeline) => void;

export interface StoryEngine {
  /** Languages the engine has template packs (and likely device voices) for. */
  languages(): LangCode[];

  /** Cost-before-the-click. Pure, synchronous, consumes no randomness. */
  quote(input: StoryInput): number;

  /**
   * Returns a 'queued' skeleton (scenes laid out, dialogue + subtitles empty)
   * immediately, then drives it to 'ready' (fully populated) or 'failed'.
   */
  compose(input: StoryInput, onUpdate: StoryUpdate): StoryTimeline;
}
