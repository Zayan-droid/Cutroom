# Generation engine — Part A

`mockEngine` implements the unchanged `GenerationEngine` interface in
`contract.ts`. The store binding already imports it. This folder imports only
the shared types and its own modules; it has no store, React, UI, persistence,
network, or credit-balance dependencies.

Every action returns independent `queued` snapshots synchronously. Timers then
emit `generating` snapshots with increasing `progress`, followed by exactly one
`ready` or `failed` snapshot. The returned objects and source takes are never
mutated. Callback consumers should return normally and not throw.

| Action | Output | Parent | Quoted credits |
| --- | --- | --- | --- |
| `generateDraft` | Four distinct draft variants | Supplied `parentId` | 0 |
| `renderFinal` | One render of the selected variant | Ready draft | Social 4 / ad 6 / cinematic 8 |
| `remix` | Four draft variants | Ready source | 0 |
| `retry` | One take of the failed take's kind | Failed source | 0, including render retries |
| `nudge` | One draft with one adjusted intent parameter | Ready or failed source | 0 |

`quote(kind, intent)` is pure and synchronous. Quotes are metadata, not charges;
the store deducts credits only after a paid render succeeds. Failed jobs carry a
human-readable error and no asset. Ready jobs carry a bundled MP4 URL and
`progress: 1`.

Draft jobs complete in 1–3 seconds and renders in 5–10 seconds, including a short
queue. Drafts emit four progress updates and renders sixteen. Delays and outcomes
are planned when a job is queued, so concurrent completion order cannot change
the seeded sequence. Browser timer throttling can delay delivery in background
tabs. Random mode fails approximately one in eight jobs, independently per take.

## Reproducible QA and demos

Use an isolated instance in scripts/tests:

```ts
import { createMockEngine } from './mockEngine.ts';
import type { GenerationEngine } from './contract.ts';

const engine: GenerationEngine = createMockEngine({
  seed: 'demo-1',
  outcome: 'success', // 'random' | 'success' | 'failure'
  timeScale: 1,
});
```

An identical seed and ordered call sequence repeats timing, asset choices, and
failure decisions. IDs remain unique and timestamps use the actual clock, so new
sessions cannot collide with persisted takes. `timeScale: 0` is allowed and still
uses asynchronous callbacks. Retrying through a forced-failure engine will fail
again; use a success instance for a scripted recovery.

The app singleton reads optional Vite environment variables. In a `.env.local`,
set `VITE_MOCK_ENGINE_SEED`, `VITE_MOCK_ENGINE_OUTCOME`, and
`VITE_MOCK_ENGINE_TIME_SCALE`, then restart Vite. Without configuration it uses
fresh randomness, ordinary timing, and the 1/8 failure rate. Factory-created
instances use their explicit options and do not read environment variables.

## Assets and integration

`assets.ts` selects four distinct variants per intent from the local asset set.
Draft/render clips share a scene at different resolutions, so rendering a chosen
draft preserves its visual direction. See [asset provenance and regeneration](../assets/README.md).
These are synthetic placeholders; prompt and nudge changes are recorded as job
metadata rather than interpreted into newly generated footage.

The frozen `Take.assetUrl` is the playback seam. Part C's `Poster` now plays the
bundled clip for a ready take (muted, inline autoplay), falling back to the
gradient frame when motion is reduced or the clip fails to load (e.g. a stale
persisted URL after a redeploy re-hashes filenames). Optional env knobs are read
via `resolveEngineOptions`, which treats a declared-but-blank var as unset.

## Validation

Node 22.18+ or Node 24+ can run the TypeScript modules directly. No browser or
backend is required for the engine test suite.

```sh
npm run test:engine
npm run typecheck:engine
npm test
npm run typecheck:store
```

The public-interface tests use virtual time to exercise every action in success
and failure modes, progress, branching, snapshot isolation, costs, deterministic
replays, the random failure rate, and bundled asset availability.
