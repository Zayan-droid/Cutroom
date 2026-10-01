import type { Random } from './random.ts';

export type StoryOutcome = 'random' | 'success' | 'failure';
export const STORY_FAILURE_RATE = 1 / 8;

const ERRORS = [
  'The story planner timed out before every scene was written. Try again.',
  'The dialogue pass could not be assembled into a complete script. Try again.',
  'The narration track failed its language check. Try again or pick another language.',
  'The story worker lost its connection while composing. Try again.',
] as const;

/** Decide once when composing starts, so a seed reproduces the same outcome. */
export function storyFailure(random: Random, outcome: StoryOutcome): string | undefined {
  const roll = random();
  const message = ERRORS[Math.floor(random() * ERRORS.length)];
  return outcome === 'failure' || (outcome === 'random' && roll < STORY_FAILURE_RATE)
    ? message
    : undefined;
}
