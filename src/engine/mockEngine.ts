import type { GenerationKind, Intent, Nudge, Take } from '../types.ts';
import type { EngineUpdate, GenerationEngine } from './contract.ts';
import { pickAsset, variantFromAsset } from './assets.ts';
import { quote } from './cost.ts';
import { failureFor, type MockOutcome } from './failure.ts';
import { createRandom } from './random.ts';
import { planTiming } from './timing.ts';

export interface MockEngineOptions {
  /** Replays timings, assets and failures for the same ordered calls. IDs stay unique. */
  seed?: string | number;
  /** Force either terminal state for QA, or fail approximately one in eight jobs. */
  outcome?: MockOutcome;
  /** Scale all delays; 0 is useful in tests and still delivers updates asynchronously. */
  timeScale?: number;
}

let fallbackId = 0;
const copyTake = (take: Take): Take => ({ ...take, intent: { ...take.intent } });

function adjust(intent: Intent, nudge: Nudge): Intent {
  const add = (value: string, direction: string) => value.trim() ? `${value}; ${direction}` : direction;
  switch (nudge) {
    case 'too-fast': return { ...intent, motion: add(intent.motion, 'slower movement, longer holds') };
    case 'too-slow': return { ...intent, motion: add(intent.motion, 'faster movement, snappier pacing') };
    case 'wrong-character': return { ...intent, subject: add(intent.subject, 'alternate casting, keep the described role') };
    case 'more-cinematic': return { ...intent, style: add(intent.style, 'cinematic lighting and filmic framing') };
    case 'less-busy': return { ...intent, style: add(intent.style, 'simpler composition with fewer background elements') };
    default: throw new Error('Choose a supported adjustment.');
  }
}

/** Implements only the frozen seam. No knowledge of credit balances, UI, or persistence. */
export function createMockEngine(options: MockEngineOptions = {}): GenerationEngine {
  const outcome = options.outcome ?? 'random';
  const timeScale = options.timeScale ?? 1;
  if (!['random', 'success', 'failure'].includes(outcome)) {
    throw new Error('Mock engine outcome must be random, success, or failure.');
  }
  if (!Number.isFinite(timeScale) || timeScale < 0 || timeScale > 2147483647 / 10000) {
    throw new RangeError('Mock engine timeScale must be finite, non-negative, and fit within timer limits.');
  }
  const random = createRandom(options.seed);

  function enqueue(
    input: { prompt: string; intent: Intent; parentId: string | null; kind: GenerationKind; label: string; free?: boolean },
    onUpdate: EngineUpdate,
    variant: number,
  ): Take {
    const take: Take = {
      id: globalThis.crypto?.randomUUID?.() ?? `take-${Date.now().toString(36)}-${++fallbackId}`,
      parentId: input.parentId,
      kind: input.kind,
      status: 'queued',
      prompt: input.prompt,
      intent: { ...input.intent },
      cost: input.free ? 0 : quote(input.kind, input.intent),
      label: input.label,
      progress: 0,
      createdAt: Date.now(),
    };
    const timing = planTiming(input.kind, random, timeScale);
    const error = failureFor(random, outcome);
    const assetUrl = pickAsset(input.kind, take.intent, variant);

    // Each notification is an independent snapshot, including its nested intent.
    // Schedule relative to launch, avoiding cumulative drift and callback-order RNG.
    for (const tick of timing.ticks) {
      setTimeout(() => onUpdate({ ...copyTake(take), status: 'generating', progress: tick.progress }), tick.delayMs);
    }
    setTimeout(() => {
      onUpdate(error
        ? { ...copyTake(take), status: 'failed', progress: timing.ticks[timing.ticks.length - 1].progress, error }
        : { ...copyTake(take), status: 'ready', progress: 1, assetUrl });
    }, timing.durationMs);

    return copyTake(take);
  }

  function batch(prompt: string, intent: Intent, parentId: string | null, label: string, update: EngineUpdate): Take[] {
    const variant = Math.floor(random() * 4);
    return Array.from({ length: 4 }, (_, index) => enqueue({
      prompt, intent, parentId, kind: 'draft', label: `${label} ${index + 1}`,
    }, update, variant + index));
  }

  return {
    quote,
    generateDraft: ({ prompt, intent, parentId }, update) => batch(prompt, intent, parentId, 'Draft', update),
    renderFinal({ source }, update) {
      if (source.status !== 'ready' || source.kind !== 'draft') throw new Error('Choose a ready draft to render.');
      const variant = variantFromAsset(source.assetUrl) ?? Math.floor(random() * 4);
      return enqueue({
        prompt: source.prompt, intent: source.intent, parentId: source.id, kind: 'render', label: 'Render',
      }, update, variant);
    },
    remix({ source }, update) {
      if (source.status !== 'ready') throw new Error('Choose a ready take to remix.');
      return batch(source.prompt, source.intent, source.id, 'Variant', update);
    },
    retry({ failed }, update) {
      if (failed.status !== 'failed' || failed.kind === 'edit') throw new Error('Choose a failed take to reroll.');
      return enqueue({
        prompt: failed.prompt, intent: failed.intent, parentId: failed.id,
        kind: failed.kind, label: 'Reroll', free: true,
      }, update, Math.floor(random() * 4));
    },
    nudge({ source, nudge }, update) {
      if (source.status !== 'ready' && source.status !== 'failed') throw new Error('Choose a finished take to adjust.');
      return enqueue({
        prompt: source.prompt, intent: adjust(source.intent, nudge), parentId: source.id,
        kind: 'draft', label: 'Nudge', free: true,
      }, update, Math.floor(random() * 4));
    },
  };
}

// A declared-but-blank Vite var (`KEY=`) arrives as '' rather than undefined.
// Treat blank/whitespace as "unset" so an emptied knob falls back to its
// documented default, instead of hashing '' into a fixed seed, coercing
// Number('') to 0 (instant, no latency), or throwing on '' outcome at import.
// A genuine non-empty typo still fails loudly inside createMockEngine.
export function resolveEngineOptions(env?: Record<string, string | undefined>): MockEngineOptions {
  const clean = (value?: string): string | undefined => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };
  const timeScale = clean(env?.VITE_MOCK_ENGINE_TIME_SCALE);
  return {
    seed: clean(env?.VITE_MOCK_ENGINE_SEED),
    outcome: clean(env?.VITE_MOCK_ENGINE_OUTCOME) as MockOutcome | undefined,
    timeScale: timeScale === undefined ? undefined : Number(timeScale),
  };
}

// Vite supplies env in the app; standalone Node consumers see undefined here.
const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
export const mockEngine: GenerationEngine = createMockEngine(resolveEngineOptions(env));
