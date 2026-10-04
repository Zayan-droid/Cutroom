import { clamp, planEdit, trimRange, type Size } from '@/edit/geometry';
import type { EditRecipe } from '@/types';
import { createRenderer, SourceBlockedError, type FrameRenderer } from './renderer';
import { browserRecordingType, extensionFor, videoBitrate } from './recording';
import { releaseVideo } from './media';

// Bakes an edit into a real file in the browser. Stills become PNGs. Video is
// played once from the trim start to its end while every frame is drawn
// through the edit at full output size and recorded, so an export takes as
// long as the kept clip. Sound comes along when the browser allows it.

export interface ExportRequest {
  url: string;
  kind: 'video' | 'image';
  recipe: EditRecipe;
  /** 0–1 while a video records. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface ExportedFile {
  blob: Blob;
  extension: string;
  width: number;
  height: number;
}

/** A failure with a message written for the person exporting. */
export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportError';
  }
}

export const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

const HIDDEN = 'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0.01;pointer-events:none;';
const LOAD_TIMEOUT = 30_000;
/** Give up if playback makes no progress for this long (a stalled network, a stuck decoder). */
const STALL_TIMEOUT = 15_000;

export function exportEdit(request: ExportRequest): Promise<ExportedFile> {
  if (request.signal?.aborted) return Promise.reject(new DOMException('Export cancelled', 'AbortError'));
  return request.kind === 'image' ? exportStill(request) : exportVideo(request);
}

function aborted(): DOMException {
  return new DOMException('Export cancelled', 'AbortError');
}

/** Resolve on the first of `ok` events, reject on `bad` events, abort, or timeout. */
function waitFor(target: EventTarget, ok: string[], bad: string[], options: { signal?: AbortSignal; timeout: number; message: string }) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => finish(new ExportError(options.message)), options.timeout);
    const onOk = () => finish();
    const onBad = () => finish(new ExportError(options.message));
    const onAbort = () => finish(aborted());
    function finish(error?: unknown) {
      clearTimeout(timer);
      ok.forEach((name) => target.removeEventListener(name, onOk));
      bad.forEach((name) => target.removeEventListener(name, onBad));
      options.signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    }
    ok.forEach((name) => target.addEventListener(name, onOk));
    bad.forEach((name) => target.addEventListener(name, onBad));
    options.signal?.addEventListener('abort', onAbort);
  });
}

function makeCanvas(size: Size): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  // Keep the capture surface in the page; some browsers stop producing frames
  // from canvases that aren't painted.
  canvas.style.cssText = HIDDEN;
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  return canvas;
}

function draw(renderer: FrameRenderer, source: HTMLVideoElement | HTMLImageElement, size: Size, plan: ReturnType<typeof planEdit>) {
  try {
    renderer.draw(source, size, plan, { quality: 'export' });
  } catch (error) {
    if (error instanceof SourceBlockedError) throw new ExportError(error.message);
    throw error;
  }
}

// ── Stills ────────────────────────────────────────────────────────────────────

async function exportStill({ url, recipe, signal }: ExportRequest): Promise<ExportedFile> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.decoding = 'async';
  const loaded = waitFor(image, ['load'], ['error'], { signal, timeout: LOAD_TIMEOUT, message: "Couldn't load this image. Check your connection and try again." });
  image.src = url;
  await loaded;
  const size = { width: image.naturalWidth, height: image.naturalHeight };
  const plan = planEdit(recipe, size);
  const canvas = makeCanvas(plan);
  const renderer = createRenderer(canvas, { preserveDrawingBuffer: true });
  try {
    draw(renderer, image, size, plan);
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      try {
        canvas.toBlob(resolve, 'image/png');
      } catch {
        reject(new ExportError("This file's host doesn't allow it to be edited in the browser."));
      }
    });
    if (!blob) throw new ExportError("The browser couldn't make the image file. Try a smaller upscale.");
    if (signal?.aborted) throw aborted();
    return { blob, extension: 'png', width: plan.width, height: plan.height };
  } finally {
    renderer.dispose();
    canvas.remove();
  }
}

