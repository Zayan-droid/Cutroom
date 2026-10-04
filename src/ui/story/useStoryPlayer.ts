import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoryTimeline, Viseme } from '../../story/types';
import { Narrator } from './Narrator';
import { frameAt, PlaybackClock } from './playback';

// The caller keys its player by timeline identity. Input timelines are never mutated.
export function useStoryPlayer(timeline: StoryTimeline, voiceURI?: string) {
  const [clock] = useState(() => new PlaybackClock(timeline.totalMs));
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [viseme, setViseme] = useState<Viseme>('rest');
  const [notice, setNotice] = useState('');
  const narrator = useRef<Narrator | null>(null);
  const running = useRef(false);

  useEffect(() => {
    const speech = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window ? window.speechSynthesis : null;
    narrator.current = new Narrator(speech, (text) => new SpeechSynthesisUtterance(text), setNotice);
    return () => { narrator.current?.stop(); narrator.current = null; clock.pause(performance.now()); };
  }, [clock]);

  useEffect(() => { narrator.current?.setVoice(voiceURI); }, [voiceURI]);

  const pause = useCallback(() => {
    clock.pause(performance.now()); running.current = false;
    setTime(clock.time(performance.now())); setPlaying(false);
    narrator.current?.stop(); setViseme('rest');
  }, [clock]);

  const play = useCallback(() => {
    clock.play(performance.now()); running.current = true;
    setTime(clock.time(performance.now())); setPlaying(true); setNotice('');
    // Start synchronously inside the user's gesture (required by some browsers).
    const ms = clock.time(performance.now());
    narrator.current?.sync(frameAt(timeline, ms).dialogue, ms, !muted);
  }, [clock, timeline, muted]);

  const seek = useCallback((ms: number) => {
    clock.seek(ms, performance.now()); narrator.current?.stop(); setViseme('rest');
    const next = clock.time(performance.now()); setTime(next);
    if (next >= timeline.totalMs) pause();
    else if (running.current) narrator.current?.sync(frameAt(timeline, next).dialogue, next, !muted);
  }, [clock, pause, timeline, muted]);

  const toggleMute = () => {
    narrator.current?.stop(); setViseme('rest'); setMuted((value) => !value);
  };

  useEffect(() => {
    if (!playing) return;
    let request = 0;
    const tick = (now: number) => {
      const ms = clock.time(now); setTime(ms);
      setViseme(narrator.current?.sync(frameAt(timeline, ms).dialogue, ms, !muted) ?? 'rest');
      if (ms >= timeline.totalMs) { pause(); return; }
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [clock, playing, muted, pause, timeline]);

  useEffect(() => {
    const visibility = () => {
      if (document.hidden && running.current) {
        pause(); setNotice('Paused while this tab is hidden. Press play to continue.');
      }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [pause]);

  return { time, playing, muted, viseme, notice, play, pause, seek, toggleMute };
}
