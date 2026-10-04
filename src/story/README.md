# Story engine — Half 1

`storyEngine` implements the frozen `StoryEngine` seam in `contract.ts`: a prompt
plus a language becomes a complete, correctly-timed `StoryTimeline`. This folder
imports only its own modules; it has no store, React, UI, network, or
credit-balance dependencies, and it is the only place a real model router would
replace. See [`Docs/STORY-AGENT.md`](../../Docs/STORY-AGENT.md) for the two-half
plan; Half 2 consumes the timeline and never writes it back.

## The call

```ts
import { createStoryEngine } from './storyEngine.ts';
import type { StoryEngine } from './contract.ts';

const engine: StoryEngine = createStoryEngine({ seed: 'demo', outcome: 'success', timeScale: 1 });
const skeleton = engine.compose({ prompt: 'a lonely lighthouse keeper', lang: 'en-US' }, (timeline) => {
  // timeline snapshots: composing (progress ticks) → ready (fully populated) | failed
});
```

`compose` returns a `queued` **storyboard** synchronously — scenes laid out across
the target duration, with the script withheld — so the UI can show structure
immediately. Timers then emit `composing` snapshots with rising `progress`,
followed by exactly one `ready` (dialogue + subtitles + visemes filled) or
`failed` snapshot. Every snapshot is an independent deep copy; returned objects
are never mutated.

## What the timeline carries

| Field | Produced by | Notes |
| --- | --- | --- |
| `scenes` | `grammar` + `timing` | One beat per scene across the dramatic arc; contiguous, no gaps/overlaps |
| `dialogue` | `grammar` + `localize` + `timing` | Narrator lines plus character lines on the turn and climax, in the selected language |
| `dialogue[].visemes` | `visemes` | Baseline mouth-shape timeline; Half 2 may refine from live TTS |
| `subtitles` | `subtitles` | One caption per cue; `toVtt()` serializes to WebVTT |
| `totalMs` | `timing` | Lands on the target (~180 000 ms) by padding each scene's hold |

`quote(input)` is pure and synchronous and consumes no randomness; it scales with
the target length (`CREDITS_PER_MINUTE`). Quotes are metadata, not charges — the
store deducts credits only when a story reaches `ready`.

## Languages and voices

`languages()` reports the template packs in `localize.ts` (currently en-US, es-ES,
fr-FR, de-DE, pt-BR). The scaffolding is localized; the `{subject}` pulled from the
prompt is inserted verbatim — a documented zero-cost limitation. `voices.ts` maps a
language to preferred `speechSynthesis` voice names and exposes a pure
`selectVoice(lang, voices)` Half 2 feeds with `speechSynthesis.getVoices()`.

## Determinism

Content is seeded from the prompt, so the same prompt tells the same story even
without an explicit seed. The engine's `seed`/`outcome` control only the simulated
job latency and failure, kept on a separate random stream from the content. The
pure `buildTimeline(input, { idPrefix, seed })` is fully deterministic (ids
included) and is what the tests assert against.

## Reproducible QA and demos

The app singleton reads optional Vite env vars — in a `.env.local`, set
`VITE_STORY_ENGINE_SEED`, `VITE_STORY_ENGINE_OUTCOME`, and
`VITE_STORY_ENGINE_TIME_SCALE`, then restart Vite. Factory-created instances use
their explicit options and ignore the environment. `timeScale: 0` is allowed and
still delivers asynchronously.

## Validation

Node 22.18+ or Node 24+ runs the TypeScript modules directly — no browser needed.

```sh
npm run test:story
npm run typecheck:story
```

The tests cover deterministic builds, the timeline invariants (contiguous scenes,
cues inside their scene, hitting the target duration), subtitle alignment and VTT,
per-language localization, the compose lifecycle under virtual time, forced
failure, the quote model, and the store wiring.
