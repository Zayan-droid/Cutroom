import type { SubtitleCue } from '../../../story/types.ts';

function timestamp(ms: number): string {
  const value = Math.max(0, Math.round(ms));
  return `${String(Math.floor(value / 3_600_000)).padStart(2, '0')}:${String(Math.floor(value / 60_000) % 60).padStart(2, '0')}:${String(Math.floor(value / 1000) % 60).padStart(2, '0')}.${String(value % 1000).padStart(3, '0')}`;
}

/** UI export serializer; no import from the headless engine implementation. */
export function subtitlesToVtt(cues: readonly SubtitleCue[]): string {
  const blocks = cues.map((cue, index) => {
    const text = cue.text.replace(/\r\n?/g, '\n').replace(/\n\s*\n/g, '\n')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    return `${index + 1}\n${timestamp(cue.startMs)} --> ${timestamp(cue.endMs)}\n${text}`;
  });
  return `WEBVTT\n\n${blocks.join('\n\n')}\n`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  // Leave enough time for browsers to consume the download, then release it.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
