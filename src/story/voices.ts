import type { LangCode } from './types.ts';

/** The shape of a `SpeechSynthesisVoice`, narrowed so this stays headless. */
export interface VoiceLike {
  name: string;
  lang: string;
  default?: boolean;
}

// Preferred voice names per language, best first. Half 2 matches these against
// whatever speechSynthesis.getVoices() returns on the viewer's device.
const PREFERRED: Record<LangCode, readonly string[]> = {
  'en-US': ['Google US English', 'Samantha', 'Microsoft Aria', 'Microsoft Zira'],
  'es-ES': ['Google español', 'Monica', 'Microsoft Elvira'],
  'fr-FR': ['Google français', 'Thomas', 'Microsoft Denise'],
  'de-DE': ['Google Deutsch', 'Anna', 'Microsoft Katja'],
  'pt-BR': ['Google português do Brasil', 'Luciana', 'Microsoft Francisca'],
};

/** Hints Half 2 can show while loading, before real voices resolve. */
export function voiceHints(lang: LangCode): readonly string[] {
  return PREFERRED[lang] ?? [];
}

/**
 * Pure voice selection. Half 2 passes speechSynthesis.getVoices(); this returns
 * the best match: a named preference, then an exact lang, then the same base
 * language, else null (no local voice — Half 2 surfaces that gracefully).
 */
export function selectVoice<T extends VoiceLike>(lang: LangCode, voices: readonly T[]): T | null {
  if (!voices.length) return null;
  for (const name of PREFERRED[lang] ?? []) {
    const named = voices.find((voice) => voice.name === name);
    if (named) return named;
  }
  const wanted = lang.toLowerCase();
  const exact = voices.find((voice) => voice.lang?.toLowerCase() === wanted);
  if (exact) return exact;
  const base = wanted.split('-')[0];
  return voices.find((voice) => voice.lang?.toLowerCase().startsWith(base)) ?? null;
}
