import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { aspectFor } from '@/lib/media';
import { tLayout } from '@/lib/motion';
import type { Take } from '@/types';
import { Button } from './ui';
import { Glyph } from './Glyph';

/** A real asset from the engine (bundled clip, or a generated image/video URL). */
function realAsset(take: Take): string | null {
  const url = take.assetUrl;
  return take.status === 'ready' && url && !url.startsWith('placeholder://') ? url : null;
}

/** Remote renders return video clips; remote drafts (and some stills) are images. */
function isVideoAsset(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url) || url.startsWith('data:video') || url.startsWith('blob:');
}

export function clipTime(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface TakeFrameProps {
  take: Take;
  /** `thumb` crops to the format for comparison; `stage` shows the whole frame with controls. */
  variant?: 'thumb' | 'stage';
  layoutId?: string;
  className?: string;
}

/**
 * The picture for a take, shown as-is: no grain, vignette, or overlays on the
 * footage. Every non-picture state says plainly what is happening.
 *
 * The frame element is stable for the life of a take (keyed by id) and only its
 * contents change, so a shared `layoutId` never moves between two elements.
 */
export function TakeFrame({ take, variant = 'thumb', layoutId, className }: TakeFrameProps) {
  const asset = realAsset(take);
  const stage = variant === 'stage';
  const playable = stage && asset !== null && isVideoAsset(asset) ? asset : null;
  const player = useClipPlayer(playable);

  let body: ReactNode;
  if (take.status === 'queued' || take.status === 'generating') body = <ProgressFrame take={take} large={stage} />;
  else if (take.status === 'failed') body = <Notice large={stage} title="No picture" text="This take failed to generate." hatch />;
  else if (!asset) body = <Notice large={stage} title="No preview" text="This engine returned a take without media." />;
  else if (playable) body = <StageVideo player={player} src={playable} />;
  else if (isVideoAsset(asset)) body = <ThumbVideo src={asset} />;
  else body = <Still src={asset} contain={stage} />;

  return (
    <div className={cn('w-full', className)}>
      <motion.div
        key={take.id}
        layoutId={layoutId}
        transition={tLayout}
        className="relative w-full overflow-hidden bg-well"
        style={{ aspectRatio: aspectFor(take.intent.kind) }}
      >
        {body}
      </motion.div>
      {playable && <PlayerControls player={player} />}
    </div>
  );
}

// ── Non-picture states ────────────────────────────────────────────────────────

function ProgressFrame({ take, large }: { take: Take; large: boolean }) {
  const queued = take.status === 'queued';
  const pct = Math.round((take.progress ?? 0) * 100);
  return (
    <div
      role="progressbar"
      aria-label={`${take.label ?? 'Take'}: ${queued ? 'queued' : 'generating'}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={queued ? undefined : pct}
      className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center"
    >
      <span className={cn('tnum stretch-condensed font-semibold leading-none text-ink', large ? 'text-6xl' : 'text-4xl')}>
        {queued ? '0%' : `${pct}%`}
      </span>
      <span className="text-[13px] font-medium text-ink-2">{queued ? 'Waiting to start' : 'Generating'}</span>
      <span className="absolute inset-x-0 bottom-0 h-1 bg-ink/10">
        <span
          className="absolute inset-0 origin-left bg-ink transition-transform duration-200 ease-linear"
          style={{ transform: `scaleX(${queued ? 0 : Math.max(0.02, pct / 100)})` }}
        />
      </span>
    </div>
  );
}

function Notice({ title, text, large, hatch, action }: {
  title: string; text: string; large: boolean; hatch?: boolean; action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center gap-1 p-3 text-center',
        hatch && 'bg-[repeating-linear-gradient(135deg,rgb(var(--ink)/0.07)_0_1px,transparent_1px_10px)]',
      )}
    >
      <span className={cn('font-semibold text-ink', large ? 'text-lg' : 'text-sm')}>{title}</span>
      <span className={cn('max-w-xs text-ink-2', large ? 'text-sm' : 'sr-only')}>{text}</span>
      {action}
    </div>
  );
}

function MediaError({ large, onRetry }: { large: boolean; onRetry: () => void }) {
  return (
    <Notice
      large={large}
      title="Couldn't load this clip"
      text="The file may have moved, or the connection dropped."
      action={
        <Button size="sm" variant="secondary" className="relative z-20 mt-2" onClick={onRetry} leftIcon={<Glyph name="retry" />}>
          Try again
        </Button>
      }
    />
  );
}

/** Reload a broken media element by remounting it. */
function useMediaRetry(src: string | null) {
  const [broken, setBroken] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setBroken(false), [src]);
  return {
    broken,
    key: `${src}#${attempt}`,
    fail: () => setBroken(true),
    retry: () => {
      setBroken(false);
      setAttempt((n) => n + 1);
    },
  };
}

// ── Pictures ──────────────────────────────────────────────────────────────────

function Still({ src, contain }: { src: string; contain: boolean }) {
  const media = useMediaRetry(src);
  if (media.broken) return <MediaError large={contain} onRetry={media.retry} />;
  return (
    <img
      key={media.key}
      src={src}
      alt=""
      onError={media.fail}
      className={cn('absolute inset-0 h-full w-full', contain ? 'object-contain' : 'object-cover')}
    />
  );
}

/** Grid thumbnail: loops silently; with reduced motion it holds a still frame. */
function ThumbVideo({ src }: { src: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLVideoElement>(null);
  const media = useMediaRetry(src);
  useEffect(() => {
    // React can drop the `muted` attribute; force it so inline autoplay is allowed.
    if (ref.current) ref.current.muted = true;
  }, [media.key]);
  if (media.broken) return <MediaError large={false} onRetry={media.retry} />;
  return (
    <video
      ref={ref}
      key={media.key}
      src={reduce ? `${src}#t=0.1` : src}
      autoPlay={!reduce}
      loop
      muted
      playsInline
      preload={reduce ? 'metadata' : 'auto'}
      aria-hidden
      onError={media.fail}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

// ── Stage playback ────────────────────────────────────────────────────────────

type ClipPlayer = ReturnType<typeof useClipPlayer>;

/** Playback state for the stage clip. Reduced motion never autoplays. */
function useClipPlayer(src: string | null) {
  const reduce = !!useReducedMotion();
  const ref = useRef<HTMLVideoElement>(null);
  const media = useMediaRetry(src);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    setTime(0);
    setDuration(0);
  }, [src]);
  useEffect(() => {
    // React can drop the `muted` attribute; set it on the element directly.
    if (ref.current) ref.current.muted = muted;
  }, [muted, media.key]);

  return {
    ref, media, reduce, playing, time, duration, muted,
    setPlaying, setTime, setDuration,
    toggleMute: () => setMuted((m) => !m),
    toggle: () => {
      const v = ref.current;
      if (!v) return;
      if (v.paused) void v.play().catch(() => setPlaying(false));
      else v.pause();
    },
    seek: (value: number) => {
      const v = ref.current;
      if (!v) return;
      v.currentTime = value;
      setTime(value);
    },
  };
}

function StageVideo({ player, src }: { player: ClipPlayer; src: string }) {
  if (player.media.broken) return <MediaError large onRetry={player.media.retry} />;
  return (
    <video
      ref={player.ref}
      key={player.media.key}
      src={src}
      autoPlay={!player.reduce}
      loop
      muted={player.muted}
      playsInline
      preload="auto"
      onPlay={() => player.setPlaying(true)}
      onPause={() => player.setPlaying(false)}
      onTimeUpdate={(e) => player.setTime(e.currentTarget.currentTime)}
      onLoadedMetadata={(e) => player.setDuration(e.currentTarget.duration)}
      onError={player.media.fail}
      onClick={player.toggle}
      className="absolute inset-0 h-full w-full cursor-pointer object-contain"
    />
  );
}

function PlayerControls({ player }: { player: ClipPlayer }) {
  const { time, duration, playing, muted, media } = player;
  const pct = duration > 0 ? (time / duration) * 100 : 0;
  return (
    <div className="flex items-center gap-1 border-x border-b border-rule bg-sheet px-1 py-1">
      <Button
        size="icon"
        variant="quiet"
        disabled={media.broken}
        onClick={player.toggle}
        aria-label={playing ? 'Pause clip' : 'Play clip'}
        className="h-10 w-10 text-ink"
      >
        <Glyph name={playing ? 'pause' : 'play'} />
      </Button>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.01}
        value={Math.min(time, duration || 0)}
        disabled={media.broken || !duration}
        onChange={(e) => player.seek(Number(e.target.value))}
        aria-label="Clip position"
        aria-valuetext={`${clipTime(time)} of ${clipTime(duration)}`}
        className="scrubber min-w-0 flex-1"
        style={{ '--pct': `${pct}%` } as CSSProperties}
      />
      <span className="tnum shrink-0 px-2 text-[13px] text-ink-2">
        {clipTime(time)} / {clipTime(duration)}
      </span>
      <Button
        size="icon"
        variant="quiet"
        disabled={media.broken}
        onClick={player.toggleMute}
        aria-label="Mute clip"
        aria-pressed={muted}
        className="h-10 w-10 text-ink"
      >
        <Glyph name={muted ? 'muted' : 'sound'} />
      </Button>
    </div>
  );
}
