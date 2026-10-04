import type { CSSProperties } from 'react';
import { Button } from '../components/ui';
import { Glyph } from '../components/Glyph';
import { formatTime } from './playback';

export function Transport({ time, totalMs, playing, captions, muted, locked, preparing = false, onPlay, onPause, onSeek, onCaptions, onMute }: {
  time: number; totalMs: number; playing: boolean; captions: boolean; muted: boolean; locked: boolean;
  preparing?: boolean;
  onPlay: () => void; onPause: () => void; onSeek: (ms: number) => void;
  onCaptions: () => void; onMute: () => void;
}) {
  const pct = totalMs > 0 ? (time / totalMs) * 100 : 0;
  return (
    <div className="flex flex-col gap-1 border-x border-b border-rule bg-sheet px-2 pb-2 pt-1">
      <input type="range" min={0} max={totalMs} step={100} value={time} disabled={locked}
        aria-label="Story position" aria-valuetext={`${formatTime(time)} of ${formatTime(totalMs)}`}
        onChange={(event) => onSeek(Number(event.target.value))}
        className="scrubber" style={{ '--pct': `${pct}%` } as CSSProperties} />
      <div className="flex flex-wrap items-center gap-1">
        <Button size="icon" variant="primary" disabled={preparing} onClick={playing ? onPause : onPlay}
          aria-label={playing ? 'Pause story' : time >= totalMs ? 'Replay story' : 'Play story'}>
          <Glyph name={playing ? 'pause' : 'play'} />
        </Button>
        <Button size="icon" variant="quiet" disabled={locked} onClick={() => onSeek(0)} aria-label="Back to the start" className="text-ink">
          <Glyph name="restart" />
        </Button>
        <span className="tnum px-2 text-sm font-medium text-ink-2">{formatTime(time)} / {formatTime(totalMs)}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="quiet" disabled={locked} onClick={onCaptions} aria-pressed={captions} className="text-ink">
            <span aria-hidden className={`h-2.5 w-2.5 border-2 border-current ${captions ? 'bg-current' : ''}`} />
            Subtitles
          </Button>
          <Button size="icon" variant="quiet" onClick={onMute} aria-label="Mute narration" aria-pressed={muted} className="text-ink">
            <Glyph name={muted ? 'muted' : 'sound'} />
          </Button>
        </div>
      </div>
    </div>
  );
}
