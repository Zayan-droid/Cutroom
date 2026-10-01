import type { LangCode, SceneTransition } from './types.ts';
import type { Random } from './random.ts';
import {
  ARC,
  heroSpeaksAt,
  heroVariants,
  narrationVariants,
  renderHero,
  renderNarration,
  type BeatKey,
} from './localize.ts';

export interface PlannedLine {
  speaker: 'narrator' | 'hero';
  text: string;
}

export interface PlannedBeat {
  key: BeatKey;
  index: number;
  transition: SceneTransition;
  posterSeed: string;
  lines: PlannedLine[];
}

export interface PlannedStory {
  subject: string;
  beats: PlannedBeat[];
}

const TRANSITIONS: readonly SceneTransition[] = ['cut', 'fade', 'slide'];

/** Pull a short, readable subject phrase out of a free-form prompt. */
export function extractSubject(prompt: string): string {
  const cleaned = prompt.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'the hero';
  const firstSentence = cleaned.split(/[.,;:!?]/)[0];
  const beforeClause = firstSentence.replace(
    /\s+\b(?:who|that|which|where|when|while|because|and|but|with|without)\b.*/i,
    '',
  );
  const trimmed = beforeClause.replace(/^(?:a|an|the)\s+/i, '').trim();
  const words = (trimmed || cleaned).split(' ').filter(Boolean).slice(0, 6).join(' ');
  return words || cleaned;
}

/**
 * Seeded prompt → ordered beats, each a scene with one narration line and,
 * on the turn and climax, a line of character dialogue. Deterministic for a
 * given prompt + seed, so the same story replays for QA and demo recordings.
 */
export function planStory(prompt: string, lang: LangCode, random: Random): PlannedStory {
  const subject = extractSubject(prompt);
  const beats = ARC.map((key, index) => {
    const lines: PlannedLine[] = [
      {
        speaker: 'narrator',
        text: renderNarration(lang, key, Math.floor(random() * narrationVariants(lang, key)), subject),
      },
    ];
    if (heroSpeaksAt(key)) {
      const count = heroVariants(lang, key);
      if (count > 0) {
        lines.push({ speaker: 'hero', text: renderHero(lang, key, Math.floor(random() * count)) });
      }
    }
    const transition: SceneTransition = index === 0
      ? 'fade'
      : TRANSITIONS[Math.floor(random() * TRANSITIONS.length)];
    return { key, index, transition, posterSeed: `${subject}:${key}:${index}`, lines };
  });
  return { subject, beats };
}
