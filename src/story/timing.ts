import type { DialogueCue, LangCode, StoryScene } from './types.ts';
import type { PlannedBeat } from './grammar.ts';

// Rough spoken-word pace per language (ms per word). German reads a touch slower.
const MS_PER_WORD: Record<string, number> = {
  'en-US': 360,
  'es-ES': 370,
  'fr-FR': 370,
  'de-DE': 410,
  'pt-BR': 370,
};
const DEFAULT_MS_PER_WORD = 380;
const TRAILING_PAUSE_MS = 250;
const MIN_CUE_MS = 900;
const MAX_CUE_MS = 12_000;

const LEAD_IN_MS = 500; // frame settles before the first line
const INTER_CUE_GAP_MS = 350; // breath between lines in a scene
const SCENE_TAIL_MS = 700; // hold on the frame after the last line

/** Estimate how long a line takes to speak — Half 2 refines this live from TTS. */
export function estimateSpeechMs(text: string, lang: LangCode): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const rate = MS_PER_WORD[lang] ?? DEFAULT_MS_PER_WORD;
  return Math.min(MAX_CUE_MS, Math.max(MIN_CUE_MS, Math.round(words * rate + TRAILING_PAUSE_MS)));
}

export interface LaidOutStory {
  totalMs: number;
  scenes: StoryScene[];
  dialogue: DialogueCue[]; // visemes left empty here; the engine fills them
}

/**
 * Lay beats out on a single clock: scenes run back-to-back from 0 with no gaps
 * or overlaps, every line sits inside its scene, and spare time is padded onto
 * each scene so the whole story lands on targetMs.
 */
export function layoutStory(
  beats: PlannedBeat[],
  lang: LangCode,
  idPrefix: string,
  targetMs: number,
): LaidOutStory {
  const content = beats.map((beat) => {
    const cueMs = beat.lines.map((line) => estimateSpeechMs(line.text, lang));
    const speech = cueMs.reduce((sum, ms) => sum + ms, 0);
    const gaps = INTER_CUE_GAP_MS * Math.max(0, beat.lines.length - 1);
    return { cueMs, sceneMs: LEAD_IN_MS + speech + gaps + SCENE_TAIL_MS };
  });

  const baseTotal = content.reduce((sum, beat) => sum + beat.sceneMs, 0);
  const slack = Math.max(0, targetMs - baseTotal);
  const durations = content.map((beat) =>
    Math.round(beat.sceneMs + (baseTotal > 0 ? (slack * beat.sceneMs) / baseTotal : slack / beats.length)),
  );

  let totalMs = durations.reduce((sum, ms) => sum + ms, 0);
  if (slack > 0) {
    // Absorb rounding drift into the last (longest-held) scene for an exact total.
    durations[durations.length - 1] += targetMs - totalMs;
    totalMs = targetMs;
  }

  const scenes: StoryScene[] = [];
  const dialogue: DialogueCue[] = [];
  let sceneStart = 0;
  let cueIndex = 0;

  beats.forEach((beat, i) => {
    const sceneId = `${idPrefix}-s${i}`;
    scenes.push({
      id: sceneId,
      index: i,
      posterSeed: beat.posterSeed,
      startMs: sceneStart,
      durationMs: durations[i],
      transition: beat.transition,
    });

    let cueStart = sceneStart + LEAD_IN_MS;
    beat.lines.forEach((line, li) => {
      const durationMs = content[i].cueMs[li];
      dialogue.push({
        id: `${idPrefix}-c${cueIndex}`,
        sceneId,
        speaker: line.speaker,
        text: line.text,
        lang,
        startMs: cueStart,
        durationMs,
        visemes: [],
      });
      cueStart += durationMs + INTER_CUE_GAP_MS;
      cueIndex += 1;
    });

    sceneStart += durations[i];
  });

  return { totalMs, scenes, dialogue };
}
