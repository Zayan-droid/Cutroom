# Cutroom: 3 Parallel Workstreams

*Work-breakdown for the 24-hour build. Companion to [PRD.pdf](PRD.pdf) and [TRD.pdf](TRD.pdf).*

## The split

The TRD already names the seam: **"Three layers, kept deliberately separate. The call direction only ever runs one way: UI → store → engine."** We divide the project along exactly those layers, so three people own three non-overlapping slices of the codebase.

```
  Part C — UI & Motion          Part B — Store & State        Part A — Engine
 ┌──────────────────────┐      ┌──────────────────────┐      ┌──────────────────────┐
 │ React components      │─────▶│ Zustand store         │─────▶│ Mock generation      │
 │ Framer Motion / feel  │ read │ take tree + actions   │ call │ engine (stub)        │
 │ prompt · drafts ·     │◀─────│ credits · selection   │◀─────│ timing · cost ·      │
 │ rail · render · recover│ subs │ persistence           │ resolve │ failure injection  │
 └──────────────────────┘      └──────────────────────┘      └──────────────────────┘
      never calls engine directly          owns every transition        never knows UI exists
```

Because the dependency runs one way, the layers can be built at the same time **only if the interfaces between them are frozen first**. That is the whole game plan below.

---

## Step 0 — Freeze the contracts (all three, together, first hour)

Before anyone splits off, the three owners agree on and commit two files. After this commit, these are **frozen** — changes require a quick sign-off from all three, because everyone builds against them.

### `src/types.ts` — the shared data model (verbatim from the TRD)

```ts
export type TakeStatus = 'queued' | 'generating' | 'ready' | 'failed';
export type TakeKind   = 'draft' | 'render';

export interface Intent {
  kind: 'social' | 'ad' | 'cinematic';
  subject: string;
  style: string;
  motion: string;
  mood: string;
}

export interface Take {
  id: string;
  parentId: string | null;   // null = root; set for a branch/variant
  kind: TakeKind;
  status: TakeStatus;
  prompt: string;
  intent: Intent;
  assetUrl?: string;         // present when ready
  error?: string;            // present when failed
  cost: number;              // credits, shown before commit
  createdAt: number;
}

export interface Project {
  id: string;
  title: string;
  takes: Take[];             // flat list, forms a tree via parentId
  activeTakeId: string | null;
  credits: number;           // simulated balance
  createdAt: number;
}

// Corrective nudges (recovery surface)
export type Nudge =
  | 'too-fast' | 'too-slow' | 'wrong-character'
  | 'more-cinematic' | 'less-busy';
```

### `src/engine/contract.ts` — the engine interface (the seam a real backend would expose)

```ts
import type { Intent, Take, TakeKind, Nudge } from '../types';

// The engine returns the initial take(s) SYNCHRONOUSLY so the store can insert
// them immediately (optimistic UI), then pushes each state change via onUpdate.
export type EngineUpdate = (take: Take) => void;

export interface GenerationEngine {
  // Four draft takes, returned 'queued', driven to ready/failed via onUpdate
  generateDraft(
    input: { prompt: string; intent: Intent; parentId: string | null },
    onUpdate: EngineUpdate,
  ): Take[];

  // One render take from a chosen draft; longer job, charges credits on success
  renderFinal(input: { source: Take }, onUpdate: EngineUpdate): Take;

  // Four variant takes branched off a source take
  remix(input: { source: Take }, onUpdate: EngineUpdate): Take[];

  // Reroll a failed take — free, branches a new take
  retry(input: { failed: Take }, onUpdate: EngineUpdate): Take;

  // Branch one take with a single adjusted parameter
  nudge(input: { source: Take; nudge: Nudge }, onUpdate: EngineUpdate): Take;

  // Cost-before-the-click. Pure, synchronous.
  quote(kind: TakeKind, intent: Intent): number;
}
```

### `src/store/contract.ts` — the store's public API (the seam the UI builds against)

```ts
import type { Intent, Take, Nudge } from '../types';

export interface StoreApi {
  // state (read via Zustand selectors)
  credits: number;
  activeTakeId: string | null;
  takes: Take[];

  // actions
  submitDraft(prompt: string, intent: Intent): void;
  selectTake(id: string): void;
  render(): void;
  remix(id: string): void;
  retry(id: string): void;
  applyNudge(id: string, nudge: Nudge): void;
}

// derived selectors the UI consumes (implemented in store/selectors.ts)
// useActiveTake(), useDrafts(), useRail(), useCredits()
```

