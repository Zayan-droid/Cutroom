import type { DialogueCue, Viseme } from '../../story/types.ts';
import { characterViseme, estimatedViseme, speechOffset } from './playback.ts';
import { chooseVoice } from './voices.ts';

interface SpeechPort {
  getVoices(): SpeechSynthesisVoice[];
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  resume(): void;
}

/** Owns only this player's utterance. All events from cancelled speech are ignored. */
export class Narrator {
  private speech: SpeechPort | null;
  private makeUtterance: (text: string) => SpeechSynthesisUtterance;
  private report: (message: string) => void;
  private active: string | null = null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private epoch = 0;
  private speaking = false;
  private boundary: { index: number; time: number } | null = null;
  private time = 0;
  private voice?: string;

  constructor(
    speech: SpeechPort | null,
    makeUtterance: (text: string) => SpeechSynthesisUtterance,
    report: (message: string) => void = () => {},
  ) {
    this.speech = speech;
    this.makeUtterance = makeUtterance;
    this.report = report;
  }

  setVoice(voice?: string) {
    if (voice !== this.voice) { this.stop(); this.voice = voice; }
  }

  stop() {
    this.epoch++;
    const owned = this.utterance !== null;
    this.utterance = null;
    this.active = null;
    this.speaking = false;
    this.boundary = null;
    if (owned) this.speech?.cancel();
  }

  sync(cue: DialogueCue | undefined, ms: number, enabled: boolean): Viseme {
    this.time = ms;
    if (!enabled || !cue) { if (this.active) this.stop(); return 'rest'; }
    if (this.active !== cue.id) {
      this.stop();
      this.active = cue.id;
      const voice = chooseVoice(this.speech?.getVoices() ?? [], cue.lang, this.voice);
      // Never let the browser read another language in its default voice.
      if (!this.speech || !voice) return 'rest';
      const offset = speechOffset(cue, ms);
      const text = cue.text.slice(offset);
      if (!text.trim()) return 'rest';
      const epoch = this.epoch;
      const utterance = this.makeUtterance(text);
      this.utterance = utterance;
      utterance.lang = cue.lang;
      utterance.voice = voice;
      // A bounded estimate. The timeline remains authoritative at cue boundaries.
      const remainingSeconds = Math.max(1, (cue.startMs + cue.durationMs - ms) / 1000);
      utterance.rate = Math.max(0.75, Math.min(1.6, text.trim().split(/\s+/u).length / (remainingSeconds * 2.4)));
      utterance.onstart = () => { if (epoch === this.epoch) this.speaking = true; };
      utterance.onboundary = (event) => {
        if (epoch !== this.epoch) return;
        this.boundary = { index: offset + event.charIndex, time: this.time };
      };
      utterance.onend = () => {
        if (epoch === this.epoch) { this.speaking = false; this.utterance = null; }
      };
      utterance.onerror = (event) => {
        if (epoch !== this.epoch) return;
        this.speaking = false;
        this.utterance = null;
        if (event.error !== 'canceled' && event.error !== 'interrupted') {
          this.report('Voice playback is unavailable. Subtitles and the story will keep playing.');
        }
      };
      try { this.speech.resume(); this.speech.speak(utterance); }
      catch { utterance.onerror({ error: 'synthesis-failed' } as SpeechSynthesisErrorEvent); }
    }
    if (!this.speaking) return 'rest';
    if (this.boundary) {
      const index = this.boundary.index + Math.floor(Math.max(0, ms - this.boundary.time) / 85);
      return characterViseme(cue.text[Math.min(index, cue.text.length - 1)] ?? '');
    }
    // speechSynthesis has no capturable audio stream; timed marks work on voices
    // without boundary events, without pretending to analyze their audio.
    return estimatedViseme(cue, ms);
  }
}
