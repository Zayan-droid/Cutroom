import type { EditRecipe, FrameAspect } from '../types.ts';
import {
  FRAME_ASPECTS,
  MIN_TRIM_SECONDS,
  formatClock,
  isFullFrame,
  planEdit,
  sameShape,
  trimRange,
  cropToPixels,
  clampCrop,
  type Size,
} from './geometry.ts';

// Recipes: defaults, validation (shared by the store and session restore), and
// the plain-language descriptions shown in history, on the stage, and in names.

export const FRAME_ASPECT_IDS = Object.keys(FRAME_ASPECTS) as FrameAspect[];
const CROP_LOCKS: ReadonlyArray<EditRecipe['cropAspect']> = ['free', 'original', ...FRAME_ASPECT_IDS];
const FRAMES: ReadonlyArray<EditRecipe['frame']> = ['crop', ...FRAME_ASPECT_IDS];
const FITS: ReadonlyArray<EditRecipe['fit']> = ['fill', 'fit'];
const BACKGROUNDS: ReadonlyArray<EditRecipe['background']> = ['blur', 'black', 'white'];
const UPSCALES: ReadonlyArray<EditRecipe['upscale']> = ['none', '1080p', '1440p', '4k'];

/** Smallest crop side accepted from storage or callers, as a fraction of the frame. */
const MIN_CROP_FRACTION = 0.01;

/** The untouched picture: full frame, own shape, original size, whole clip. */
export function createRecipe(): EditRecipe {
  return {
    crop: { x: 0, y: 0, width: 1, height: 1 },
    cropAspect: 'free',
    frame: 'crop',
    fit: 'fill',
    position: { x: 0.5, y: 0.5 },
    background: 'blur',
    upscale: 'none',
    trim: null,
  };
}

