// ─────────────────────────────────────────────────────────────────────────────
// STORY DATA MODEL — the frozen seam for the 3-minute story agent (Step 0).
// Half 1 (engine) produces a StoryTimeline; Half 2 (stage) consumes it and never
// writes it back. Co-owned by both halves; changes need a two-way sign-off.
// See Docs/STORY-AGENT.md.
// ─────────────────────────────────────────────────────────────────────────────

/** BCP-47 language tag, e.g. 'en-US', 'es-ES', 'fr-FR'. */
export type LangCode = string;

/** A tiny, renderer-agnostic mouth-shape set the lip-sync avatar animates. */
export type Viseme = 'rest' | 'ah' | 'ee' | 'oh' | 'mbp' | 'fv';

export type SceneTransition = 'cut' | 'fade' | 'slide';

/** Mirrors Take's lifecycle: queued → composing → ready/failed. */
export type StoryStatus = 'queued' | 'composing' | 'ready' | 'failed';

export interface StoryScene {
  id: string;
  index: number;
  posterSeed: string; // deterministic procedural frame (feed to lib/media.ts)
  assetUrl?: string; // optional bundled/uploaded still, overrides the seed
  startMs: number;
  durationMs: number;
  transition: SceneTransition;
}

export interface VisemeMark {
  viseme: Viseme;
  atMs: number; // offset from the owning cue's startMs
}

export interface DialogueCue {
  id: string;
  sceneId: string;
  speaker: string; // character id → selects the avatar in Half 2
  text: string; // already in the selected language
  lang: LangCode;
  startMs: number;
  durationMs: number; // estimated by the engine; refined at play time
  visemes: VisemeMark[]; // baseline estimate; Half 2 may refine from live TTS
}

export interface SubtitleCue {
  id: string;
  cueId: string; // the DialogueCue this captions
  startMs: number;
  endMs: number;
  text: string; // selected language
}

export interface StoryTimeline {
  id: string;
  title: string;
  prompt: string;
  lang: LangCode;
  status: StoryStatus;
  progress: number; // 0..1
  totalMs: number; // target ~180_000 (3:00)
  scenes: StoryScene[];
  dialogue: DialogueCue[];
  subtitles: SubtitleCue[];
  error?: string; // present when status is 'failed'
}
