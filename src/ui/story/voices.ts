export interface VoiceInfo {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

const normalize = (lang: string) => lang.replaceAll('_', '-').toLowerCase();
export function matchingVoices<T extends VoiceInfo>(voices: readonly T[], lang: string): T[] {
  const target = normalize(lang);
  return voices.filter((voice) => normalize(voice.lang).split('-')[0] === target.split('-')[0])
    .sort((a, b) => Number(normalize(b.lang) === target) - Number(normalize(a.lang) === target)
      || Number(b.localService) - Number(a.localService) || Number(b.default) - Number(a.default));
}

export function chooseVoice<T extends VoiceInfo>(voices: readonly T[], lang: string, preferred?: string): T | undefined {
  const matches = matchingVoices(voices, lang);
  return matches.find((v) => v.voiceURI === preferred) ?? matches[0];
}
