# Cutroom: 3-Minute Story Agent

*Feature spec + work-breakdown. Companion to [WORKSTREAMS.md](WORKSTREAMS.md),
[PRD.pdf](PRD.pdf), and [TRD.pdf](TRD.pdf).*

A new mode on top of the existing take-tree app: the user types one prompt, picks
a language, and gets back a **~3-minute story** — a handful of frames stitched
together with transitions, spoken dialogue in the selected language, an animated
character whose mouth lip-syncs to that dialogue, and subtitles in the same
language. It plays in the browser; a baked video file is an optional stretch.

---

## Can it be built with no additional cost?

**Yes — as a stylized, browser-native story agent.** Cutroom already runs fully
offline: the "footage" is procedurally generated (see
[`src/assets/generate.mjs`](../src/assets/generate.mjs) and
[`src/lib/media.ts`](../src/lib/media.ts)), the engine is a mock behind a frozen
seam, and the whole thing deploys free to GitHub Pages. The story agent keeps
that contract: **no paid APIs, no paid hosting, no model bills.**

Every capability maps to something free that runs in the browser:

| Capability | Zero-cost mechanism | Honest limit |
| --- | --- | --- |
| Story from a prompt | Seeded **story-grammar / templates** (same spirit as [`src/engine/random.ts`](../src/engine/random.ts)); optional in-browser WebLLM (WebGPU) as an upgrade | Procedural, not frontier-LLM prose |
| A few frames joined | Existing procedural scene generator + a canvas/DOM **timeline player** with transitions | Stylized frames, not photoreal video |
| Audio dialogue in the selected language | **Web Speech API** (`window.speechSynthesis`) — free voices shipped by the OS/browser, selectable by `lang` | Voice/language coverage depends on the viewer's device |
| Lip sync | **Viseme-driven animated avatar**: `SpeechSynthesisUtterance.onboundary` word/char timing → mouth-shape swaps (fallback: Web Audio `AnalyserNode` amplitude) | Animated mouth flaps, **not** photoreal face reanimation |
| Subtitles in the selected language | Timed caption overlay built from the script, plus a downloadable `.vtt` | — |
| Multilingual | Localized templates for a fixed language set + matching TTS voices + subtitle text | New languages = new template packs |
| ~3-minute runtime | In-browser timeline playback (primary deliverable) | — |
| Downloadable file (**P1 / stretch**) | `MediaRecorder` + `canvas.captureStream()`, or `ffmpeg.wasm` to mux + burn subtitles | Capturing `speechSynthesis` audio into the file is the one real constraint — see below |

### What is *not* free (and why it's out of scope)

- **Photoreal lip-sync** (Wav2Lip-style face reanimation) and **true text-to-video**
  need GPUs or paid model APIs. Cutroom is a stylized mock demo, so we deliver an
  animated narrator, not a reanimated human face. This is a scope choice, not a
  shortcut.
- **Baked-file audio:** browsers don't expose `speechSynthesis` output as a
  capturable `MediaStream`. In-browser *playback* is perfect and free; a
  fully-baked downloadable MP4 with voice needs either `ffmpeg.wasm` muxing or an
  offline WASM TTS (e.g. Piper) routed through an `AudioContext`. That adds a
  one-time WASM download (tens of MB), still **$0**. This is why export is P1.

**Bottom line:** the core experience — prompt → 3-minute played story with voice,
lip-sync, and localized subtitles — ships at zero marginal cost. Export to a file
is also zero cost but carries the WASM-weight caveat, so it's staged last.

---

## The split: two halves, one frozen seam

The repo's governing rule is *"three layers, kept deliberately separate; the call
direction only ever runs one way."* We extend that: the story agent is divided
into **two halves** along the same kind of seam — a headless half that **produces
a timeline**, and a presentation half that **plays it**. The call direction runs
one way: **Stage → Timeline data (never the reverse).**

```
   Half 2 — Stage, Lip-Sync & Export        Half 1 — Story Engine & Timeline
  ┌───────────────────────────────┐        ┌───────────────────────────────┐
  │ Canvas scene player            │        │ prompt → beats → shot list    │
  │ Web Speech playback            │ reads  │ dialogue cues + localization  │
  │ viseme lip-sync avatar         │◀───────│ subtitle track (selected lang)│
  │ subtitle overlay + .vtt        │ Story  │ scene timing to hit ~3:00     │
  │ transport / scrub / language   │Timeline│ TTS voice pick + cost quote   │
  │ export (MediaRecorder/ffmpeg)  │        │ failure injection, store wiring│
  └───────────────────────────────┘        └───────────────────────────────┘
        never writes the timeline                  never touches the DOM
```

