import type { StoryScene, StoryTimeline, Viseme } from '../../story/types.ts';
import { hashId, posterColors } from '../../lib/media.ts';
import { drawAvatar } from './Avatar.ts';
import { frameAt } from './playback.ts';

export type SceneImages = ReadonlyMap<string, HTMLImageElement>;
export const FRAME_WIDTH = 960;
export const FRAME_HEIGHT = 540;

function sceneFrame(ctx: CanvasRenderingContext2D, scene: StoryScene, time: number, images: SceneImages, reduced: boolean) {
  const [a, b] = posterColors(scene.posterSeed);
  const seed = hashId(scene.posterSeed);
  const gradient = ctx.createLinearGradient(0, 0, 960, 540);
  gradient.addColorStop(0, '#10162b'); gradient.addColorStop(0.55, a); gradient.addColorStop(1, b);
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 960, 540);
  const image = images.get(scene.id);
  if (image) {
    const scale = Math.max(960 / image.naturalWidth, 540 / image.naturalHeight);
    ctx.drawImage(image, (960 - image.naturalWidth * scale) / 2, (540 - image.naturalHeight * scale) / 2,
      image.naturalWidth * scale, image.naturalHeight * scale);
  } else {
    const drift = reduced ? 0 : Math.sin(time / 9000) * 10;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 35; i++) {
      const x = (seed + i * 173) % 960;
      const y = (seed + i * 71) % 260;
      ctx.globalAlpha *= 0.6;
      ctx.fillRect(x, y, 2, 2);
      ctx.globalAlpha /= 0.6;
    }
    ctx.fillStyle = '#f7e6ce';
    ctx.beginPath(); ctx.arc(270 + seed % 230 + drift, 130, 36, 0, Math.PI * 2); ctx.fill();
    for (let layer = 0; layer < 3; layer++) {
      ctx.fillStyle = ['#1b234b', '#151c36', '#0b1429'][layer];
      ctx.beginPath(); ctx.moveTo(0, 540);
      for (let x = 0; x <= 980; x += 20) {
        ctx.lineTo(x, 280 + layer * 63 + Math.sin(x / 150 + seed + layer) * 45 + drift * (layer + 1));
      }
      ctx.lineTo(960, 540); ctx.closePath(); ctx.fill();
    }
    // A small beacon anchors the procedural landscape.
    ctx.fillStyle = '#d6d3e8'; ctx.fillRect(185, 255, 25, 103);
    ctx.fillStyle = '#f9dcac'; ctx.fillRect(179, 243, 37, 18);
    ctx.fillStyle = '#242d4c';
    ctx.beginPath(); ctx.moveTo(173, 243); ctx.lineTo(197, 222); ctx.lineTo(222, 243); ctx.fill();
  }
}

function wrappedText(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  // Character wrapping also supports scripts without spaces and long words.
  for (const word of text.split(/(\s+)/u)) {
    if (ctx.measureText(line + word).width <= width) { line += word; continue; }
    if (line.trim()) lines.push(line.trim());
    line = '';
    for (const char of word) {
      if (ctx.measureText(line + char).width > width) { lines.push(line); line = ''; }
      line += char;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

export function drawStoryFrame(
  ctx: CanvasRenderingContext2D, timeline: StoryTimeline, time: number,
  options: { images: SceneImages; viseme?: Viseme; captions?: boolean; reducedMotion?: boolean },
) {
  const { scene, dialogue, subtitle } = frameAt(timeline, time);
  ctx.save();
  ctx.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  if (scene) {
    const index = timeline.scenes.indexOf(scene);
    const previous = timeline.scenes[index - 1];
    const progress = Math.max(0, Math.min(1, (time - scene.startMs) / 750));
    if (previous && progress < 1 && scene.transition !== 'cut' && !options.reducedMotion) {
      sceneFrame(ctx, previous, time, options.images, false);
      ctx.save();
      if (scene.transition === 'fade') ctx.globalAlpha = progress;
      else ctx.translate((1 - progress) * FRAME_WIDTH, 0);
      sceneFrame(ctx, scene, time, options.images, false);
      ctx.restore();
    } else sceneFrame(ctx, scene, time, options.images, !!options.reducedMotion);
    drawAvatar(ctx, options.viseme ?? 'rest', dialogue?.speaker ?? timeline.dialogue[0]?.speaker ?? 'Narrator');
    ctx.font = '600 16px system-ui, sans-serif'; ctx.fillStyle = '#f8fafc';
    ctx.fillText(`SCENE ${index + 1} / ${timeline.scenes.length}`, 32, 40);
  }
  if (options.captions && subtitle) {
    ctx.font = '500 25px system-ui, sans-serif';
    const lines = wrappedText(ctx, subtitle.text, 850);
    const lineHeight = 33;
    const height = lines.length * lineHeight + 24;
    ctx.fillStyle = 'rgba(7, 12, 25, 0.88)'; ctx.fillRect(35, 515 - height, 890, height);
    ctx.fillStyle = '#f8fafc'; ctx.textAlign = 'center';
    ctx.direction = /^(ar|fa|he|ur)(-|$)/i.test(timeline.lang) ? 'rtl' : 'ltr';
    lines.forEach((line, index) => ctx.fillText(line, 480, 515 - height + 34 + index * lineHeight));
  }
  ctx.restore();
}

/** Failures fall back to procedural frames; CORS protects the recording canvas. */
export async function loadSceneImages(timeline: StoryTimeline, signal: AbortSignal): Promise<Map<string, HTMLImageElement>> {
  const images = new Map<string, HTMLImageElement>();
  await Promise.all(timeline.scenes.filter((scene) => scene.assetUrl).map((scene) => new Promise<void>((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const finish = () => {
      clearTimeout(timeout); signal.removeEventListener('abort', abort);
      image.onload = null; image.onerror = null; resolve();
    };
    const abort = () => { finish(); image.src = ''; };
    const timeout = setTimeout(abort, 8000);
    signal.addEventListener('abort', abort, { once: true });
    image.onload = () => { if (!signal.aborted) images.set(scene.id, image); finish(); };
    image.onerror = finish;
    image.src = scene.assetUrl!;
  })));
  return images;
}
