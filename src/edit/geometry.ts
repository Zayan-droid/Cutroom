import type { EditRecipe, FrameAspect } from '../types.ts';

// Pure picture math for the editor: crop handles, reframing, upscale sizes, and
// the render plan both the preview and the exporter draw from. No DOM.

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const FRAME_ASPECTS: Record<FrameAspect, number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1,
  '4:5': 4 / 5,
};

export type UpscaleTarget = EditRecipe['upscale'];

/** Short side of each upscale target, in pixels. */
export const UPSCALE_SHORT_SIDE: Record<Exclude<UpscaleTarget, 'none'>, number> = {
  '1080p': 1080,
  '1440p': 1440,
  '4k': 2160,
};

/** Outputs never exceed UHD on their long side. */
export const MAX_OUTPUT_LONG_SIDE = 3840;

/** Smallest crop on either side, in source pixels (or the whole side, if smaller). */
export const MIN_CROP_PX = 32;

/** Shapes closer than this (relative) are treated as the same shape. */
const SAME_SHAPE = 0.002;

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Video encoders need even dimensions; never below 2. */
export const even = (value: number) => Math.max(2, 2 * Math.round(value / 2));

export function sameShape(a: number, b: number): boolean {
  return Math.abs(a / b - 1) < SAME_SHAPE;
}

/**
 * The largest rect of `aspect` (width / height) inside `bounds`, slid along its
 * free axis by `position` (0 = left/top, 1 = right/bottom).
 */
export function placeAspect(bounds: Rect, aspect: number, position: Point = { x: 0.5, y: 0.5 }): Rect {
  if (aspect >= bounds.width / bounds.height) {
    const height = bounds.width / aspect;
    return { x: bounds.x, y: bounds.y + (bounds.height - height) * clamp(position.y, 0, 1), width: bounds.width, height };
  }
  const width = bounds.height * aspect;
  return { x: bounds.x + (bounds.width - width) * clamp(position.x, 0, 1), y: bounds.y, width, height: bounds.height };
}

// ── Crop (source pixels) ──────────────────────────────────────────────────────

export type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export function cropToPixels(crop: EditRecipe['crop'], size: Size): Rect {
  return { x: crop.x * size.width, y: crop.y * size.height, width: crop.width * size.width, height: crop.height * size.height };
}

export function cropToFractions(rect: Rect, size: Size): EditRecipe['crop'] {
  return { x: rect.x / size.width, y: rect.y / size.height, width: rect.width / size.width, height: rect.height / size.height };
}

/** The ratio a crop lock holds (width / height), or null for a free crop. */
export function cropLockAspect(lock: EditRecipe['cropAspect'], size: Size): number | null {
  if (lock === 'free') return null;
  if (lock === 'original') return size.width / size.height;
  return FRAME_ASPECTS[lock];
}

const minSide = (size: Size) => ({ width: Math.min(MIN_CROP_PX, size.width), height: Math.min(MIN_CROP_PX, size.height) });

/** Whole pixels, inside the frame, at least the minimum size. */
export function clampCrop(rect: Rect, size: Size): Rect {
  const min = minSide(size);
  const width = clamp(Math.round(rect.width), min.width, size.width);
  const height = clamp(Math.round(rect.height), min.height, size.height);
  return {
    x: clamp(Math.round(rect.x), 0, size.width - width),
    y: clamp(Math.round(rect.y), 0, size.height - height),
    width,
    height,
  };
}

/** The largest crop of `aspect` in the frame, centred where the current crop is. */
export function lockCrop(rect: Rect, size: Size, aspect: number | null): Rect {
  if (aspect === null) return clampCrop(rect, size);
  const full = placeAspect({ x: 0, y: 0, ...size }, aspect);
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return clampCrop({ x: cx - full.width / 2, y: cy - full.height / 2, width: full.width, height: full.height }, size);
}

/** Drag the whole crop; it stops at the frame's edges. */
export function moveCrop(rect: Rect, dx: number, dy: number, size: Size): Rect {
  return clampCrop({ ...rect, x: rect.x + dx, y: rect.y + dy }, size);
}

/**
 * Drag one handle by (dx, dy) source pixels from where the drag started.
 * Free crops move the grabbed edges. Locked crops keep their ratio: a corner
 * scales from the opposite corner, an edge from the opposite edge (sliding
 * along the other axis to stay inside the frame).
 */