Both halves can be built **at the same time** because the data structure between
them — `StoryTimeline` — and the engine interface are **frozen first**, exactly
like [`src/types.ts`](../src/types.ts) and
[`src/engine/contract.ts`](../src/engine/contract.ts) are today.

---

## Step 0 — Freeze the contract (both owners, together, first)

Before the halves split off, agree on and commit two files. After this commit
they are **frozen**; changing them needs a two-way sign-off because both halves
build against them.

### `src/story/types.ts` — the story data model

```ts
// BCP-47 language tag, e.g. 'en-US', 'es-ES', 'fr-FR', 'ur-PK', 'hi-IN'.
export type LangCode = string;

// Mouth shapes for the lip-sync avatar. A tiny, renderer-agnostic viseme set.
export type Viseme = 'rest' | 'ah' | 'ee' | 'oh' | 'mbp' | 'fv';

export type SceneTransition = 'cut' | 'fade' | 'slide';

// Mirrors Take's lifecycle: queued → composing → ready/failed.
export type StoryStatus = 'queued' | 'composing' | 'ready' | 'failed';

export interface StoryScene {
  id: string;
  index: number;
  posterSeed: string;      // deterministic procedural frame (see lib/media.ts)
  assetUrl?: string;       // optional bundled/uploaded still, overrides the seed
  startMs: number;
  durationMs: number;
  transition: SceneTransition;
}

export interface VisemeMark {
  viseme: Viseme;
  atMs: number;            // offset from the owning cue's startMs
}

export interface DialogueCue {
  id: string;
  sceneId: string;
  speaker: string;         // character id → selects the avatar
  text: string;            // already in the selected language
  lang: LangCode;
  startMs: number;
  durationMs: number;      // estimated by the engine; refined at play time
  visemes: VisemeMark[];   // baseline estimate; Half 2 may refine from live TTS
}

export interface SubtitleCue {
  id: string;
  cueId: string;           // the DialogueCue this captions
  startMs: number;
  endMs: number;
  text: string;            // selected language
}

export interface StoryTimeline {
  id: string;
  title: string;
  prompt: string;
  lang: LangCode;
  status: StoryStatus;
  progress: number;        // 0..1
  totalMs: number;         // target ~180_000 (3:00)
  scenes: StoryScene[];
  dialogue: DialogueCue[];
  subtitles: SubtitleCue[];
  error?: string;          // present when status is 'failed'
}
```

### `src/story/contract.ts` — the engine seam

```ts
import type { LangCode, StoryTimeline } from './types';

export interface StoryInput {
  prompt: string;
  lang: LangCode;
  targetMs?: number;       // defaults to 180_000
}

// Mirrors GenerationEngine: a synchronous skeleton for optimistic UI, then
// asynchronous fill via onUpdate. Each call is an independent, immutable snapshot
// of the whole timeline — same shape as EngineUpdate = (take: Take) => void.
export type StoryUpdate = (timeline: StoryTimeline) => void;

export interface StoryEngine {
  // Languages the engine has template packs + likely voices for.
  languages(): LangCode[];

  // Cost-before-the-click, consistent with Cutroom's quote(). Pure, synchronous,
  // and scales with the target length (see cost.ts — CREDITS_PER_MINUTE).
  quote(input: StoryInput): number;

  // Returns a 'queued' storyboard immediately (scenes laid out, script withheld),
  // then drives it to a fully-populated 'ready' (or 'failed') via onUpdate.
  compose(input: StoryInput, onUpdate: StoryUpdate): StoryTimeline;
}
```

**Once these two files are committed, both halves are unblocked and run in
parallel.** Each half fakes the other across the seam (see *How the parallelism
works*).

---

## Half 1 — Story Engine & Timeline (headless)

> The brain and the data. No DOM, no JSX — the same discipline as
> [`src/engine/`](../src/engine/README.md) and [`src/store/`](../src/store/README.md).

**Owns:** `src/story/*` (except the frozen `contract.ts` / `types.ts`), plus the
store wiring that exposes story state to the UI.

**Mission:** turn one prompt + a language into a complete, correctly-timed
`StoryTimeline` — a mock "story backend" honest about structure, pacing, and
cost, sitting behind `StoryEngine` so a real model router could replace only this
folder.

