import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Download, Film, Square } from 'lucide-react';
import type { StoryTimeline } from '../../story/types';
import { posterStyle } from '../../lib/media';
import { Button } from '../components/ui';
import { StoryStage } from './StoryStage';
import { Transport } from './Transport';
import { useSpeechVoices, VoicePicker } from './LanguagePicker';
import { useStoryPlayer } from './useStoryPlayer';
import { chooseVoice } from './voices';
import { formatTime, frameAt } from './playback';
import { drawStoryFrame, FRAME_HEIGHT, FRAME_WIDTH, loadSceneImages, type SceneImages } from './renderFrame';
import { recordCanvas, recordingType, type CanvasRecording } from './export/recorder';
import { downloadBlob, subtitlesToVtt } from './export/subtitles';

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

  return <div className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold" lang={timeline.lang} dir="auto">{timeline.title}</h2>
      <span className="text-xs text-fg-muted">{timeline.scenes.length} scenes · {formatTime(timeline.totalMs)}</span>
    </div>
    <StoryStage timeline={timeline} time={player.time} viseme={player.viseme} captions={captions} images={images} reducedMotion={reducedMotion} />
    <Transport time={player.time} totalMs={timeline.totalMs} playing={player.playing} captions={captions} muted={player.muted}
      locked={recording} preparing={preparing} onPlay={player.play} onPause={player.pause} onSeek={player.seek}
      onCaptions={() => setCaptions((value) => !value)} onMute={player.toggleMute} />
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Story scenes">
      {timeline.scenes.map((scene, index) => <button key={scene.id} disabled={recording} onClick={() => player.seek(scene.startMs)}
        aria-label={`Go to scene ${index + 1}`} aria-current={currentScene?.id === scene.id ? 'step' : undefined}
        className={`relative min-h-20 cursor-pointer overflow-hidden rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed ${currentScene?.id === scene.id ? 'border-primary' : 'border-border hover:border-border-strong'}`}
        style={posterStyle(scene.posterSeed)}>
        <span className="block text-sm font-medium">Scene {index + 1}</span>
        <span className="tnum text-xs text-fg-muted">{formatTime(scene.startMs)} · {scene.transition}</span>
      </button>)}
    </div>
    <div className="grid gap-5 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2">
      <VoicePicker voices={voices} supported={supported} lang={timeline.lang} voiceURI={preferredVoice} onChange={setPreferredVoice} disabled={recording} />
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" leftIcon={<Download className="h-4 w-4" />} onClick={() => downloadBlob(new Blob([subtitlesToVtt(timeline.subtitles)], { type: 'text/vtt;charset=utf-8' }), `story-${timeline.lang}.vtt`)}>Subtitles .vtt</Button>
          {recording ? <Button size="sm" variant="danger" leftIcon={<Square className="h-3 w-3" />} onClick={() => {
            recorder.current?.cancel(); recorder.current = null; releaseCanvas(); setRecording(false); setPreparing(false); player.pause();
          }}>Cancel recording</Button> : <Button size="sm" disabled={!canRecord || !imagesReady} leftIcon={<Film className="h-4 w-4" />} onClick={startRecording}>Record silent video</Button>}
          {video && <Button size="sm" variant="accent" leftIcon={<Download className="h-4 w-4" />} onClick={() => downloadBlob(video, `story-${timeline.lang}.${video.type.includes('mp4') ? 'mp4' : 'webm'}`)}>Save video</Button>}
        </div>
        <p className="text-xs leading-relaxed text-fg-muted">
          {canRecord ? 'Records from the beginning in real time. Video includes the avatar and your subtitle setting; narration is heard here but is not included in the file.' : 'Video recording is unavailable in this browser. You can still download the subtitle track.'}
        </p>
        {recording && <div role="status" className="space-y-1 text-xs text-primary">
          <p>{preparing ? 'Preparing recording' : player.playing ? 'Recording' : 'Recording paused'} · {formatTime(player.time)} / {formatTime(timeline.totalMs)}</p>
          <progress className="h-1.5 w-full accent-primary" value={player.time} max={timeline.totalMs} aria-label="Recording progress" />
        </div>}
        {video && <p role="status" className="text-xs text-success">Your silent video is ready to save.</p>}
        {exportError && <p role="alert" className="text-xs text-danger">{exportError}</p>}
      </div>
    </div>
    {player.notice && <p role="status" className="text-sm text-fg-muted">{player.notice}</p>}
  </div>;
}
