import type { DialogueCue, StoryTimeline, Viseme } from '../../story/types.ts';

export function clampTime(ms: number, totalMs: number): number {
  return Math.max(0, Math.min(Number.isFinite(ms) ? ms : 0, totalMs));
}

/** A monotonic clock: no accumulation of requestAnimationFrame rounding errors. */
export class PlaybackClock {
  private offset = 0;
  private anchor: number | null = null;
  readonly totalMs: number;

  constructor(totalMs: number) { this.totalMs = totalMs; }
  time(now: number) { return clampTime(this.offset + (this.anchor === null ? 0 : now - this.anchor), this.totalMs); }
  play(now: number) {
    if (this.anchor !== null) return;
    if (this.offset >= this.totalMs) this.offset = 0;
    this.anchor = now;
  }
  pause(now: number) { this.offset = this.time(now); this.anchor = null; }
  seek(ms: number, now: number) {
    this.offset = clampTime(ms, this.totalMs);
    if (this.anchor !== null) this.anchor = now;
  }
}

export function frameAt(timeline: StoryTimeline, ms: number) {
  const time = clampTime(ms, timeline.totalMs);
  const scene = timeline.scenes.find((s) => time >= s.startMs && time < s.startMs + s.durationMs)
    ?? (time === timeline.totalMs ? timeline.scenes[timeline.scenes.length - 1] : undefined);
  return {
    scene,
    dialogue: timeline.dialogue.find((cue) => time >= cue.startMs && time < cue.startMs + cue.durationMs),
    subtitle: timeline.subtitles.find((cue) => time >= cue.startMs && time < cue.endMs),
  };
}

export function formatTime(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function characterViseme(character: string): Viseme {
  const char = character.toLocaleLowerCase();
  if (/\s|[.,!?;:«»“”]/u.test(char) || !char) return 'rest';
  if (/[mbpبپم]/u.test(char)) return 'mbp';
  if (/[fvف]/u.test(char)) return 'fv';
  if (/[oouóúو]/u.test(char)) return 'oh';
  if (/[eiéíیي]/u.test(char)) return 'ee';
  return 'ah';
}

export function estimatedViseme(cue: DialogueCue, ms: number): Viseme {
  const offset = ms - cue.startMs;
  if (offset < 0 || offset >= cue.durationMs) return 'rest';
  if (cue.visemes?.length) {
    let shape: Viseme = 'rest';
    for (const mark of cue.visemes) {
      if (mark.atMs > offset) break;
      shape = mark.viseme;
    }
    return shape;
  }
  return characterViseme(cue.text[Math.floor(offset / cue.durationMs * cue.text.length)] ?? '');
}

/** TTS cannot seek. Resume near the estimated word at the new play head. */
export function speechOffset(cue: DialogueCue, ms: number): number {
  const ratio = Math.max(0, Math.min(1, (ms - cue.startMs) / cue.durationMs));
  let index = Math.floor(ratio * cue.text.length);
  while (index > 0 && index < cue.text.length && !/\s/u.test(cue.text[index - 1])) index--;
  return index;
}
