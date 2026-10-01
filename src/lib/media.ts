import type { CSSProperties } from 'react';
import type { IntentKind } from '@/types';

/** Deterministic non-negative hash from a string id. */
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// On-brand cinematic gradient pairs. Placeholder "footage" is generated from
// these so the app is fully offline and every poster reads as premium.
const PALETTE: Array<[string, string]> = [
  ['#EC4899', '#6366F1'],
  ['#8B5CF6', '#EC4899'],
  ['#3B82F6', '#8B5CF6'],
  ['#F43F5E', '#7C3AED'],
  ['#06B6D4', '#6366F1'],
  ['#EC4899', '#F59E0B'],
  ['#22D3EE', '#3B82F6'],
  ['#A855F7', '#EC4899'],
];

export function posterColors(id: string): [string, string] {
  return PALETTE[hashId(id) % PALETTE.length];
}

/** Layered gradient that stands in for a generated frame. */
export function posterStyle(id: string): CSSProperties {
  const [a, b] = posterColors(id);
  const h = hashId(id);
  const x = 20 + (h % 60);
  const y = 15 + ((h >> 4) % 55);
  return {
    backgroundColor: '#0A0E1C',
    backgroundImage: [
      `radial-gradient(120% 120% at ${x}% ${y}%, ${a}66 0%, transparent 55%)`,
      `radial-gradient(120% 120% at ${100 - x}% ${100 - y}%, ${b}66 0%, transparent 55%)`,
      `linear-gradient(135deg, ${a}22 0%, #0A0E1C 45%, ${b}22 100%)`,
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
