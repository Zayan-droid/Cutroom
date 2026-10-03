import { Captions, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { Button } from '../components/ui';
import { formatTime } from './playback';

export function Transport({ time, totalMs, playing, captions, muted, locked, preparing = false, onPlay, onPause, onSeek, onCaptions, onMute }: {
  time: number; totalMs: number; playing: boolean; captions: boolean; muted: boolean; locked: boolean;
  preparing?: boolean;
  onPlay: () => void; onPause: () => void; onSeek: (ms: number) => void;
  onCaptions: () => void; onMute: () => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <input type="range" min={0} max={totalMs} step={100} value={time} disabled={locked}
        aria-label="Story position" aria-valuetext={`${formatTime(time)} of ${formatTime(totalMs)}`}
        onChange={(event) => onSeek(Number(event.target.value))}
        className="block w-full cursor-pointer accent-primary disabled:cursor-not-allowed" />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon" variant="primary" disabled={preparing} onClick={playing ? onPause : onPlay} aria-label={playing ? 'Pause story' : time >= totalMs ? 'Replay story' : 'Play story'}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button size="icon" variant="ghost" disabled={locked} onClick={() => onSeek(0)} aria-label="Restart story"><RotateCcw className="h-4 w-4" /></Button>
        <span className="tnum text-xs text-fg-muted sm:text-sm">{formatTime(time)} / {formatTime(totalMs)}</span>
        <div className="ml-auto flex gap-1">
          <Button size="icon" variant={captions ? 'subtle' : 'ghost'} disabled={locked} onClick={onCaptions} aria-label="Subtitles" aria-pressed={captions}><Captions className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={onMute} aria-label={muted ? 'Unmute narration' : 'Mute narration'} aria-pressed={muted}>
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
