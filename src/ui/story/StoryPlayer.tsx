import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { StoryTimeline } from '../../story/types';
import { posterStyle } from '../../lib/media';
import { cn } from '../../lib/cn';
import { Button } from '../components/ui';
import { Glyph } from '../components/Glyph';
import { StoryStage } from './StoryStage';
import { Transport } from './Transport';
import { useSpeechVoices, VoicePicker } from './LanguagePicker';
import { useStoryPlayer } from './useStoryPlayer';
import { chooseVoice } from './voices';
import { formatTime, frameAt } from './playback';
import { drawStoryFrame, FRAME_HEIGHT, FRAME_WIDTH, loadSceneImages, type SceneImages } from './renderFrame';
import { recordCanvas, recordingType, type CanvasRecording } from './export/recorder';
import { downloadBlob, subtitlesToVtt } from './export/subtitles';

const TRANSITION_NAMES: Record<string, string> = { cut: 'cut', fade: 'fade in', slide: 'slide in' };

export function StoryPlayer({ timeline }: { timeline: StoryTimeline }) {
  const { voices, supported } = useSpeechVoices();
  const [preferredVoice, setPreferredVoice] = useState<string>();
  const selectedVoice = chooseVoice(voices, timeline.lang, preferredVoice);
  const player = useStoryPlayer(timeline, selectedVoice?.voiceURI);
  const [captions, setCaptions] = useState(true);
  const [images, setImages] = useState<SceneImages>(new Map());
  const [imagesReady, setImagesReady] = useState(false);
  const reducedMotion = !!useReducedMotion();
  const [recording, setRecording] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [video, setVideo] = useState<Blob | null>(null);
  const [exportError, setExportError] = useState('');
  const recorder = useRef<CanvasRecording | null>(null);
  const exportCanvas = useRef<HTMLCanvasElement | null>(null);
  const canRecord = recordingType() !== null;
  const currentScene = frameAt(timeline, player.time).scene;

  useEffect(() => {
    const controller = new AbortController();
    loadSceneImages(timeline, controller.signal).then((loaded) => {
      if (!controller.signal.aborted) { setImages(loaded); setImagesReady(true); }
    });
    return () => controller.abort();
  }, [timeline]);

  const releaseCanvas = () => { exportCanvas.current?.remove(); exportCanvas.current = null; };
  useEffect(() => () => { recorder.current?.cancel(); recorder.current = null; releaseCanvas(); }, []);

  useEffect(() => {
    if (!preparing) return;
    let frame = 0;
    const warmup = () => {
      const context = exportCanvas.current?.getContext('2d');
      if (!context) return;
      drawStoryFrame(context, timeline, 0, { images, captions, reducedMotion });
      recorder.current?.captureFrame();
      frame = requestAnimationFrame(warmup);
    };
    frame = requestAnimationFrame(warmup);
    return () => cancelAnimationFrame(frame);
  }, [preparing, timeline, images, captions, reducedMotion]);

  useEffect(() => {
    const context = exportCanvas.current?.getContext('2d');
    if (!recording || !context) return;
    drawStoryFrame(context, timeline, player.time, { images, viseme: player.viseme, captions, reducedMotion });
    recorder.current?.captureFrame();
    if (preparing) return;
    if (player.time >= timeline.totalMs) recorder.current?.finish();
    else if (player.playing) recorder.current?.resume();
    else recorder.current?.pause();
  }, [timeline, player.time, player.viseme, player.playing, recording, preparing, images, captions, reducedMotion]);

  const startRecording = () => {
    setExportError(''); setVideo(null);
    player.pause(); player.seek(0);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = FRAME_WIDTH; canvas.height = FRAME_HEIGHT;
      // Keep the capture surface in the paint tree; some browsers stop producing
      // frames from detached canvases after other canvases have been unmounted.
      canvas.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0.01;pointer-events:none';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.append(canvas);
      exportCanvas.current = canvas;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas recording is unavailable.');
      drawStoryFrame(context, timeline, 0, { images, captions, reducedMotion });
      recorder.current = recordCanvas(canvas, (blob) => {
        setVideo(blob); setRecording(false); setPreparing(false); recorder.current = null; releaseCanvas();
      }, (message) => {
        setExportError(message); setRecording(false); setPreparing(false); recorder.current = null; releaseCanvas();
      }, () => { setPreparing(false); player.play(); });
      setPreparing(true); setRecording(true);
    } catch (error) {
      releaseCanvas();
      setExportError(error instanceof Error ? error.message : 'Could not start recording.');
    }
  };

  const recordPct = timeline.totalMs > 0 ? Math.min(1, player.time / timeline.totalMs) : 0;

  return <div className="flex min-w-0 flex-col gap-6">
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule pb-3">
        <h2 className="font-text text-[26px] font-semibold leading-tight" lang={timeline.lang} dir="auto">{timeline.title}</h2>
        <span className="tnum text-sm font-medium text-ink-2">{timeline.scenes.length} scenes · {formatTime(timeline.totalMs)}</span>
      </div>
      <div className="mt-4">
        <StoryStage timeline={timeline} time={player.time} viseme={player.viseme} captions={captions} images={images} reducedMotion={reducedMotion} />
        <Transport time={player.time} totalMs={timeline.totalMs} playing={player.playing} captions={captions} muted={player.muted}
          locked={recording} preparing={preparing} onPlay={player.play} onPause={player.pause} onSeek={player.seek}
          onCaptions={() => setCaptions((value) => !value)} onMute={player.toggleMute} />
      </div>
      {player.notice && <p role="status" className="mt-2 text-sm text-ink-2">{player.notice}</p>}
    </div>

    <section aria-labelledby="scenes-title">
      <h3 id="scenes-title" className="text-sm font-semibold text-ink">Scenes</h3>
      <ol className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {timeline.scenes.map((scene, index) => {
          const current = currentScene?.id === scene.id;
          return <li key={scene.id}>
            <button type="button" disabled={recording} onClick={() => player.seek(scene.startMs)}
              aria-label={`Go to scene ${index + 1}, starts at ${formatTime(scene.startMs)}`} aria-current={current ? 'step' : undefined}
              className="group flex w-full flex-col gap-1.5 text-left disabled:cursor-not-allowed disabled:opacity-60">
              <span aria-hidden className={cn('block aspect-video w-full outline outline-offset-2 transition-[outline-color] duration-150',
                current ? 'outline-2 outline-mark' : 'outline-1 outline-transparent group-hover:outline-edge')}
                style={posterStyle(scene.posterSeed)} />
              <span className="flex items-baseline justify-between gap-2">
                <span className={cn('text-[15px]', current ? 'font-semibold text-ink' : 'font-medium text-ink-2')}>Scene {index + 1}</span>
                <span className="tnum text-[13px] text-ink-3">{formatTime(scene.startMs)}</span>
              </span>
              <span className="-mt-1 text-[13px] text-ink-3">{TRANSITION_NAMES[scene.transition] ?? scene.transition}</span>
            </button>
          </li>;
        })}
      </ol>
    </section>

    <section aria-labelledby="export-title" className="grid gap-6 rounded-md border border-rule bg-sheet p-5 md:grid-cols-2">
      <VoicePicker voices={voices} supported={supported} lang={timeline.lang} voiceURI={preferredVoice} onChange={setPreferredVoice} disabled={recording} />
      <div className="flex flex-col gap-3">
        <h3 id="export-title" className="text-sm font-semibold text-ink">Downloads</h3>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" leftIcon={<Glyph name="download" />} onClick={() => downloadBlob(new Blob([subtitlesToVtt(timeline.subtitles)], { type: 'text/vtt;charset=utf-8' }), `story-${timeline.lang}.vtt`)}>
            Subtitles (.vtt)
          </Button>
          {recording
            ? <Button size="sm" variant="danger" leftIcon={<Glyph name="stop" />} onClick={() => {
                recorder.current?.cancel(); recorder.current = null; releaseCanvas(); setRecording(false); setPreparing(false); player.pause();
              }}>Cancel recording</Button>
            : <Button size="sm" disabled={!canRecord || !imagesReady} leftIcon={<Glyph name="record" className="text-mark" />} onClick={startRecording}>
                Record silent video
              </Button>}
          {video && <Button size="sm" variant="primary" leftIcon={<Glyph name="download" />} onClick={() => downloadBlob(video, `story-${timeline.lang}.${video.type.includes('mp4') ? 'mp4' : 'webm'}`)}>
            Save video
          </Button>}
        </div>
        <p className="text-[13px] leading-snug text-ink-2">
          {canRecord
            ? 'Recording plays the story from the start in real time. The file includes the pictures, the character, and subtitles if they are on — narration is heard here but is not saved in the file.'
            : 'Video recording is unavailable in this browser. You can still download the subtitle track.'}
        </p>
        {recording && <div role="status" className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">
          <p className="tnum">{preparing ? 'Preparing to record' : player.playing ? 'Recording' : 'Recording paused'} · {formatTime(player.time)} / {formatTime(timeline.totalMs)}</p>
          <div role="progressbar" aria-label="Recording progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(recordPct * 100)} className="h-1 bg-ink/10">
            <div className="h-full origin-left bg-mark" style={{ transform: `scaleX(${recordPct})` }} />
          </div>
        </div>}
        {video && <p role="status" className="text-[13px] font-medium text-ok">Your silent video is ready to save.</p>}
        {exportError && <p role="alert" className="text-[13px] text-bad">{exportError}</p>}
      </div>
    </section>
  </div>;
}