**Once these three files are committed, all three streams are unblocked and run in parallel.** Each stream fakes the layer below it (see "How the parallelism actually works").

---

## Part A — Generation Engine

> *"This module embodies the thesis and is the place a reviewer should look to see systems thinking."*

**Owns:** `src/engine/*` (except the frozen `contract.ts`), plus the placeholder asset set.

**Mission:** a mock backend that is honest about queueing, latency, cost, and failure — sitting behind `GenerationEngine` so it could be swapped for real model routing by touching only this folder.

**Files**
```
src/engine/
  mockEngine.ts     # implements GenerationEngine
  timing.ts         # randomized delays (draft 1–3s, render 5–10s, progress ticks)
  cost.ts           # quote(kind, intent) → credits; drafts ≈ 0, renders a few
  failure.ts        # ~1-in-8 jobs resolve to 'failed', with human error messages
  assets.ts         # pick placeholder clip/image by intent
src/assets/         # bundled low-res draft clips + full-res render clips
```

**Deliverables**
- P0 — `generateDraft` / `renderFinal` / `remix` / `retry` / `nudge` fully simulated: takes returned immediately in `queued`, driven through `generating` → `ready`/`failed` via `onUpdate`.
- P0 — `quote()` cost model (function of kind + intent), so the UI can show cost before every action.
- P0 — Failure injection (~1/8) with clear, human error strings — *failure has to be real for recovery to be a real feature.*
- P0 — Render emits **visible progress** (multiple `onUpdate` ticks, not one).
- Support — a tiny deterministic "seed" switch (env/flag) to force success/failure on demand, so QA and the demo recording are reproducible.

**Can stub while waiting:** nothing — Part A depends on no one. Start immediately after Step 0. Ship a runnable `mockEngine` behind the interface as early as possible so Part B can drop the real one in.

**Definition of done:** a standalone script/test drives every method through all four statuses using only the frozen `contract.ts`; no import from `store/` or `ui/` anywhere in the folder.

---

## Part B — Store & State

> *"The store owns every transition between takes."*

**Owns:** `src/store/*` (except the frozen `contract.ts`).

**Mission:** the single source of truth — the branching take tree, the active selection, the simulated credit balance — and the only place that calls the engine. Every update is optimistic.

**Files**
```
src/store/
  useProjectStore.ts   # Zustand store; wires actions → engine via onUpdate
  selectors.ts         # useActiveTake, useDrafts, useRail, useCredits
  rail.ts              # derive the version rail by walking parentId (no separate log)
  persist.ts           # optional localStorage: survive refresh without wiping the tree
```

**Deliverables**
- P0 — Actions: `submitDraft`, `selectTake`, `render`, `remix`, `retry`, `applyNudge` — each inserts takes immediately (optimistic) and settles them from `onUpdate`.
- P0 — Credit accounting: deduct on successful render only; **reroll after failure never charges** (make it observable in state so the UI can surface it).
- P0 — Version rail derived from `parentId` links — branches and history both fall out of the one tree, no second structure to keep in sync.
- P1 — `persist.ts` localStorage snapshot of the current session.
- Guardrails — block `render()` when credits are insufficient; expose that as state, not a thrown error.

**Can stub while waiting:** if Part A's engine isn't ready yet, build against a **10-line fake engine** that implements `contract.ts` and resolves instantly (or on a `setTimeout`). Swap in the real `mockEngine` with a one-line import change — that swap is the proof the seam works.

**Definition of done:** every action drives correct tree + credit transitions against the fake engine; imports only `types.ts` and the two `contract.ts` files; contains zero React and zero JSX.

---

## Part C — UI & Motion

> *"This is where the extra hours go and where most clones fall short."*

**Owns:** `src/ui/*`, `src/App.tsx`, global styles, Framer Motion config.

**Mission:** the calm, editor-grade surface and the feel of iteration. Reads from the store via selectors; reaches the engine only through the store, never directly.

