import type { EditRecipe, Take } from '../../types.ts';
import { recipeSlug, summarizeRecipe } from '../../edit/recipe.ts';
import { slugify } from '../../lib/download.ts';

// Naming and sniffing for edited files. Pure, so it is tested without a DOM.

export type FileMediaKind = 'video' | 'image';

const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'mov', 'webm', 'ogv', 'mkv'];
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp'];

/** Video or image, from the MIME type or else the extension; null for anything else. */
export function fileKind(name: string, type = ''): FileMediaKind | null {
  const mime = type.toLowerCase();
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return mime === 'image/svg+xml' ? null : 'image';
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  if (VIDEO_EXTENSIONS.includes(extension)) return 'video';
  if (IMAGE_EXTENSIONS.includes(extension)) return 'image';
  return null;
}

/** "Beach day (1).MOV" → "beach-day-1". */
export function fileStem(name: string): string {
  return slugify(name.replace(/\.[a-z0-9]{1,5}$/i, '')) || 'clip';
}

/** How a take is named in the editor: "Render · final render", "Edit · Crop · 9:16", "Draft 2". */
export function takeTitle(take: Pick<Take, 'kind' | 'label' | 'edit'>): string {
  const label = take.label ?? (take.kind === 'render' ? 'Render' : take.kind === 'edit' ? 'Edit' : 'Draft');
  if (take.kind === 'render') return `${label} · final render`;
  if (take.kind === 'edit' && take.edit) return `${label} · ${summarizeRecipe(take.edit)}`;
  return label;
}

/** Download name (without extension) for an edit of a take: "cutroom-a-quiet-coastline-edit-crop-9x16". */
export function takeEditBase(prompt: string, recipe: EditRecipe): string {
  return `cutroom-${slugify(prompt) || 'take'}-edit-${recipeSlug(recipe)}`;
}

/** Download name (without extension) for an edit of a file: "beach-day-edit-1080p". */
export function fileEditBase(name: string, recipe: EditRecipe): string {
  return `${fileStem(name)}-edit-${recipeSlug(recipe)}`;
}
