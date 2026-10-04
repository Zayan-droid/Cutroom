// RemoteStoryEngine — implements the frozen StoryEngine seam against the backend.
//
// Design: the local engine already produces a perfectly-timed, localized,
// subtitled, viseme-tracked timeline for free. The real upgrade is VISUALS — so
// this adapter reuses the pure `buildTimeline` for structure and replaces each
// scene's procedural poster with a real generated image from the backend's
// /image endpoint. If the backend is unreachable, scenes keep their posterSeed,
// so a story still composes end-to-end (graceful degradation by construction).
//
// Exactly one 'ready' snapshot is emitted (the story store charges on ready),
// preceded by 'composing' progress ticks.

import type { StoryEngine, StoryInput, StoryUpdate } from './contract.ts';
import type { StoryScene, StoryTimeline } from './types.ts';
import { buildTimeline, cloneTimeline, storyEngine } from './storyEngine.ts';
import { postImage } from '../lib/apiClient.ts';

let nonce = 0;
const freshIdPrefix = () =>
  `story-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${++nonce}`}`;

function scenePrompt(timeline: StoryTimeline, scene: StoryScene): string {
  const spoken = timeline.dialogue
    .filter((cue) => cue.sceneId === scene.id)
    .map((cue) => cue.text)
    .join(' ');
  return [timeline.prompt, spoken, 'cinematic still, consistent character and art style']
    .filter(Boolean)
    .join(', ');
}

async function enrich(full: StoryTimeline, onUpdate: StoryUpdate): Promise<void> {
  // First progress tick (buffered by the store until the skeleton is inserted).
  onUpdate(cloneTimeline({ ...full, status: 'composing', progress: 0.25, dialogue: [], subtitles: [] }));

  const scenes = full.scenes.map((scene) => ({ ...scene }));
  let done = 0;
  await Promise.all(
    scenes.map(async (scene) => {
      try {
        const { url } = await postImage({
          prompt: scenePrompt(full, scene),
          width: 768,
          height: 432,
          seed: scene.index + 1,
        });
        scene.assetUrl = url;
      } catch {
        // Leave assetUrl unset — the stage falls back to the procedural frame.
      }
      done += 1;
      onUpdate(
        cloneTimeline({
          ...full,
          scenes: scenes.map((s) => ({ ...s })),
          status: 'composing',
          progress: Math.min(0.95, 0.4 + 0.5 * (done / scenes.length)),
        }),
      );
    }),
  );

  onUpdate(cloneTimeline({ ...full, scenes, status: 'ready', progress: 1 }));
}

export const remoteStoryEngine: StoryEngine = {
  languages: () => storyEngine.languages(),
  quote: (input) => storyEngine.quote(input),
  compose(input: StoryInput, onUpdate: StoryUpdate): StoryTimeline {
    // buildTimeline throws synchronously on bad input; the store catches it.
    const full = buildTimeline(input, { idPrefix: freshIdPrefix() });
    const skeleton: StoryTimeline = {
      ...cloneTimeline(full),
      status: 'queued',
      progress: 0,
      dialogue: [],
      subtitles: [],
    };
    void enrich(full, onUpdate);
    return skeleton;
  },
};