export function resizeCrop(start: Rect, handle: CropHandle, dx: number, dy: number, size: Size, aspect: number | null): Rect {
  const min = minSide(size);
  const west = handle.includes('w');
  const east = handle.includes('e');
  const north = handle.includes('n');
  const south = handle.includes('s');
  const left = start.x;
  const top = start.y;
  const right = start.x + start.width;
  const bottom = start.y + start.height;

  if (aspect === null) {
    const l = west ? clamp(left + dx, 0, right - min.width) : left;
    const r = east ? clamp(right + dx, left + min.width, size.width) : right;
    const t = north ? clamp(top + dy, 0, bottom - min.height) : top;
    const b = south ? clamp(bottom + dy, top + min.height, size.height) : bottom;
    return clampCrop({ x: l, y: t, width: r - l, height: b - t }, size);
  }

  const minWidth = Math.max(min.width, min.height * aspect);
  const horizontal = east || west;
  const vertical = north || south;

  if (horizontal && vertical) {
    // Corner: the opposite corner stays put; follow whichever axis moved further.
    const wantW = start.width + (east ? dx : -dx);
    const wantH = start.height + (south ? dy : -dy);
    const roomW = east ? size.width - left : right;
    const roomH = south ? size.height - top : bottom;
    const width = clamp(Math.max(wantW, wantH * aspect), minWidth, Math.min(roomW, roomH * aspect));
    const height = width / aspect;
    return clampCrop({ x: east ? left : right - width, y: south ? top : bottom - height, width, height }, size);
  }

  if (horizontal) {
    // Side edge: the opposite edge stays put; the height follows, centred, sliding to stay inside.
    const room = east ? size.width - left : right;
    const width = clamp(start.width + (east ? dx : -dx), minWidth, Math.min(room, size.height * aspect));
    const height = width / aspect;
    const cy = top + start.height / 2;
    return clampCrop({ x: east ? left : right - width, y: clamp(cy - height / 2, 0, size.height - height), width, height }, size);
  }

  const minHeight = minWidth / aspect;
  const room = south ? size.height - top : bottom;
  const height = clamp(start.height + (south ? dy : -dy), minHeight, Math.min(room, size.width / aspect));
  const width = height * aspect;
  const cx = left + start.width / 2;
  return clampCrop({ x: clamp(cx - width / 2, 0, size.width - width), y: south ? top : bottom - height, width, height }, size);
}

/** Exact size from number fields; a locked crop derives the other side. Keeps its corner if it can. */
export function setCropSize(rect: Rect, next: Partial<Size>, size: Size, aspect: number | null): Rect {
  let width = next.width ?? rect.width;
  let height = next.height ?? rect.height;
  if (aspect !== null) {
    if (next.width !== undefined) height = width / aspect;
    else if (next.height !== undefined) width = height * aspect;
    // Shrink both sides together if the frame can't hold the requested size.
    const fit = Math.min(1, size.width / width, size.height / height);
    width *= fit;
    height *= fit;
  }
  return clampCrop({ x: rect.x, y: rect.y, width, height }, size);
}

/** Exact position from number fields. */
export function setCropOrigin(rect: Rect, next: Partial<Point>, size: Size): Rect {
  return clampCrop({ ...rect, x: next.x ?? rect.x, y: next.y ?? rect.y }, size);
}

export function isFullFrame(crop: EditRecipe['crop'], size: Size): boolean {
  const px = cropToPixels(crop, size);
  return px.x < 0.5 && px.y < 0.5 && px.width > size.width - 0.5 && px.height > size.height - 0.5;
}

const NAMED_ASPECTS: Array<[number, string]> = [
  [16 / 9, '16:9'], [9 / 16, '9:16'], [1, '1:1'], [4 / 5, '4:5'], [5 / 4, '5:4'], [4 / 3, '4:3'],
  [3 / 4, '3:4'], [3 / 2, '3:2'], [2 / 3, '2:3'], [2, '2:1'], [1 / 2, '1:2'], [21 / 9, '21:9'], [2.39, '2.39:1'],
];

/** "16:9" for familiar shapes (within 1%), else "1.85:1" / "1:1.33". */
export function describeAspect(width: number, height: number): string {
  const ratio = width / height;
  for (const [value, name] of NAMED_ASPECTS) if (Math.abs(ratio / value - 1) < 0.01) return name;
  return ratio >= 1 ? `${ratio.toFixed(2)}:1` : `1:${(1 / ratio).toFixed(2)}`;
}

// ── Render plan ───────────────────────────────────────────────────────────────

export type PlanBackground = { kind: 'blur'; src: Rect } | { kind: 'color'; color: 'black' | 'white' };

/** Everything a renderer needs to draw one frame of an edit. */
export interface RenderPlan {
  /** Output frame size in pixels (even, for video encoders). */
  width: number;
  height: number;
  /** The region of the source drawn as the picture, in source pixels. */
  src: Rect;
  /** Where that picture lands in the output frame, in output pixels. */
  dst: Rect;
  /** What fills the frame behind a fitted picture; null when the picture fills the frame. */
  background: PlanBackground | null;
  /** Output pixels per source pixel (above 1 means the picture is enlarged). */
  scale: number;
  /** How much the upscale setting enlarged the frame (1 when it is off or has no effect). */
  upscale: number;
}