// ── Video ─────────────────────────────────────────────────────────────────────

function seekTo(video: HTMLVideoElement, seconds: number, signal?: AbortSignal): Promise<void> {
  if (Math.abs(video.currentTime - seconds) < 1e-3 && video.readyState >= 2) return Promise.resolve();
  const done = waitFor(video, ['seeked'], ['error'], { signal, timeout: LOAD_TIMEOUT, message: "Couldn't read this clip. Try again." });
  video.currentTime = seconds;
  return done;
}

/** Route the clip's sound into a stream (not the speakers). Null when the browser won't allow it. */
async function captureSound(context: AudioContext | null, video: HTMLVideoElement): Promise<MediaStreamTrack | null> {
  if (!context) return null;
  try {
    // resume() can wait indefinitely for a click the browser wants; don't let it hold the export.
    if (context.state !== 'running') {
      await Promise.race([context.resume().catch(() => {}), new Promise((done) => setTimeout(done, 500))]);
    }
    if (context.state !== 'running') return null;
    const destination = context.createMediaStreamDestination();
    context.createMediaElementSource(video).connect(destination);
    video.muted = false;
    // Playing with sound needs permission; check before recording starts.
    await video.play();
    video.pause();
    return destination.stream.getAudioTracks()[0] ?? null;
  } catch {
    video.pause();
    video.muted = true;
    return null;
  }
}

async function exportVideo({ url, recipe, onProgress, signal }: ExportRequest): Promise<ExportedFile> {
  if (!browserRecordingType(false)) throw new ExportError("Video downloads aren't available in this browser.");

  // Created before any await so it counts as part of the click that started the export.
  let context: AudioContext | null = null;
  try {
    context = typeof AudioContext === 'undefined' ? null : new AudioContext();
  } catch {
    context = null;
  }

  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.style.cssText = HIDDEN;
  video.setAttribute('aria-hidden', 'true');
  document.body.append(video);

  let canvas: HTMLCanvasElement | null = null;
  let renderer: FrameRenderer | null = null;
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;

  try {
    const loaded = waitFor(video, ['loadeddata'], ['error'], {
      signal,
      timeout: LOAD_TIMEOUT,
      message: "Couldn't load this clip. Check your connection and try again.",
    });
    video.src = url;
    await loaded;

    const size = { width: video.videoWidth, height: video.videoHeight };
    const plan = planEdit(recipe, size);
    const range = trimRange(recipe.trim, video.duration);
    if (!(range.end > range.start)) throw new ExportError('This clip has no frames to export.');

    canvas = makeCanvas(plan);
    renderer = createRenderer(canvas, { preserveDrawingBuffer: true });
    await seekTo(video, range.start, signal);
    draw(renderer, video, size, plan);

    const sound = await captureSound(context, video);
    if (sound) await seekTo(video, range.start, signal);
    // A browser that can't record sound in any container still records the picture.
    const withSound = sound ? browserRecordingType(true) : null;
    const type = withSound ?? browserRecordingType(false);
    if (!type) throw new ExportError("Video downloads aren't available in this browser.");

    stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
    if (!track) throw new ExportError("Video downloads aren't available in this browser.");
    if (sound && withSound) stream.addTrack(sound);

    const active = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: videoBitrate(plan), audioBitsPerSecond: 128_000 });
    recorder = active;
    const chunks: Blob[] = [];
    active.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve, reject) => {
      active.onstop = () => resolve();
      active.onerror = () => reject(new ExportError("The browser couldn't finish the export. Try again."));
    });
    const started = waitFor(active, ['start'], ['error'], { signal, timeout: 10_000, message: "The browser couldn't start recording. Try again." });
    active.start(500);
    await started;
    track.requestFrame?.();

    await playThrough(video, range, active, signal, onProgress, () => {
      draw(renderer!, video, size, plan);
      track.requestFrame?.();
    });

    active.stop();
    await stopped;
    const blob = new Blob(chunks, { type: active.mimeType || type });
    if (!blob.size) throw new ExportError('The export came out empty. Try again.');
    onProgress?.(1);
    return { blob, extension: extensionFor(blob.type || type), width: plan.width, height: plan.height };
  } finally {
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null;
      recorder.stop();
    }
    stream?.getTracks().forEach((t) => t.stop());
    void context?.close().catch(() => {});
    renderer?.dispose();
    canvas?.remove();
    releaseVideo(video);
  }
}

