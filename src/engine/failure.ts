import type { Random } from './random.ts';

export type MockOutcome = 'random' | 'success' | 'failure';
export const FAILURE_RATE = 1 / 8;

const ERRORS = [
  'The generation worker timed out before finishing this take. Reroll for free.',
  'The frames could not be assembled into a complete clip. Reroll for free.',
  'The generation worker lost its connection while processing this take. Reroll for free.',
  'This take did not finish its quality check. Reroll for free or try an adjustment.',
] as const;

/** Decide once when queued, so concurrent completion order cannot affect a seed. */
export function failureFor(random: Random, outcome: MockOutcome): string | undefined {
  const roll = random();
  const message = ERRORS[Math.floor(random() * ERRORS.length)];
  return outcome === 'failure' || (outcome === 'random' && roll < FAILURE_RATE)
    ? message
    : undefined;
}