function upscaleFactor(base: Size, target: UpscaleTarget): number {
  if (target === 'none') return 1;
  const short = Math.min(base.width, base.height);
  const long = Math.max(base.width, base.height);
  const factor = Math.min(UPSCALE_SHORT_SIDE[target] / short, MAX_OUTPUT_LONG_SIDE / long);
  return factor > 1 ? factor : 1;
}

/** Trim → crop → reframe → upscale, resolved for a source of `size` pixels. */
export function planEdit(recipe: EditRecipe, size: Size): RenderPlan {
  const crop = clampCrop(cropToPixels(recipe.crop, size), size);
  const cropAspect = crop.width / crop.height;
  const frameAspect = recipe.frame === 'crop' ? cropAspect : FRAME_ASPECTS[recipe.frame];

  let src = crop;
  let base: Size = { width: crop.width, height: crop.height };
  let dst: Rect = { x: 0, y: 0, ...base };
  let background: PlanBackground | null = null;

  if (!sameShape(frameAspect, cropAspect)) {
    if (recipe.fit === 'fill') {
      src = placeAspect(crop, frameAspect, recipe.position);
      base = { width: src.width, height: src.height };
      dst = { x: 0, y: 0, ...base };
    } else {
      // Fit inside: the frame grows around the whole crop, at the crop's own pixel size.
      base = cropAspect > frameAspect
        ? { width: crop.width, height: crop.width / frameAspect }
        : { width: crop.height * frameAspect, height: crop.height };
      dst = {
        x: (base.width - crop.width) * clamp(recipe.position.x, 0, 1),
        y: (base.height - crop.height) * clamp(recipe.position.y, 0, 1),
        width: crop.width,
        height: crop.height,
      };
      background = recipe.background === 'blur'
        ? { kind: 'blur', src: placeAspect(crop, frameAspect) }
        : { kind: 'color', color: recipe.background };
    }
  }

  const upscale = upscaleFactor(base, recipe.upscale);
  const width = even(base.width * upscale);
  const height = even(base.height * upscale);
  const kx = width / base.width;
  const ky = height / base.height;
  const out: Rect = { x: dst.x * kx, y: dst.y * ky, width: dst.width * kx, height: dst.height * ky };
  return { width, height, src, dst: out, background, scale: out.width / src.width, upscale };
}

export interface UpscaleChoice {
  id: UpscaleTarget;
  width: number;
  height: number;
  /** Enlargement over the un-upscaled output. */
  factor: number;
  /** False when the target would not enlarge this output. */
  available: boolean;
}

/** Every upscale target for this recipe and source, with the size it produces. */
export function upscaleChoices(recipe: EditRecipe, size: Size): UpscaleChoice[] {
  const targets: UpscaleTarget[] = ['none', '1080p', '1440p', '4k'];
  return targets.map((id) => {
    const plan = planEdit({ ...recipe, upscale: id }, size);
    return { id, width: plan.width, height: plan.height, factor: plan.upscale, available: id === 'none' || plan.upscale > 1 };
  });
}

// ── Views (preview canvases) ──────────────────────────────────────────────────

/** A plan for showing the source as-is (the crop tool draws over it). */
export function sourcePlan(size: Size): RenderPlan {
  const full = { x: 0, y: 0, width: size.width, height: size.height };
  return { width: size.width, height: size.height, src: full, dst: full, background: null, scale: 1, upscale: 1 };
}

/** Where a frame of `content` aspect sits when contained in `box` (letterboxed, centred). */
export function containRect(content: Size, box: Size): Rect {
  const scale = Math.min(box.width / content.width, box.height / content.height);
  const width = content.width * scale;
  const height = content.height * scale;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}

// ── Trim ──────────────────────────────────────────────────────────────────────

/** Shortest clip a trim can leave, in seconds. */
export const MIN_TRIM_SECONDS = 0.2;

/** The kept time range for a clip of `duration` seconds. */
export function trimRange(trim: EditRecipe['trim'], duration: number): { start: number; end: number } {
  const total = Number.isFinite(duration) && duration > 0 ? duration : 0;
  if (!trim || total === 0) return { start: 0, end: total };
  const minimum = Math.min(MIN_TRIM_SECONDS, total);
  const end = clamp(trim.end, minimum, total);
  const start = clamp(trim.start, 0, end - minimum);
  return { start, end };
}

/** "0:02.5": minutes, seconds, and tenths (or more decimals) for short clips. */
export function formatClock(seconds: number, decimals = 1): string {
  const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  const minutes = Math.floor(rounded / 60);
  const rest = rounded - minutes * 60;
  const [whole, fraction] = rest.toFixed(decimals).split('.');
  return `${minutes}:${whole.padStart(2, '0')}${fraction ? `.${fraction}` : ''}`;
}
