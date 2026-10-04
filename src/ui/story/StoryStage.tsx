import { useEffect, useRef } from 'react';
import type { StoryTimeline, Viseme } from '../../story/types';
import { frameAt } from './playback';
import { drawStoryFrame, FRAME_HEIGHT, FRAME_WIDTH, type SceneImages } from './renderFrame';
import { Subtitles } from './Subtitles';

export function StoryStage({ timeline, time, viseme, captions, images, reducedMotion }: {
  timeline: StoryTimeline; time: number; viseme: Viseme; captions: boolean;
  images: SceneImages; reducedMotion: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = ref.current?.getContext('2d');
    if (context) drawStoryFrame(context, timeline, time, { images, viseme, reducedMotion });
  }, [timeline, time, viseme, images, reducedMotion]);
  const frame = frameAt(timeline, time);
  return (
    <div className="relative overflow-hidden border border-rule bg-well">
      <div className="aspect-video">
        <canvas ref={ref} width={FRAME_WIDTH} height={FRAME_HEIGHT} className="block h-full w-full" role="img"
          aria-label={`${timeline.title}, scene ${(frame.scene?.index ?? 0) + 1} of ${timeline.scenes.length}`} />
      </div>
      <Subtitles cue={frame.subtitle} lang={timeline.lang} enabled={captions} />
    </div>
  );
}