/**
 * Play from the range's start to its end, drawing every frame the browser
 * presents. Buffering and hidden tabs pause the recording, so the file never
 * freezes on a frame while the clip waits.
 */
function playThrough(
  video: HTMLVideoElement,
  range: { start: number; end: number },
  recorder: MediaRecorder,
  signal: AbortSignal | undefined,
  onProgress: ((fraction: number) => void) | undefined,
  drawFrame: () => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let done = false;
    let frame = 0;
    let stall = setTimeout(() => finish(stallError()), STALL_TIMEOUT);
    const frameCallbacks = typeof video.requestVideoFrameCallback === 'function';
    const length = range.end - range.start;

    function stallError() {
      return new ExportError('The clip stopped loading during the export. Try again.');
    }
    function finish(error?: unknown) {
      if (done) return;
      done = true;
      clearTimeout(stall);
      if (frameCallbacks) video.cancelVideoFrameCallback(frame);
      else cancelAnimationFrame(frame);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onError);
      document.removeEventListener('visibilitychange', onVisibility);
      signal?.removeEventListener('abort', onAbort);
      video.pause();
      if (error) reject(error);
      else resolve();
    }
    function tick(_now?: number, meta?: VideoFrameCallbackMetadata) {
      if (done) return;
      const t = meta?.mediaTime ?? video.currentTime;
      if (t >= range.end - 1e-3 || video.ended) {
        finish();
        return;
      }
      try {
        drawFrame();
      } catch (error) {
        finish(error);
        return;
      }
      clearTimeout(stall);
      stall = setTimeout(() => finish(stallError()), STALL_TIMEOUT);
      onProgress?.(clamp((t - range.start) / length, 0, 1));
      schedule();
    }
    function schedule() {
      // One chain of frame callbacks at a time, even after a hidden tab resumes.
      if (frameCallbacks) video.cancelVideoFrameCallback(frame);
      else cancelAnimationFrame(frame);
      frame = frameCallbacks ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(() => tick());
    }
    function onEnded() {
      finish();
    }
    function onWaiting() {
      if (recorder.state === 'recording') recorder.pause();
    }
    function onPlaying() {
      if (recorder.state === 'paused' && !document.hidden) recorder.resume();
    }
    function onError() {
      finish(stallError());
    }
    function onVisibility() {
      // Hidden tabs throttle frame callbacks; hold the recording until the tab is back.
      if (document.hidden) {
        clearTimeout(stall);
        video.pause();
        if (recorder.state === 'recording') recorder.pause();
      } else {
        stall = setTimeout(() => finish(stallError()), STALL_TIMEOUT);
        if (recorder.state === 'paused') recorder.resume();
        void video.play().then(schedule, (error) => finish(error));
      }
    }
    function onAbort() {
      finish(aborted());
    }

    video.addEventListener('ended', onEnded);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', onError);
    document.addEventListener('visibilitychange', onVisibility);
    signal?.addEventListener('abort', onAbort);
    if (document.hidden) {
      clearTimeout(stall);
      recorder.pause();
      return;
    }
    video.play().then(schedule, () => finish(new ExportError("The browser wouldn't play this clip. Try again.")));
  });
}
