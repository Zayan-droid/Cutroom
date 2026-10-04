import { useEffect, useRef, useState } from 'react';
import type { Rect, RenderPlan, Size } from '@/edit/geometry';
import { cn } from '@/lib/cn';
import { createRenderer, SourceBlockedError, type FrameRenderer } from './renderer';

/** Device pixels per CSS pixel are capped so a large preview stays cheap to redraw. */
const MAX_DPR = 2;

/**
 * The edited picture, drawn live from a hidden source element. It redraws on
 * every presented video frame while playing, after seeks and pauses, when the
 * edit changes, and when its box resizes. If the source's host blocks WebGL
 * from reading it, it switches to the 2D renderer (preview only).
 *
 * Each renderer gets its own canvas element, created and removed with it: a
 * canvas can only ever hold one kind of context, and a released WebGL context
 * can't be taken back (React's development double-mount does exactly that).
 */
export function EditCanvas({
  source,
  size,
  plan,
  view,
  label,
  renderer: prefer = 'webgl',
  className,
}: {
  source: HTMLVideoElement | HTMLImageElement | null;
  size: Size | null;
  plan: RenderPlan;
  /** Part of the output frame to show, in output pixels. */
  view?: Rect;
  /** Accessible description; omit for a decorative picture (e.g. a thumbnail inside a labeled button). */
  label?: string;
  /** Thumbnails use 2D so a long list never runs into the browser's cap on WebGL contexts. */
  renderer?: 'webgl' | '2d';
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<FrameRenderer | null>(null);
  const [fallback, setFallback] = useState(false);
  const latest = useRef({ source, size, plan, view });
  latest.current = { source, size, plan, view };

  // A stable redraw that always reads the latest inputs (used by frame callbacks).
  const draw = useRef(() => {});
  draw.current = () => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    const now = latest.current;
    if (!canvas || !renderer || !now.source || !now.size) return;
    const box = canvas.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return;
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const width = Math.round(box.width * dpr);
    const height = Math.round(box.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    try {
      renderer.draw(now.source, now.size, now.plan, { quality: 'preview', view: now.view });
    } catch (error) {
      if (error instanceof SourceBlockedError) setFallback(true);
    }
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'absolute inset-0 block h-full w-full';
    host.append(canvas);
    const renderer = createRenderer(canvas, { prefer: fallback ? '2d' : prefer });
    canvasRef.current = canvas;
    rendererRef.current = renderer;
    draw.current();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => draw.current());
    observer?.observe(host);
    return () => {
      observer?.disconnect();
      renderer.dispose();
      canvas.remove();
      if (rendererRef.current === renderer) rendererRef.current = null;
      if (canvasRef.current === canvas) canvasRef.current = null;
    };
  }, [fallback, prefer]);

  useEffect(() => {
    draw.current();
  }, [source, size, plan, view]);

  // Follow the video: every presented frame while playing, single frames otherwise.
  useEffect(() => {
    if (typeof HTMLVideoElement === 'undefined' || !(source instanceof HTMLVideoElement)) return;
    const video = source;
    const frameCallbacks = typeof video.requestVideoFrameCallback === 'function';
    let handle = 0;
    let active = true;
    const cancel = () => {
      if (frameCallbacks) video.cancelVideoFrameCallback(handle);
      else cancelAnimationFrame(handle);
    };
    const loop = () => {
      if (!active) return;
      draw.current();
      if (!video.paused && !video.ended) schedule();
    };
    const schedule = () => {
      cancel();
      handle = frameCallbacks ? video.requestVideoFrameCallback(loop) : requestAnimationFrame(loop);
    };
    const still = () => {
      draw.current();
      // Some browsers fire `seeked` before the new frame can be read; draw again when it shows.
      if (frameCallbacks && video.paused) schedule();
    };
    video.addEventListener('play', schedule);
    video.addEventListener('seeked', still);
    video.addEventListener('pause', still);
    video.addEventListener('loadeddata', still);
    if (!video.paused) schedule();
    return () => {
      active = false;
      cancel();
      video.removeEventListener('play', schedule);
      video.removeEventListener('seeked', still);
      video.removeEventListener('pause', still);
      video.removeEventListener('loadeddata', still);
    };
  }, [source]);

  return (
    <div
      ref={hostRef}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('absolute inset-0', className)}
    />
  );
}
