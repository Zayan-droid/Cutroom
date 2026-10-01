import type { DialogueCue, StoryTimeline, SubtitleCue } from './types.ts';

const MIN_SUBTITLE_MS = 800;

/** One caption per dialogue cue, aligned to its timing, in the selected language. */
export function buildSubtitles(dialogue: DialogueCue[], idPrefix: string): SubtitleCue[] {
  return [...dialogue]
    .sort((a, b) => a.startMs - b.startMs)
    .map((cue, i) => ({
      id: `${idPrefix}-sub${i}`,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.startMs + Math.max(MIN_SUBTITLE_MS, cue.durationMs),
      text: cue.text,
    }));
}

function timestamp(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(total % 1000, 3)}`;
}

/** Serialize the subtitle track to WebVTT for download or an in-player track. */
export function toVtt(timeline: StoryTimeline): string {
  const lines = ['WEBVTT', ''];
  [...timeline.subtitles]
    .sort((a, b) => a.startMs - b.startMs)
    .forEach((cue, i) => {
      lines.push(String(i + 1));
      lines.push(`${timestamp(cue.startMs)} --> ${timestamp(cue.endMs)}`);
      lines.push(cue.text);
      lines.push('');
    });
  return lines.join('\n');
}