**Files** *(✅ built — see [`src/story/README.md`](../src/story/README.md))*

```
src/story/
  types.ts           # ✅ frozen data model (Step 0)
  contract.ts        # ✅ frozen StoryEngine seam (Step 0)
  storyEngine.ts     # ✅ StoryEngine + pure buildTimeline(); progressive reveal
  grammar.ts         # ✅ seeded prompt → beats → narrator + character lines
  localize.ts        # ✅ language packs (en/es/fr/de/pt); text per LangCode
  timing.ts          # ✅ lay beats across ~180s; per-cue duration estimates
  subtitles.ts       # ✅ build SubtitleCue[] + toVtt() serializer
  voices.ts          # ✅ LangCode → preferred voices; pure selectVoice()
  visemes.ts         # ✅ text → VisemeMark[] estimate (refined live in Half 2)
  cost.ts            # ✅ quote(input) → credits, src/engine/cost.ts style
  failure.ts         # ✅ seeded failure injection (~1/8)
  random.ts          # ✅ seeded PRNG (self-contained)
  clone.ts           # ✅ deep-copy snapshots for immutable onUpdate
src/store/
  storyStore.ts      # ✅ composeStory() action; optimistic insert; onUpdate settle
  useStoryStore.ts   # ✅ bound hook + imperative API for Half 2
tests/
  story.test.mjs     # ✅ 15 tests: determinism, timing, subtitles, i18n, lifecycle
```

**Deliverables**

- **P0** — `compose()` returns a skeleton synchronously (scenes laid out across
  `targetMs`), then fills dialogue, subtitles, and timing via `onUpdate` ticks —
  mirroring `generateDraft`'s queued → generating → ready flow.
- **P0** — Story grammar: prompt → ordered **beats** (e.g. setup → turn →
  resolution) → one scene + one or more dialogue cues per beat, **seeded** so the
  same prompt + seed reproduces the same story (QA + demo recordings).
- **P0** — **Timing that hits ~3:00**: scene/cue durations sum to `totalMs`
  within tolerance, with no overlaps and monotonic `startMs`.
- **P0** — **Localization**: dialogue and subtitle text produced in the selected
  `LangCode` from template packs; `languages()` reports the supported set.
- **P0** — Subtitle track: one `SubtitleCue` per dialogue cue, aligned to its
  timing, plus `toVtt()` for download in Half 2.
- **P0** — `quote()` cost model consistent with [`src/engine/cost.ts`](../src/engine/cost.ts).
- **P1** — Viseme estimate (`text → VisemeMark[]`) so Half 2 has a baseline even
  before live TTS boundary events arrive.
- **P1** — Failure injection (reuse [`src/engine/failure.ts`](../src/engine/failure.ts)
  style) so the recovery surface works for stories too.
- **Stretch** — WebLLM adapter behind `StoryEngine` for richer prose (still
  offline, still free); the seam means it's a drop-in.

**Can stub while waiting:** nothing blocks Half 1 — it depends on no one. Ship a
runnable `storyEngine` behind the interface early so Half 2 can drop it in.

**Definition of done:** a `node --test` suite (like
[`tests/engine.test.mjs`](../tests/engine.test.mjs)) drives `compose()` for
multiple prompts/languages and asserts: scenes cover `~180s` with no gaps/overlaps,
every dialogue cue has a matching subtitle in the right language, and output is
deterministic under a fixed seed. No import from `ui/` anywhere in `src/story/`.

---

## Half 2 — Stage, Lip-Sync & Export (the player)

> Where the feel lives — the same place the extra hours went for
> [Part C](PART-C-UI.md).

**Owns:** `src/ui/story/*`, the language picker, and the export path.

**Mission:** consume a `StoryTimeline` and *perform* it — join the frames over the
timeline, speak each cue in the selected language, lip-sync the avatar to that
speech, show localized subtitles, and let the user play/scrub the full 3 minutes.
Reads the timeline only; never writes it.

**Files**

```
src/ui/story/
  StoryMode.tsx       # entry: prompt + language picker + "compose" (shows cost)
  StoryStage.tsx      # canvas/DOM scene player: frames + transitions over time
  Avatar.tsx          # viseme-driven mouth; SVG/canvas mouth-shape swaps
  Narrator.ts         # Web Speech layer: speak cues, report onboundary timing
  Subtitles.tsx       # timed caption overlay (selected language)
  Transport.tsx       # play/pause/scrub/seek across the ~3:00 timeline
  LanguagePicker.tsx  # lists speechSynthesis voices filtered by LangCode
  export/
    recorder.ts       # P1: MediaRecorder + canvas.captureStream()
    muxer.ts          # P1: ffmpeg.wasm concat + burn subtitles (file output)
```

