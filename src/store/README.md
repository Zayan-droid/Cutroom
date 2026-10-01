# Store & State

The UI imports `src/store/index.ts`, which uses the real Zustand store.
The frozen `contract.ts` and shared types are unchanged.

`projectStore.ts` is a vanilla Zustand store with no React dependency. It is the
only production module that invokes generation methods. `useProjectStore.ts`
binds it to Zustand's hook API and selects the engine implementation.

The binding imports Part A's `mockEngine`, which supplies simulated latency,
progress, failure injection, and bundled offline clips through the frozen engine
interface. See [engine configuration](../engine/README.md) for reproducible demo
settings. `fallbackEngine.ts` remains a small success-only fixture for the store's
isolated tests.

## State and behavior

- The session starts with 120 simulated credits. Reset clears the tree and restores
  that initial balance. Tests can inject a different initial balance.
- Draft submission and remix insert four queued takes synchronously, display that
  batch, and clear selection. Render, retry, and nudge select the new child.
- Engine callbacks update existing takes only; they cannot change ancestry,
  prompt, intent, kind, or quoted cost. Terminal states are immutable. Progress
  never regresses, and reset invalidates all previous callbacks.
- `credits` is the balance actually owned. `reservedCredits` holds pending render
  quotes. `useAvailableCredits()` subtracts reservations to prevent concurrent
  overspending. Success deducts the quote exactly once; failure only releases it.
- Rerolls have `take.cost === 0`, including retries of failed renders. Nudges are
  free exploration/recovery branches. The engine controls the parameter adjustment.
- `lastError` / `useStoreError()` expose invalid actions, engine start errors, and
  insufficient credits. Rejected actions never call generation methods.
- Render accepts a ready draft; remix accepts a ready take; retry accepts a failed
  take; nudge accepts a ready or failed take. Selection accepts any existing take.
- `deriveRail()` / `useRail()` return every branch in depth-first order with depth,
  active, and ancestor metadata. `deriveLineage()` returns the root-to-active path.
  Both derive history from `parentId`, with no second history structure.
- Browser sessions persist under `cutroom.project.v1`. Invalid snapshots are ignored.
  Interrupted jobs reload as failed takes with a free-reroll message, preserving
  ancestry and credits. Storage denial or quota errors leave in-memory use working.

## Validation

Requires Node 22.18+ or Node 24+ for native TypeScript stripping in the tests.

```sh
npm run test:store
npm run typecheck:store
```

Tests use a controllable engine and memory storage to verify optimistic insertion,
all actions, synchronous callbacks, duplicate completion, concurrent accounting,
free recovery, reset isolation, branching, and persistence. The isolated typecheck
allows Part B to be checked while the Part C UI is still being built.

The hook layer uses stable derived snapshots following the
[Zustand selector guidance](https://zustand.docs.pmnd.rs/learn/guides/prevent-rerenders-with-use-shallow).
