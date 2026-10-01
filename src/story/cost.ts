import type { StoryInput } from './contract.ts';

export const DEFAULT_TARGET_MS = 180_000; // 3:00
export const MIN_TARGET_MS = 10_000;
export const MAX_TARGET_MS = 600_000; // 10:00
export const CREDITS_PER_MINUTE = 4;

/** Clamp a requested length to a sane window; invalid input falls back to 3:00. */
export function resolveTargetMs(targetMs?: number): number {
  if (targetMs === undefined || !Number.isFinite(targetMs) || targetMs <= 0) {
    return DEFAULT_TARGET_MS;
  }
  return Math.min(MAX_TARGET_MS, Math.max(MIN_TARGET_MS, Math.round(targetMs)));
}

/** A quote, never a debit: the store charges only a story that reaches 'ready'. */
export function quoteStory(input: StoryInput): number {
  const minutes = resolveTargetMs(input.targetMs) / 60_000;
  return Math.max(1, Math.round(minutes * CREDITS_PER_MINUTE));
}
