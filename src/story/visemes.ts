import type { Viseme, VisemeMark } from './types.ts';

// Vowel groups → open mouth shapes, in priority order. Latin + common accents.
const VOWEL_VISEMES: ReadonlyArray<readonly [RegExp, Viseme]> = [
  [/[aàáâãä]/, 'ah'],
  [/[eéèêëiíìîï]/, 'ee'],
  [/[oóòôõöuúùûü]/, 'oh'],
  [/[y]/, 'ee'],
];
const MAX_MARKS = 48;

function visemeForChar(ch: string): Viseme | null {
  if (/[mbp]/.test(ch)) return 'mbp';
  if (/[fv]/.test(ch)) return 'fv';
  for (const [pattern, viseme] of VOWEL_VISEMES) {
    if (pattern.test(ch)) return viseme;
  }
  return null;
}

/**
 * Estimate a mouth-shape timeline for one dialogue cue: one mark per mouth
 * movement, spaced evenly across the cue, ending on 'rest'. Deterministic and
 * capped, so Half 2 has a usable baseline before live TTS boundary events land.
 */
export function estimateVisemes(text: string, durationMs: number): VisemeMark[] {
  const sequence: Viseme[] = [];
  let previous: Viseme | null = null;
  for (const ch of text.toLowerCase()) {
    const viseme = visemeForChar(ch);
    if (!viseme) {
      previous = null; // a gap lets the same shape register again after it
      continue;
    }
    if (viseme !== previous) {
      sequence.push(viseme);
      previous = viseme;
    }
  }

  const span = Math.max(0, Math.round(durationMs));
  if (!sequence.length) return [{ viseme: 'rest', atMs: 0 }];

  const sampled = sequence.length > MAX_MARKS
    ? Array.from({ length: MAX_MARKS }, (_, i) => sequence[Math.floor((i * sequence.length) / MAX_MARKS)])
    : sequence;

  const marks: VisemeMark[] = sampled.map((viseme, i) => ({
    viseme,
    atMs: sampled.length > 1 ? Math.round((i * span) / sampled.length) : 0,
  }));
  marks.push({ viseme: 'rest', atMs: span });
  return marks;
}
