import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

// A deliberately small glyph set, drawn solid on a 20×20 grid. Glyphs appear
// only where a symbol is the convention (media transport, download, back,
// retry); everything else in the interface is labeled with words.
const GLYPHS = {
  play: <path d="M6 3.5 16.5 10 6 16.5Z" />,
  pause: <path d="M5 4h3.5v12H5zM11.5 4H15v12h-3.5z" />,
  stop: <path d="M5 5h10v10H5z" />,
  record: <circle cx="10" cy="10" r="5.5" />,
  restart: <path d="M4 4h2.5v12H4zM16 4v12L7.5 10z" />,
  back: <path d="M8.6 4 2.6 10l6 6 1.5-1.5-3.45-3.45H17.5v-2.1H6.65L10.1 5.5z" />,
  forward: <path d="M11.4 4 17.4 10l-6 6-1.5-1.5 3.45-3.45H2.5v-2.1h10.85L9.9 5.5z" />,
  download: <path d="M8.95 3h2.1v7.4l2.7-2.7 1.48 1.48L10 14.43 4.77 9.18 6.25 7.7l2.7 2.7zM3.5 15.5h13v2h-13z" />,
  retry: (
    <>
      <path d="M16 10A6 6 0 1 1 10 4" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M10 1.2 13.6 4 10 6.8z" />
    </>
  ),
  check: <path d="M3.8 10.4 8.2 14.8 16.4 5.8" fill="none" stroke="currentColor" strokeWidth="2.4" />,
  plus: <path d="M8.75 3h2.5v5.75H17v2.5h-5.75V17h-2.5v-5.75H3v-2.5h5.75z" />,
  sound: (
    <>
      <path d="M2.5 7.5h3.2L10 4v12l-4.3-3.5H2.5z" />
      <path d="M12.7 7.3a3.8 3.8 0 0 1 0 5.4M14.9 5.1a6.9 6.9 0 0 1 0 9.8" fill="none" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  muted: (
    <>
      <path d="M2.5 7.5h3.2L10 4v12l-4.3-3.5H2.5z" />
      <path d="m12.5 7.5 5 5m0-5-5 5" fill="none" stroke="currentColor" strokeWidth="2" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type GlyphName = keyof typeof GLYPHS;

export function Glyph({ name, className }: { name: GlyphName; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={cn('h-4 w-4 shrink-0', className)}
    >
      {GLYPHS[name]}
    </svg>
  );
}

/** Cutroom's mark: a frame with its corner trimmed off. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" className={cn('h-5 w-5 shrink-0', className)}>
      <path d="M2 2h16v7.2L9.2 18H2z" className="fill-ink" />
      <path d="M18 12.2V18h-5.8z" className="fill-mark" />
    </svg>
  );
}