**Files**
```
src/ui/
  App.tsx
  LandScreen.tsx         # calm first screen: prompt input + intent + recent rail
  PromptIntentPanel.tsx  # prompt + intent selector (social / ad / cinematic)
  DraftGrid.tsx          # four drafts, staggered reveal, cost chip per draft
  RenderView.tsx         # committed result; render button shows cost before click
  VersionRail.tsx        # branching history rail; slides, keeps structure visible
  RecoverySurface.tsx    # failed take in place: free reroll + corrective nudge chips
  PromptAssist.tsx       # P1: guided subject/style/motion/mood + "surprise me"
  CommandPalette.tsx     # P1: searchable replacement for the apps/effects wall
  components/            # buttons, chips, skeletons, cost chip — shared primitives
```

**Deliverables**
- P0 — The core screens: Land → describe → draft grid → pick → render → remix/branch → recover.
- P0 — Intent selector in place of any model picker (the signature cut).
- P0 — Cost chips on drafts and on the render button (cost before every action).
- P0 — Recovery surface: failed take renders in place with a human message + **reroll (free, labeled free)** and **adjust-and-retry** nudge chips.
- P0 — Motion & feel: staggered draft reveal, real skeletons/progress (never a bare spinner), draft-into-render animation, sliding version rail, hover/active/disabled/cost states, designed empty first-load state, micro-feedback on satisfying actions.
- P1 — Prompt assist, command palette, keyboard shortcuts for navigating takes.

**Can stub while waiting:** if the store isn't ready, build against a **seeded fake store** — a fixtures file exporting a `Project` with a few `queued`/`ready`/`failed` takes plus no-op actions, all typed to `StoreApi`. Every visual state (empty, generating, ready, failed, rendering) is reachable from fixtures, so the whole UI including motion can be built and polished before the real store lands.

**Definition of done:** every screen and every take status renders correctly from fixtures; the only cross-layer imports are `types.ts` and `store/contract.ts` (selectors) — no import from `engine/` anywhere.

---

## How the parallelism actually works

The dependency chain (UI → store → engine) would normally force serial work. Stubs break the chain:

| Stream | Depends on | Stub used until the real thing lands | Swap cost |
|--------|-----------|--------------------------------------|-----------|
| A — Engine | nobody | — | — |
| B — Store  | engine  | 10-line fake engine (`contract.ts`)  | one import line |
| C — UI     | store   | seeded fixtures typed to `StoreApi`  | replace fixtures with real selectors |

Everyone codes against interfaces, not implementations. The two integration moments are cheap by construction:
1. **B ← A:** Store owner replaces the fake engine import with the real `mockEngine`.
2. **C ← B:** UI owner replaces fixture selectors with the real store selectors.

## Shared-file ownership & merge rules

To avoid the classic parallel-build merge pile-up:

- **`types.ts`** — primary owner: **A** (the data model originates in the engine). Frozen after Step 0; any change is a 3-way sign-off.
- **`engine/contract.ts`** — owned jointly by **A + B**. Frozen after Step 0.
- **`store/contract.ts`** — owned jointly by **B + C**. Frozen after Step 0.
- Each stream works only inside its own folder otherwise → near-zero conflicts.
- Branch per stream (`feat/engine`, `feat/store`, `feat/ui`); integrate at the two checkpoints below.

## Sequencing against the TRD's 24-hour plan

| Hours | A — Engine | B — Store | C — UI |
|-------|-----------|-----------|--------|
| 0–3   | Step 0 contracts · engine skeleton + fake timing end-to-end | Step 0 · store skeleton on fake engine | Step 0 · fixtures + App shell, Land screen |
| 3–9   | cost model · failure injection · real assets | actions wired · optimistic inserts · rail derivation | prompt/intent panel · draft grid · render view (on fixtures) |
| 9–14  | progress ticks · nudge/retry branching · seed switch | **Checkpoint 1: B ← A** real engine · credits · guardrails | version rail · recovery surface · **Checkpoint 2: C ← B** real store |
| 14–20 | hardening, error-message copy, reproducible-demo flag | persistence (localStorage) · edge cases | **feel & motion** — the differentiator: reveals, skeletons, transitions, empty/hover states, micro-feedback |
| 20–22 | buffer / assist support | buffer | prompt assist · command palette · keyboard shortcuts (P1) |
| 22–24 | decisions writeup · 2-minute walkthrough recording (whole team) |

**The rule for the whole build (from the TRD):** if you are tempted to add a new screen, stop and polish the core flow instead.
