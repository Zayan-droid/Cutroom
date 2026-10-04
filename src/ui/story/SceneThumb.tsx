import { useEffect, useState } from 'react';
import type { StoryTimeline } from '../../story/types';
import { posterStyle } from '../../lib/media';
import { cn } from '../../lib/cn';
import { sceneThumbnails, type SceneImages } from './renderFrame';

const NO_IMAGES: SceneImages = new Map();

/**
 * Real frames for each scene. Redrawn only when what they show changes — not on
 * every progress tick while a story is still composing.
 */
export function useSceneThumbnails(timeline: StoryTimeline | null, images: SceneImages = NO_IMAGES): string[] {
  const [thumbs, setThumbs] = useState<string[]>([]);
  const key = timeline
    ? `${timeline.id}|${timeline.dialogue.length}|${timeline.scenes.map((s) => `${s.id}:${s.posterSeed}:${s.startMs}`).join(',')}`
    : '';
  useEffect(() => {
    if (!timeline) {
      setThumbs([]);
      return;
    }
    try {
      setThumbs(sceneThumbnails(timeline, images));
    } catch {
      setThumbs([]); // e.g. a cross-origin image tainted the canvas: fall back to swatches
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, images]);
  return thumbs;
}

/** A scene's frame; until it is drawn, the scene's color swatch holds its place. */
export function SceneThumb({ src, seed, className }: { src?: string; seed: string; className?: string }) {
  return src ? (
    <img src={src} alt="" aria-hidden className={cn('block aspect-video w-full object-cover', className)} />
  ) : (
    <span aria-hidden className={cn('block aspect-video w-full', className)} style={posterStyle(seed)} />
  );
}
