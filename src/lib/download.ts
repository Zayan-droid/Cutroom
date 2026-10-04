import type { Take } from '@/types';

/** The take's real media URL, or null while it has none (not ready, failed, or a placeholder). */
export function takeAsset(take: Pick<Take, 'status' | 'assetUrl'>): string | null {
  const url = take.assetUrl;
  return take.status === 'ready' && url && !url.startsWith('placeholder://') ? url : null;
}

const TYPE_EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Extension for a saved file: from the response type, else the URL path, else mp4. */
export function fileExtension(url: string, contentType = ''): string {
  const fromType = TYPE_EXTENSIONS[contentType.split(';')[0].trim().toLowerCase()];
  if (fromType) return fromType;
  if (url.startsWith('data:') || url.startsWith('blob:')) return 'mp4';
  const match = /\.([a-z0-9]{2,5})$/i.exec(url.split(/[?#]/)[0]);
  return match ? match[1].toLowerCase() : 'mp4';
}

/** Lowercase ASCII words joined by hyphens, cut at a word boundary. */
export function slugify(text: string, max = 48): string {
  const slug = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max);
  const lastBreak = cut.lastIndexOf('-');
  return (lastBreak > max / 2 ? cut.slice(0, lastBreak) : cut).replace(/-+$/, '');
}

/** A filename that says what the file is: "cutroom-rain-on-a-neon-street-final-render.mp4". */
export function takeFileName(take: Pick<Take, 'prompt' | 'kind' | 'label'>, url: string, contentType = ''): string {
  const subject = slugify(take.prompt) || 'take';
  const version = take.kind === 'render' ? 'final-render' : slugify(take.label ?? '') || 'draft';
  return `cutroom-${subject}-${version}.${fileExtension(url, contentType)}`;
}

/** Hand a blob to the browser as a file download. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Leave enough time for browsers to consume the download, then release it.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
