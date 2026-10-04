import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { clamp, type Size } from '@/edit/geometry';

// Loading and playing the source picture behind an edit. The element is kept
// out of sight (the canvas shows the edited picture) but inside the document,
// because some browsers stop decoding video that isn't attached to a page.

export type MediaKind = 'video' | 'image';

export interface EditMedia {
  element: HTMLVideoElement | HTMLImageElement | null;
  size: Size | null;
  /** Seconds; 0 for stills. */
  duration: number;
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** False when the file's host blocks reading its pixels: it previews, but can't be downloaded. */
  readable: boolean;
  retry(): void;
}

const HIDDEN = 'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0.01;pointer-events:none;';

/** Cross-origin files need CORS to be read back; same-origin, data:, and blob: files never do. */
export function needsCors(url: string): boolean {
  if (typeof location === 'undefined') return false;
  try {
    const parsed = new URL(url, location.href);
    return parsed.protocol !== 'data:' && parsed.protocol !== 'blob:' && parsed.origin !== location.origin;
  } catch {
    return false;
  }
}

/** Stop a video downloading and decoding before dropping it. */
export function releaseVideo(video: HTMLVideoElement) {
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.remove();
}

interface Loaded {
  element: HTMLVideoElement | HTMLImageElement | null;
  size: Size | null;
  duration: number;
  status: EditMedia['status'];
  readable: boolean;
}

const IDLE: Loaded = { element: null, size: null, duration: 0, status: 'idle', readable: true };

/**
 * Loads `url` as a hidden video or image. Tries CORS first so the pixels can
 * be exported; if the host refuses, loads it again for preview only.
 */
export function useEditMedia(url: string | null, kind: MediaKind): EditMedia {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>(IDLE);

  useEffect(() => {
    if (!url) {
      setLoaded(IDLE);
      return;
    }
    let disposed = false;
    let current: HTMLVideoElement | HTMLImageElement | null = null;
    setLoaded({ ...IDLE, status: 'loading' });

    const drop = () => {
      if (!current) return;
      if (current instanceof HTMLVideoElement) releaseVideo(current);
      else {
        current.onload = null;
        current.onerror = null;
        current.removeAttribute('src');
      }
      current = null;
    };

    const load = (cors: boolean) => {
      const fail = () => {
        if (disposed) return;
        drop();
        if (cors && needsCors(url)) load(false);
        else setLoaded({ ...IDLE, status: 'error' });
      };

      if (kind === 'image') {
        const image = new Image();
        current = image;
        if (cors) image.crossOrigin = 'anonymous';
        image.decoding = 'async';
        image.onload = () => {
          if (disposed || current !== image) return;
          setLoaded({
            element: image,
            size: { width: image.naturalWidth, height: image.naturalHeight },
            duration: 0,
            status: 'ready',
            readable: cors || !needsCors(url),
          });
        };
        image.onerror = fail;
        image.src = url;
        return;
      }

      const video = document.createElement('video');
      current = video;
      if (cors) video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.setAttribute('aria-hidden', 'true');
      video.style.cssText = HIDDEN;
      video.addEventListener('loadeddata', () => {
        if (disposed || current !== video) return;
        setLoaded({
          element: video,
          size: { width: video.videoWidth, height: video.videoHeight },
          duration: Number.isFinite(video.duration) ? video.duration : 0,
          status: 'ready',
          readable: cors || !needsCors(url),
        });
      }, { once: true });
      video.addEventListener('error', fail, { once: true });
      document.body.append(video);
      video.src = url;
    };

    load(true);
    return () => {
      disposed = true;
      drop();
    };
  }, [url, kind, attempt]);

  return { ...loaded, retry: () => setAttempt((n) => n + 1) };
}

export interface EditPlayer {
  playing: boolean;
  /** Playhead, in source seconds. */
  time: number;
  muted: boolean;
  toggle(): void;
  pause(): void;
  seek(seconds: number): void;
  toggleMute(): void;
}

/**
 * Plays a source video inside the kept range, looping at its end. Reduced
 * motion never autoplays. The playhead can still be scrubbed outside the range
 * (to pick trim points); pressing play starts again from the range's start.
 */
export function useEditPlayer(video: HTMLVideoElement | null, range: { start: number; end: number }, autoplay = true): EditPlayer {
  const reduce = !!useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [muted, setMuted] = useState(true);
  const rangeRef = useRef(range);
  rangeRef.current = range;

  useEffect(() => {
    if (video) video.muted = muted;
  }, [video, muted]);

  useEffect(() => {
    if (!video) return;
    let frame = 0;
    let lastPaint = 0;
    const outside = (t: number) => t < rangeRef.current.start - 0.05 || t >= rangeRef.current.end - 0.03;
    const loop = (now: number) => {
      if (video.paused) return;
      if (outside(video.currentTime)) video.currentTime = rangeRef.current.start;
      // The scrubber only needs about ten updates a second.
      if (now - lastPaint > 100) {
        lastPaint = now;
        setTime(video.currentTime);
      }
      frame = requestAnimationFrame(loop);
    };
    const onPlay = () => {
      setPlaying(true);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(loop);
    };
    const onPause = () => {
      setPlaying(false);
      setTime(video.currentTime);
    };
    const onSeeked = () => setTime(video.currentTime);
    const onEnded = () => {
      video.currentTime = rangeRef.current.start;
      void video.play().catch(() => setPlaying(false));
    };
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('ended', onEnded);
    setTime(video.currentTime);
    if (!video.paused) onPlay();
    else if (autoplay && !reduce) {
      video.currentTime = rangeRef.current.start;
      void video.play().catch(() => setPlaying(false));
    }
    return () => {
      cancelAnimationFrame(frame);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('ended', onEnded);
    };
    // Autoplay is decided once per element.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video]);

  return {
    playing,
    time,
    muted,
    toggle: () => {
      if (!video) return;
      if (!video.paused) {
        video.pause();
        return;
      }
      const { start, end } = rangeRef.current;
      if (video.currentTime < start - 0.05 || video.currentTime >= end - 0.03) video.currentTime = start;
      void video.play().catch(() => setPlaying(false));
    },
    pause: () => video?.pause(),
    seek: (seconds) => {
      if (!video) return;
      const total = Number.isFinite(video.duration) ? video.duration : 0;
      const next = clamp(seconds, 0, total);
      video.currentTime = next;
      setTime(next);
    },
    toggleMute: () => setMuted((m) => !m),
  };
}
