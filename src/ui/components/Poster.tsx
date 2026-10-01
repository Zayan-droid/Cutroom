import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Play } from 'lucide-react';
import { cn } from '@/lib/cn';
import { aspectFor, posterColors, posterStyle } from '@/lib/media';
import { tBase } from '@/lib/motion';
import type { Take } from '@/types';

interface PosterProps {
  take: Take;
  className?: string;
  rounded?: string;
  layoutId?: string;
  withDrift?: boolean;
  badge?: boolean;
}

/** A real bundled clip from the engine (Part A), not a synthetic gradient marker. */
function realAsset(take: Take): string | null {
  const url = take.assetUrl;
  return take.status === 'ready' && url && !url.startsWith('placeholder://') ? url : null;
}

export function Poster({
  take,
  className,
  rounded = 'rounded-xl',
  layoutId,
  withDrift = true,
  badge = true,
}: PosterProps) {
  const reduce = useReducedMotion();
  const ready = take.status === 'ready';
  const loading = take.status === 'queued' || take.status === 'generating';
  const failed = take.status === 'failed';
  const [c1, c2] = posterColors(take.id);
  const pct = Math.round((take.progress ?? 0) * 100);

  // Play the engine's bundled clip when one exists and motion is allowed;
  // otherwise fall back to the gradient frame (also the graceful load/error state).
  // If the clip fails to load — a stale persisted URL after a redeploy, or a
  // network/codec error — drop back to the gradient, which restores the play
  // affordance and drift rather than leaving a broken/empty tile.
  const asset = realAsset(take);
  const [videoBroke, setVideoBroke] = useState(false);
  const showVideo = asset !== null && !reduce && !videoBroke;
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    setVideoBroke(false);
    // React can drop the `muted` attribute; force it so inline autoplay is allowed.
    if (videoRef.current) videoRef.current.muted = true;
  }, [asset]);

  return (
    <div
      className={cn('relative overflow-hidden grain bg-[#0A0E1C]', rounded, className)}
      style={{ aspectRatio: aspectFor(take.intent.kind) }}
    >
      {/* Base generated frame — a poster behind the clip, and the fallback if it fails. */}
      <motion.div
        layoutId={layoutId}
        className="absolute inset-0"
        style={posterStyle(take.id)}
        animate={{ opacity: ready ? 1 : loading ? 0.32 : 0.22 }}
        transition={tBase}
      />

      {showVideo && (
        <video
          ref={videoRef}
          key={asset}
          src={asset ?? undefined}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-hidden
          onError={() => setVideoBroke(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* Slow "footage" drift — only on the gradient fallback (the clip already moves). */}
      {ready && !showVideo && withDrift && !reduce && (
        <div
          className="absolute inset-[-12%] animate-drift"
          style={{
            backgroundImage: `radial-gradient(45% 45% at 60% 40%, ${c1}88, transparent 70%), radial-gradient(40% 40% at 30% 70%, ${c2}77, transparent 70%)`,
          }}
        />
      )}

      {/* Cinematic vignette. */}
      <div
        className="absolute inset-0"
        style={{ boxShadow: 'inset 0 0 90px 12px rgba(0,0,0,0.55)' }}
      />

      {/* Play affordance only when not already playing a clip. */}
      {ready && !showVideo && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-black/30 backdrop-blur-sm ring-1 ring-white/25">
            <Play className="h-5 w-5 translate-x-[1px] fill-white text-white" />
          </div>
        </div>
      )}

      {/* Loading: shimmer sweep + progress. */}
      {loading && (
        <>
          {!reduce && (
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute inset-y-0 -left-1/2 w-1/2 animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 p-2.5">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-fg-muted">
              <span>{take.status === 'queued' ? 'Queued' : 'Generating'}</span>
              <span className="tnum">{pct}%</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                animate={{ width: `${Math.max(6, pct)}%` }}
                transition={{ duration: 0.2, ease: 'linear' }}
              />
            </div>
          </div>
        </>
      )}

      {failed && <div className="absolute inset-0 bg-[#1A0B12]/70" />}

      {badge && ready && (
        <span className="absolute bottom-2 left-2 rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/70 backdrop-blur-sm">
          Placeholder
        </span>
      )}
    </div>
  );
}
