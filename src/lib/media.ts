import type { CSSProperties } from 'react';
import type { IntentKind } from '@/types';

/** Video files play in a <video>; anything else (remote drafts, stills) is shown as an image. */
export function isVideoAsset(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url) || url.startsWith('data:video') || url.startsWith('blob:');
}

/** Deterministic non-negative hash from a string id. */
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// Muted [sky, land] pairs for procedural scenery (story scenes and their
// thumbnails). Flat, daylight tones so the art reads as a landscape study,
// not as brand decoration.
const PALETTE: Array<[string, string]> = [
  ['#C9D3CF', '#4E5D4C'],
  ['#E3CFA8', '#7A4B2E'],
  ['#A9BCC9', '#3E4C5A'],
  ['#E8C4A8', '#8A4F3D'],
  ['#D7D2BE', '#5F6B45'],
  ['#C4CBD0', '#555A4E'],
  ['#EBD9B4', '#A2643A'],
  ['#B9CCC4', '#2F4A45'],
];

/** The pale disc (sun or moon) shared by thumbnails and the story canvas. */
export const SCENE_LIGHT = '#F4EBD8';

export function posterColors(id: string): [string, string] {
  return PALETTE[hashId(id) % PALETTE.length];
}

/** Linear blend of two #RRGGBB colors; `t` = 0 returns `a`, 1 returns `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = parseInt(a.slice(1), 16);
  const cb = parseInt(b.slice(1), 16);
  const channel = (shift: number) => {
    const x = (ca >> shift) & 255;
    const y = (cb >> shift) & 255;
    return Math.round(x + (y - x) * t);
  };
  const out = (channel(16) << 16) | (channel(8) << 8) | channel(0);
  return `#${out.toString(16).padStart(6, '0').toUpperCase()}`;
}

/** Scene geometry derived from a seed — the thumbnail and canvas agree on it. */
export function sceneLayout(id: string) {
  const h = hashId(id);
  const horizon = 58 + (h % 14); // % from top
  return {
    horizon,
    ridge: horizon - 8 - ((h >>> 5) % 6),
    lightX: 16 + ((h >>> 9) % 66),
    lightY: 16 + ((h >>> 13) % 20),
  };
}

/** Hard-edged landscape thumbnail: sky, a far ridge, land, and a pale disc. */
export function posterStyle(id: string): CSSProperties {
  const [sky, land] = posterColors(id);
  const { horizon, ridge, lightX, lightY } = sceneLayout(id);
  const far = mixHex(sky, land, 0.45);
  return {
    backgroundColor: land,
    backgroundImage: [
      `radial-gradient(circle at ${lightX}% ${lightY}%, ${SCENE_LIGHT} 0 7%, transparent 7.5%)`,
      `linear-gradient(180deg, ${sky} 0 ${ridge}%, ${far} ${ridge}% ${horizon}%, transparent ${horizon}%)`,
    ].join(', '),
  };
}

/** Aspect ratio per intent — vertical social, portrait ad, widescreen cinematic. */
export function aspectFor(intent: IntentKind): string {
  switch (intent) {
    case 'social':
      return '9 / 16';
    case 'ad':
      return '4 / 5';
    case 'cinematic':
      return '16 / 9';
  }
}

/** Human ratio label shown next to each format, e.g. "9:16". */
export function ratioLabel(intent: IntentKind): string {
  return aspectFor(intent).replace(/\s*\/\s*/, ':');
}
