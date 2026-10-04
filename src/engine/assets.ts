import type { GenerationKind, Intent } from '../types';

// Literal URLs let Vite fingerprint and bundle every clip for offline playback.
// Draft/render entries share a scene and variant so committing keeps its look.
const clips = {
  social: {
    draft: [
      new URL('../assets/social-1-draft.mp4', import.meta.url).href,
      new URL('../assets/social-2-draft.mp4', import.meta.url).href,
      new URL('../assets/social-3-draft.mp4', import.meta.url).href,
      new URL('../assets/social-4-draft.mp4', import.meta.url).href,
    ],
    render: [
      new URL('../assets/social-1-render.mp4', import.meta.url).href,
      new URL('../assets/social-2-render.mp4', import.meta.url).href,
      new URL('../assets/social-3-render.mp4', import.meta.url).href,
      new URL('../assets/social-4-render.mp4', import.meta.url).href,
    ],
  },
  ad: {
    draft: [
      new URL('../assets/ad-1-draft.mp4', import.meta.url).href,
      new URL('../assets/ad-2-draft.mp4', import.meta.url).href,
      new URL('../assets/ad-3-draft.mp4', import.meta.url).href,
      new URL('../assets/ad-4-draft.mp4', import.meta.url).href,
    ],
    render: [
      new URL('../assets/ad-1-render.mp4', import.meta.url).href,
      new URL('../assets/ad-2-render.mp4', import.meta.url).href,
      new URL('../assets/ad-3-render.mp4', import.meta.url).href,
      new URL('../assets/ad-4-render.mp4', import.meta.url).href,
    ],
  },
  cinematic: {
    draft: [
      new URL('../assets/cinematic-1-draft.mp4', import.meta.url).href,
      new URL('../assets/cinematic-2-draft.mp4', import.meta.url).href,
      new URL('../assets/cinematic-3-draft.mp4', import.meta.url).href,
      new URL('../assets/cinematic-4-draft.mp4', import.meta.url).href,
    ],
    render: [
      new URL('../assets/cinematic-1-render.mp4', import.meta.url).href,
      new URL('../assets/cinematic-2-render.mp4', import.meta.url).href,
      new URL('../assets/cinematic-3-render.mp4', import.meta.url).href,
      new URL('../assets/cinematic-4-render.mp4', import.meta.url).href,
    ],
  },
} satisfies Record<Intent['kind'], Record<GenerationKind, readonly string[]>>;

/** Zero-based variants wrap in either direction; invalid numbers choose the first. */
export function pickAsset(kind: GenerationKind, intent: Intent, variant: number): string {
  const choices = clips[intent.kind][kind];
  const index = Number.isFinite(variant) ? Math.trunc(variant) : 0;
  return choices[((index % choices.length) + choices.length) % choices.length];
}

/** Recover the scene choice when promoting a selected draft to a render. */
export function variantFromAsset(assetUrl: string | undefined): number | undefined {
  if (!assetUrl) return undefined;
  for (const byKind of Object.values(clips)) {
    for (const choices of Object.values(byKind)) {
      const index = choices.indexOf(assetUrl);
      if (index !== -1) return index;
    }
  }
  return undefined;
}
