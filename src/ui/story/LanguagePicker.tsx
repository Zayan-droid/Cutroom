import { useEffect, useId, useState } from 'react';
import { chooseVoice, matchingVoices } from './voices';

export function useSpeechVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  useEffect(() => {
    if (!supported) return;
    const speech = window.speechSynthesis;
    const refresh = () => setVoices(speech.getVoices());
    refresh(); speech.addEventListener('voiceschanged', refresh);
    return () => speech.removeEventListener('voiceschanged', refresh);
  }, [supported]);
  return { voices, supported };
}

const names: Record<string, string> = { 'en-US': 'English', 'es-ES': 'Español', 'fr-FR': 'Français', 'de-DE': 'Deutsch', 'pt-BR': 'Português', 'ur-PK': 'اردو', 'hi-IN': 'हिन्दी' };
const selectClass =
  'h-11 w-full min-w-0 cursor-pointer rounded border border-edge bg-field px-3 text-base text-ink focus:border-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60';

export function LanguagePicker({ languages, lang, onChange, disabled = false }: {
  languages: readonly string[]; lang: string; onChange: (lang: string) => void; disabled?: boolean;
}) {
  const id = useId();
  return <div className="flex flex-col gap-2">
    <label htmlFor={id} className="text-sm font-semibold text-ink">Language</label>
    <select id={id} className={selectClass} value={lang} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {languages.map((code) => <option key={code} value={code}>{names[code] ?? code}</option>)}
    </select>
    <p className="text-[13px] text-ink-3">Dialogue, narration, and subtitles all use this language.</p>
  </div>;
}

export function VoicePicker({ voices, supported, lang, voiceURI, onChange, disabled }: {
  voices: SpeechSynthesisVoice[]; supported: boolean; lang: string; voiceURI?: string;
  onChange: (uri: string) => void; disabled: boolean;
}) {
  const id = useId();
  const matches = matchingVoices(voices, lang);
  const selected = chooseVoice(voices, lang, voiceURI);
  return <div className="flex flex-col gap-2">
    <label htmlFor={id} className="text-sm font-semibold text-ink">Narration voice <span className="font-normal text-ink-3">· {names[lang] ?? lang}</span></label>
    <select id={id} className={selectClass} value={selected?.voiceURI ?? ''} disabled={disabled || !matches.length}
      onChange={(event) => onChange(event.target.value)}>
      {!matches.length && <option value="">Subtitles only</option>}
      {matches.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name}{voice.localService ? ' · on device' : ' · online'}</option>)}
    </select>
    <p className="text-[13px] leading-snug text-ink-2" role="status">
      {!supported ? 'This browser has no speech playback. You can still watch with subtitles.'
        : !matches.length ? 'No matching voice is installed on this device. Subtitles will still play.'
          : !selected?.localService ? 'This voice may need an internet connection.' : 'This voice is installed on your device.'}
    </p>
  </div>;
}
