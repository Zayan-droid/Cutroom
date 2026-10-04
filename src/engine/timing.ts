import type { GenerationKind } from '../types.ts';
import type { Random } from './random.ts';

export interface ProgressTick {
  delayMs: number;
  progress: number;
}

export interface JobTiming {
  durationMs: number;
  ticks: ProgressTick[];
}

/** Total latency includes the queue. Progress remains below 1 until success. */
export function planTiming(kind: GenerationKind, random: Random, timeScale = 1): JobTiming {
  const draft = kind === 'draft';
  const duration = draft
    ? 1000 + Math.floor(random() * 2001)
    : 5000 + Math.floor(random() * 5001);
  const queued = draft
    ? 100 + Math.floor(random() * 151)
    : 150 + Math.floor(random() * 301);
  const tickCount = draft ? 4 : 16;

  return {
    durationMs: Math.round(duration * timeScale),
    ticks: Array.from({ length: tickCount }, (_, index) => ({
      delayMs: Math.round((queued + (duration - queued) * index / tickCount) * timeScale),
      progress: Number((0.04 + 0.91 * index / (tickCount - 1)).toFixed(3)),
    })),
  };
}