export function cloneRecipe(recipe: EditRecipe): EditRecipe {
  return {
    ...recipe,
    crop: { ...recipe.crop },
    position: { ...recipe.position },
    trim: recipe.trim ? { ...recipe.trim } : null,
  };
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const oneOf = <T>(list: ReadonlyArray<T>, value: unknown): value is T => list.includes(value as T);
const unit = (value: number) => Math.min(1, Math.max(0, value));

/**
 * A safe copy of an untrusted recipe, or null if its shape is wrong. Crop and
 * position numbers are pulled back into range rather than rejected, so a
 * slightly-off value never costs someone their history; a trim must run forward.
 */
export function normalizeRecipe(value: unknown): EditRecipe | null {
  if (!record(value) || !record(value.crop) || !record(value.position)) return null;
  const { crop, position, trim } = value;
  if (![crop.x, crop.y, crop.width, crop.height, position.x, position.y].every(finite)) return null;
  if (!oneOf(CROP_LOCKS, value.cropAspect) || !oneOf(FRAMES, value.frame) || !oneOf(FITS, value.fit) ||
    !oneOf(BACKGROUNDS, value.background) || !oneOf(UPSCALES, value.upscale)) return null;
  if (trim !== null && !(record(trim) && finite(trim.start) && finite(trim.end))) return null;

  const width = Math.min(1, Math.max(MIN_CROP_FRACTION, crop.width as number));
  const height = Math.min(1, Math.max(MIN_CROP_FRACTION, crop.height as number));
  let kept: EditRecipe['trim'] = null;
  if (trim) {
    const start = Math.max(0, trim.start as number);
    const end = trim.end as number;
    if (end - start < MIN_TRIM_SECONDS / 2) return null;
    kept = { start, end };
  }
  return {
    crop: {
      x: Math.min(1 - width, unit(crop.x as number)),
      y: Math.min(1 - height, unit(crop.y as number)),
      width,
      height,
    },
    cropAspect: value.cropAspect,
    frame: value.frame,
    fit: value.fit,
    position: { x: unit(position.x as number), y: unit(position.y as number) },
    background: value.background,
    upscale: value.upscale,
    trim: kept,
  };
}

const FULL = 1 - 1e-4;

/** True when a recipe asks for any change at all (no source size needed). */
export function hasChanges(recipe: EditRecipe): boolean {
  const { crop } = recipe;
  const cropped = crop.x > 1e-4 || crop.y > 1e-4 || crop.width < FULL || crop.height < FULL;
  return cropped || recipe.frame !== 'crop' || recipe.upscale !== 'none' || recipe.trim !== null;
}

/**
 * The same edit with no-op settings dropped, for a source of `size` (and
 * `duration` seconds, for video): a reframe to the crop's own shape, an
 * upscale that can't enlarge, a trim that keeps the whole clip.
 */
export function canonicalRecipe(recipe: EditRecipe, size: Size, duration?: number): EditRecipe {
  const next = cloneRecipe(recipe);
  const crop = clampCrop(cropToPixels(next.crop, size), size);
  if (isFullFrame(next.crop, size)) next.crop = { x: 0, y: 0, width: 1, height: 1 };
  if (next.frame !== 'crop' && sameShape(FRAME_ASPECTS[next.frame], crop.width / crop.height)) next.frame = 'crop';
  if (next.upscale !== 'none' && planEdit(next, size).upscale <= 1) next.upscale = 'none';
  if (next.trim && duration !== undefined && Number.isFinite(duration) && duration > 0) {
    const range = trimRange(next.trim, duration);
    next.trim = range.start < 0.05 && range.end > duration - 0.05 ? null : range;
  }
  return next;
}

/** True when, for this source, the edit would produce the original picture. */
export function isUnchanged(recipe: EditRecipe, size: Size, duration?: number): boolean {
  return !hasChanges(canonicalRecipe(recipe, size, duration));
}

// ── Descriptions ──────────────────────────────────────────────────────────────

export type EditTool = 'crop' | 'reframe' | 'upscale' | 'trim';

export interface EditChange {
  tool: EditTool;
  /** Sentence-case description, e.g. "Reframed to 9:16, filled". */
  text: string;
}

const BACKGROUND_WORDS: Record<EditRecipe['background'], string> = {
  blur: 'blurred bars',
  black: 'black bars',
  white: 'white bars',
};

const UPSCALE_WORDS: Record<Exclude<EditRecipe['upscale'], 'none'>, string> = {
  '1080p': '1080p',
  '1440p': '1440p',
  '4k': '4K',
};

/**
 * What an edit changes, in order. With the source size, crops and upscales
 * name their pixel sizes; with a duration, trims are clamped to the clip.
 */
export function describeRecipe(recipe: EditRecipe, size?: Size, duration?: number): EditChange[] {
  const changes: EditChange[] = [];
  const { crop } = recipe;
  const cropped = crop.x > 1e-4 || crop.y > 1e-4 || crop.width < FULL || crop.height < FULL;
  if (cropped) {
    const px = size ? clampCrop(cropToPixels(crop, size), size) : null;
    changes.push({ tool: 'crop', text: px ? `Cropped to ${px.width} × ${px.height}` : 'Cropped' });
  }
  if (recipe.frame !== 'crop') {
    const how = recipe.fit === 'fill' ? 'filled' : `fitted with ${BACKGROUND_WORDS[recipe.background]}`;
    changes.push({ tool: 'reframe', text: `Reframed to ${recipe.frame}, ${how}` });
  }
  if (recipe.upscale !== 'none') {
    if (size) {
      const plan = planEdit(recipe, size);
      if (plan.upscale > 1) {
        changes.push({ tool: 'upscale', text: `Upscaled to ${plan.width} × ${plan.height} (${formatFactor(plan.upscale)})` });
      }
    } else {
      changes.push({ tool: 'upscale', text: `Upscaled to ${UPSCALE_WORDS[recipe.upscale]}` });
    }
  }
  if (recipe.trim) {
    const range = duration !== undefined ? trimRange(recipe.trim, duration) : recipe.trim;
    changes.push({
      tool: 'trim',
      text: `Trimmed to ${formatClock(range.start)}–${formatClock(range.end)} (${formatSeconds(range.end - range.start)})`,
    });
  }
  return changes;
}

/** A short line for version history: "Crop · 9:16 · 1080p · Trim". */
export function summarizeRecipe(recipe: EditRecipe): string {
  const parts: string[] = [];
  const { crop } = recipe;
  if (crop.x > 1e-4 || crop.y > 1e-4 || crop.width < FULL || crop.height < FULL) parts.push('Crop');
  if (recipe.frame !== 'crop') parts.push(recipe.fit === 'fill' ? recipe.frame : `${recipe.frame} fit`);
  if (recipe.upscale !== 'none') parts.push(UPSCALE_WORDS[recipe.upscale]);
  if (recipe.trim) parts.push('Trim');
  return parts.length ? parts.join(' · ') : 'No changes';
}

/** Filename words for an edit: "crop-9x16-1080p-trim". */
export function recipeSlug(recipe: EditRecipe): string {
  if (!hasChanges(recipe)) return 'edit';
  return summarizeRecipe(recipe)
    .toLowerCase()
    .replace(/(\d+):(\d+)/g, '$1x$2')
    .split(' · ')
    .map((part) => part.replace(/[^a-z0-9]+/g, '-'))
    .join('-');
}

/** "1.5×", "2×". */
export function formatFactor(factor: number): string {
  return `${Number(factor.toFixed(factor < 10 ? 2 : 1)).toString()}×`;
}

/** "2.4 s". */
export function formatSeconds(seconds: number): string {
  return `${(Math.round(seconds * 10) / 10).toFixed(1)} s`;
}
