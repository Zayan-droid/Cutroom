import type { DialogueCue, StoryTimeline, SubtitleCue } from './types.ts';
import type { StoryEngine, StoryInput, StoryUpdate } from './contract.ts';
import { createRandom } from './random.ts';
import { planStory } from './grammar.ts';
import { isSupported, LANGUAGES, storyTitle } from './localize.ts';
import { layoutStory } from './timing.ts';
import { estimateVisemes } from './visemes.ts';
import { buildSubtitles } from './subtitles.ts';
import { quoteStory, resolveTargetMs } from './cost.ts';
import { storyFailure, type StoryOutcome } from './failure.ts';
import { cloneTimeline } from './clone.ts';

export interface BuildOptions {
  idPrefix: string;
  seed?: string | number;
}

/**
 * Pure, deterministic builder: the same prompt + seed + idPrefix always produce
 * an identical, fully-populated timeline. The engine reveals this progressively;
 * tests assert against it directly.
 */
export function buildTimeline(input: StoryInput, opts: BuildOptions): StoryTimeline {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error('A story needs a prompt.');
  if (!isSupported(input.lang)) throw new Error(`Unsupported language: ${input.lang}`);

  const targetMs = resolveTargetMs(input.targetMs);
  // Default seed derives from the content, so the same prompt tells the same story.
  const random = createRandom(opts.seed ?? `${prompt}|${input.lang}|${targetMs}`);
  const { subject, beats } = planStory(prompt, input.lang, random);
  const { totalMs, scenes, dialogue } = layoutStory(beats, input.lang, opts.idPrefix, targetMs);

  const withVisemes: DialogueCue[] = dialogue.map((cue) => ({
    ...cue,
    visemes: estimateVisemes(cue.text, cue.durationMs),
  }));
  const subtitles: SubtitleCue[] = buildSubtitles(withVisemes, opts.idPrefix);

  return {
    id: opts.idPrefix,
    title: storyTitle(input.lang, subject),
    prompt,
    lang: input.lang,
    status: 'ready',
    progress: 1,
    totalMs,
    scenes,
    dialogue: withVisemes,
    subtitles,
  };
}

/** The storyboard shown the instant compose() is called: scenes, no script yet. */
function skeletonFrom(full: StoryTimeline): StoryTimeline {
  return { ...full, status: 'queued', progress: 0, dialogue: [], subtitles: [] };
}

export interface StoryEngineOptions {
  /** Replays job latency and failure for the same seed. */
  seed?: string | number;
  /** Force a terminal outcome for QA, or fail ~1 in 8 by default. */
  outcome?: StoryOutcome;
  /** Scale compose latency; 0 is useful in tests and still delivers asynchronously. */
  timeScale?: number;
}

let nonce = 0;

function freshIdPrefix(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `story-${uuid ?? `${Date.now().toString(36)}-${++nonce}`}`;
}

/** Implements only the frozen seam. No knowledge of credits, store, or UI. */
export function createStoryEngine(options: StoryEngineOptions = {}): StoryEngine {
  const outcome = options.outcome ?? 'random';
  if (!['random', 'success', 'failure'].includes(outcome)) {
    throw new Error('Story outcome must be random, success, or failure.');
  }
  const timeScale = options.timeScale ?? 1;
  if (!Number.isFinite(timeScale) || timeScale < 0 || timeScale > 2147483647 / 10000) {
    throw new RangeError('Story timeScale must be finite, non-negative, and fit within timer limits.');
  }
  // Content is deterministic from the prompt; the job's latency/failure use this seed.
  const jobRandom = createRandom(options.seed);
  const contentSeed = (input: StoryInput): string | number | undefined =>
    options.seed === undefined ? undefined : `${options.seed}|${input.prompt}|${input.lang}`;

  return {
    languages: () => [...LANGUAGES],
    quote: (input) => quoteStory(input),
    compose(input, onUpdate: StoryUpdate) {
      const idPrefix = freshIdPrefix();
      const full = buildTimeline(input, { idPrefix, seed: contentSeed(input) });
      const error = storyFailure(jobRandom, outcome);
      const skeleton = skeletonFrom(full);

      const steps = 6;
      const durationMs = Math.round((2000 + Math.floor(jobRandom() * 2001)) * timeScale);
      for (let step = 1; step <= steps; step++) {
        const progress = Number((0.08 + 0.8 * (step / steps)).toFixed(3));
        setTimeout(
          () => onUpdate(cloneTimeline({ ...skeleton, status: 'composing', progress })),
          Math.round((durationMs * step) / (steps + 1)),
        );
      }
      setTimeout(() => {
        onUpdate(error
          ? cloneTimeline({ ...skeleton, status: 'failed', progress: 1, error })
          : cloneTimeline({ ...full, status: 'ready', progress: 1 }));
      }, durationMs);

      return cloneTimeline(skeleton);
    },
  };
}

// A declared-but-blank Vite var (`KEY=`) arrives as '' rather than undefined;
// treat blank/whitespace as "unset" so an emptied knob falls back to its default.
export function resolveStoryOptions(env?: Record<string, string | undefined>): StoryEngineOptions {
  const clean = (value?: string): string | undefined => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };
  const timeScale = clean(env?.VITE_STORY_ENGINE_TIME_SCALE);
  return {
    seed: clean(env?.VITE_STORY_ENGINE_SEED),
    outcome: clean(env?.VITE_STORY_ENGINE_OUTCOME) as StoryOutcome | undefined,
    timeScale: timeScale === undefined ? undefined : Number(timeScale),
  };
}

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
export const storyEngine: StoryEngine = createStoryEngine(resolveStoryOptions(env));

export { cloneTimeline };
