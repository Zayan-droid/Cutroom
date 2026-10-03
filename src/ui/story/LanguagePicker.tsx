import { useEffect, useState } from 'react';
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
const selectClass = 'w-full min-w-0 cursor-pointer rounded-xl border border-border-strong bg-surface-2 px-3 py-2.5 text-sm text-fg disabled:cursor-not-allowed';

export function LanguagePicker({ languages, lang, onChange, disabled = false }: {
  languages: readonly string[]; lang: string; onChange: (lang: string) => void; disabled?: boolean;
}) {
  return <label className="block space-y-2 text-xs text-fg-muted">
    <span>Story language</span>
    <select className={selectClass} value={lang} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {languages.map((code) => <option key={code} value={code}>{names[code] ?? code}</option>)}
    </select>
  </label>;
}

export function VoicePicker({ voices, supported, lang, voiceURI, onChange, disabled }: {
  voices: SpeechSynthesisVoice[]; supported: boolean; lang: string; voiceURI?: string;
  onChange: (uri: string) => void; disabled: boolean;
}) {
  const matches = matchingVoices(voices, lang);
  const selected = chooseVoice(voices, lang, voiceURI);
  return <div className="space-y-2">
    <label className="block space-y-2 text-xs text-fg-muted">
      <span>Narration voice · {names[lang] ?? lang}</span>
      <select className={selectClass} value={selected?.voiceURI ?? ''} disabled={disabled || !matches.length}
        onChange={(event) => onChange(event.target.value)}>
        {!matches.length && <option value="">Subtitles only</option>}
        {matches.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name}{voice.localService ? ' · on device' : ' · online'}</option>)}
      </select>
    </label>
    <p className="text-xs leading-relaxed text-fg-muted" role="status">
      {!supported ? 'This browser has no speech playback. You can still watch with subtitles.'
        : !matches.length ? 'No matching voice is available on this device. Subtitles will still play.'
          : !selected?.localService ? 'This voice may need an internet connection.' : 'This voice is available on your device.'}
    </p>
  </div>;
}
