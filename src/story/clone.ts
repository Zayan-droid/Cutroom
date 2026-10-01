import type { StoryTimeline } from './types.ts';

/** Deep copy so every onUpdate snapshot is independent and cannot be mutated. */
export function cloneTimeline(timeline: StoryTimeline): StoryTimeline {
  return {
    ...timeline,
    scenes: timeline.scenes.map((scene) => ({ ...scene })),
    dialogue: timeline.dialogue.map((cue) => ({
      ...cue,
      visemes: cue.visemes.map((mark) => ({ ...mark })),
    })),
    subtitles: timeline.subtitles.map((cue) => ({ ...cue })),
  };
}