**Deliverables**

- **P0** — **Scene player**: render each `StoryScene` (procedural `posterSeed`
  via [`posterStyle`](../src/lib/media.ts) or `assetUrl`) and transition between
  them on the timeline's clock; a single play head drives everything.
- **P0** — **Audio in the selected language**: `Narrator` speaks each
  `DialogueCue` via `speechSynthesis` using a voice matched to `cue.lang`,
  started at `cue.startMs` and kept in sync with the play head.
- **P0** — **Lip-sync avatar**: swap mouth visemes from `onboundary` events
  (fallback: `AnalyserNode` amplitude), so the character's mouth tracks the
  spoken words. Idle/rest pose between cues.
- **P0** — **Localized subtitles**: overlay the active `SubtitleCue` text,
  perfectly aligned to playback; toggle on/off.
- **P0** — **Transport**: play, pause, seek, and scrub across the full 3 minutes;
  seeking re-syncs audio, avatar, and subtitles.
- **P0** — Language picker reflecting voices actually available on the device,
  with a graceful note when the chosen language has no local voice.
- **P1** — **Export**: record the canvas to a file (`MediaRecorder`), and/or
  `ffmpeg.wasm` to concat frames + burn subtitles; offer `.vtt` download always
  (it's free and trivial). Surface the baked-audio caveat in the UI.
- **P1** — Motion polish consistent with Part C: scene reveals, caption fades,
  a real progress state while Half 1 composes (never a bare spinner).

**Can stub while waiting:** if Half 1 isn't ready, build against a **fixtures
file** exporting a hand-written `StoryTimeline` (3–4 scenes, a few cues, two
languages). Every visual + playback state is reachable from fixtures, so the
stage, avatar, subtitles, and transport can be fully built and polished before
the real engine lands — the same seeded-fixtures trick Part C uses today.

**Definition of done:** a fixture `StoryTimeline` plays end-to-end — frames
advance, the voice speaks in the selected language, the avatar's mouth tracks it,
subtitles stay aligned, and scrubbing re-syncs all three. The only cross-seam
import is `src/story/types.ts` (and `contract.ts` for the language list).

---

## How the parallelism works

| Half | Depends on | Stub used until the real thing lands | Swap cost |
| --- | --- | --- | --- |
| 1 — Story Engine | nobody | — | — |
| 2 — Stage & Export | the engine's output | a fixtures `StoryTimeline` typed to `src/story/types.ts` | replace the fixture import with the real `composeStory` selector |

Two cheap integration moments, by construction:

1. **Store ← Engine:** the store's `composeStory()` imports the real
   `storyEngine` instead of a fake one (one line).
2. **Stage ← Store:** `StoryStage` reads the live timeline selector instead of
   the fixture (one import).

## Shared-file ownership & merge rules

- **`src/story/types.ts`** — primary owner **Half 1** (the data model originates
  with the engine). Frozen after Step 0; changes are a two-way sign-off.
- **`src/story/contract.ts`** — owned jointly by **both halves**. Frozen after
  Step 0.
- Each half otherwise works only inside its own folder (`src/story/` vs
  `src/ui/story/`) → near-zero conflicts.
- Branch per half (`feat/story-engine`, `feat/story-stage`); integrate at the two
  checkpoints above.

## Suggested sequencing

| Phase | Half 1 — Engine | Half 2 — Stage |
| --- | --- | --- |
| Step 0 | Freeze `types.ts` + `contract.ts` together | Freeze `types.ts` + `contract.ts` together |
| Early | grammar + timing: skeleton timeline that hits ~3:00 | fixtures + stage shell: frames advancing on a clock |
| Mid | localization + subtitles + voice mapping; `onUpdate` fill | Web Speech narrator + subtitle overlay + transport |
| Late | **Checkpoint 1: store ← engine**; cost + failure injection | lip-sync avatar; **Checkpoint 2: stage ← store** |
| Polish | viseme estimate, WebLLM adapter (stretch) | motion polish + export (MediaRecorder / ffmpeg.wasm) |

**The rule stays the rule (from the TRD):** if you're tempted to add a new
screen, stop and polish the core flow instead. Here the core flow is: *prompt →
language → a 3-minute story that plays, speaks, lip-syncs, and subtitles itself.*
