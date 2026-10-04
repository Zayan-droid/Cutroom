import type { CSSProperties } from 'react';
import { formatClock } from '@/edit/geometry';
import { Button } from '@/ui/components/ui';
import { Glyph } from '@/ui/components/Glyph';
import type { EditPlayer } from './media';

/**
 * Play/pause, a scrubber, the time, and sound for an edit's source video.
 * `min`/`max` bound the scrubber in source seconds and the time reads from
 * `min`. With `kept`, the track also marks the trimmed range.
 */
export function EditTransport({
  player,
  min,
  max,
  kept,
  disabled,
  label = 'Clip position',
}: {
  player: EditPlayer;
  min: number;
  max: number;
  kept?: { start: number; end: number };
  disabled?: boolean;
  label?: string;
}) {
  const span = Math.max(0, max - min);
  const time = Math.min(Math.max(player.time, min), max);
  const at = (t: number) => (span > 0 ? `${((t - min) / span) * 100}%` : '0%');
  const style = {
    '--pct': at(time),
    ...(kept ? { '--start': at(kept.start), '--end': at(kept.end) } : {}),
  } as CSSProperties;
  return (
    <div className="flex items-center gap-1 border-x border-b border-rule bg-sheet px-1 py-1">
      <Button
        size="icon"
        variant="quiet"
        disabled={disabled}
        onClick={player.toggle}
        aria-label={player.playing ? 'Pause clip' : 'Play clip'}
        className="h-10 w-10 text-ink"
      >
        <Glyph name={player.playing ? 'pause' : 'play'} />
      </Button>
      <input
        type="range"
        min={min}
        max={max || 0}
        step={0.01}
        value={time}
        disabled={disabled || span === 0}
        onChange={(e) => player.seek(Number(e.target.value))}
        aria-label={label}
        aria-valuetext={`${formatClock(time - min)} of ${formatClock(span)}`}
        data-range={kept ? '' : undefined}
        className="scrubber min-w-0 flex-1"
        style={style}
      />
      <span className="tnum shrink-0 px-2 text-[13px] text-ink-2">
        {formatClock(time - min)} / {formatClock(span)}
      </span>
      <Button
        size="icon"
        variant="quiet"
        disabled={disabled}
        onClick={player.toggleMute}
        aria-label="Mute clip"
        aria-pressed={player.muted}
        className="h-10 w-10 text-ink"
      >
        <Glyph name={player.muted ? 'muted' : 'sound'} />
      </Button>
    </div>
  );
}
