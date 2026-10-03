export function recordingType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined'
    || !HTMLCanvasElement.prototype.captureStream) return null;
  return ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
    .find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export interface CanvasRecording {
  captureFrame(): void;
  pause(): void;
  resume(): void;
  finish(): void;
  cancel(): void;
}

/** Video only: speechSynthesis audio is not exposed as a MediaStream. */
export function recordCanvas(
  canvas: HTMLCanvasElement,
  onReady: (blob: Blob) => void,
  onError: (message: string) => void,
  onStart: () => void = () => {},
): CanvasRecording {
  const type = recordingType();
  if (!type) throw new Error('Video recording is unavailable in this browser. You can still download subtitles.');
  const stream = canvas.captureStream(30);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
  const captureFrame = () => track?.requestFrame?.();
  let released = false;
  let startupTimeout: ReturnType<typeof setTimeout> | undefined;
  const release = () => {
    clearTimeout(startupTimeout);
    if (!released) { released = true; stream.getTracks().forEach((track) => track.stop()); }
  };
  let recorder: MediaRecorder;
  try { recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 3_000_000 }); }
  catch (error) { release(); throw error; }
  let discarded = false;
  const chunks: Blob[] = [];
  recorder.onstart = () => { clearTimeout(startupTimeout); if (!discarded) onStart(); };
  recorder.ondataavailable = (event) => { if (event.data.size && !discarded) chunks.push(event.data); };
  recorder.onstop = () => {
    release();
    if (discarded) return;
    if (!chunks.length) { onError('The recording was empty. Please try again.'); return; }
    onReady(new Blob(chunks, { type: recorder.mimeType || type }));
  };
  recorder.onerror = () => {
    discarded = true; chunks.length = 0; release();
    if (recorder.state !== 'inactive') recorder.stop();
    onError('The browser could not finish recording. Subtitles are still available.');
  };
  startupTimeout = setTimeout(() => {
    discarded = true; chunks.length = 0; release();
    if (recorder.state !== 'inactive') recorder.stop();
    onError('The browser could not start recording. Please try again.');
  }, 10_000);
  try { recorder.start(1000); captureFrame(); }
  catch (error) { release(); throw error; }
  return {
    captureFrame,
    pause: () => { if (recorder.state === 'recording') recorder.pause(); },
    resume: () => { if (recorder.state === 'paused') recorder.resume(); },
    finish: () => { if (recorder.state !== 'inactive') recorder.stop(); },
    cancel: () => {
      discarded = true; chunks.length = 0;
      if (recorder.state !== 'inactive') recorder.stop();
      release();
    },
  };
}
