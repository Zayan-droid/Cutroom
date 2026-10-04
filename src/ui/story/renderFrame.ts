import type { StoryScene, StoryTimeline, Viseme } from '../../story/types.ts';
import { hashId, mixHex, posterColors, sceneLayout, SCENE_LIGHT } from '../../lib/media.ts';
import { drawAvatar } from './Avatar.ts';
import { frameAt } from './playback.ts';

export type SceneImages = ReadonlyMap<string, HTMLImageElement>;
export const FRAME_WIDTH = 960;
export const FRAME_HEIGHT = 540;

// Frame text is burned into exported video, so it uses fixed colors and the
// UI typeface (with a system fallback while the web font loads).
const FRAME_INK = '#1A1814';
const FRAME_PAPER = '#F7F3EA';
const FRAME_FONT = 'Archivo, system-ui, sans-serif';

/** Flat daylight landscape — the same sky, ridge, and light the scene thumbnail shows. */
function sceneFrame(ctx: CanvasRenderingContext2D, scene: StoryScene, time: number, images: SceneImages, reduced: boolean) {
  const [sky, land] = posterColors(scene.posterSeed);
  const seed = hashId(scene.posterSeed);
  const layout = sceneLayout(scene.posterSeed);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 960, 540);
  const image = images.get(scene.id);
  if (image) {
    const scale = Math.max(960 / image.naturalWidth, 540 / image.naturalHeight);
    ctx.drawImage(image, (960 - image.naturalWidth * scale) / 2, (540 - image.naturalHeight * scale) / 2,
      image.naturalWidth * scale, image.naturalHeight * scale);
  } else {
    const drift = reduced ? 0 : Math.sin(time / 9000) * 10;
    ctx.fillStyle = SCENE_LIGHT;
    ctx.beginPath(); ctx.arc(layout.lightX / 100 * 960 + drift, layout.lightY / 100 * 540, 34, 0, Math.PI * 2); ctx.fill();
    const layers = [mixHex(sky, land, 0.45), land, mixHex(land, '#000000', 0.28)];
    const base = [layout.ridge, layout.horizon + 4, layout.horizon + 16].map((pct) => pct / 100 * 540);
    for (let layer = 0; layer < 3; layer++) {
      ctx.fillStyle = layers[layer];
      ctx.beginPath(); ctx.moveTo(0, 540);
      for (let x = 0; x <= 980; x += 20) {
        ctx.lineTo(x, base[layer] + Math.sin(x / (170 - layer * 30) + seed + layer) * (26 - layer * 6) + drift * (layer + 1) * 0.6);
      }
      ctx.lineTo(960, 540); ctx.closePath(); ctx.fill();
    }
    // A small lighthouse anchors the procedural landscape.
    const towerBase = base[1] + 8;
    ctx.fillStyle = FRAME_PAPER; ctx.fillRect(185, towerBase - 103, 25, 103);
    ctx.fillStyle = mixHex(land, '#000000', 0.35); ctx.fillRect(185, towerBase - 70, 25, 12);
    ctx.fillStyle = SCENE_LIGHT; ctx.fillRect(179, towerBase - 115, 37, 14);
    ctx.fillStyle = mixHex(land, '#000000', 0.4);
    ctx.beginPath(); ctx.moveTo(173, towerBase - 115); ctx.lineTo(197, towerBase - 136); ctx.lineTo(222, towerBase - 115); ctx.fill();
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
  ctx.fillStyle = FRAME_INK; ctx.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
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
    // Scene marker on a solid plate so it reads over any sky.
    const marker = `Scene ${index + 1} of ${timeline.scenes.length}`;
    ctx.font = `600 17px ${FRAME_FONT}`;
    const markerWidth = ctx.measureText(marker).width;
    ctx.fillStyle = 'rgba(20, 18, 15, 0.78)'; ctx.fillRect(24, 22, markerWidth + 24, 32);
    ctx.fillStyle = FRAME_PAPER; ctx.fillText(marker, 36, 44);
  }
  if (options.captions && subtitle) {
    ctx.font = `500 25px ${FRAME_FONT}`;
    const lines = wrappedText(ctx, subtitle.text, 850);
    const lineHeight = 33;
    const height = lines.length * lineHeight + 24;
    ctx.fillStyle = 'rgba(20, 18, 15, 0.84)'; ctx.fillRect(35, 515 - height, 890, height);
    ctx.fillStyle = FRAME_PAPER; ctx.textAlign = 'center';
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
