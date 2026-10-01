# Part C — UI & Motion (status)

The UI & Motion workstream from [WORKSTREAMS.md](WORKSTREAMS.md). Built as a standalone slice, now **integrated with Part B's real store** (Checkpoint 2: C ← B) — no UI changes were needed to swap from a local mock to the real store, which is the seam working as designed.

## What ships

Core flow (all P0): **Land → describe → draft grid → pick → stage → render → remix / nudge / recover**, on a branching version rail.

| Area | File | Notes |
|------|------|-------|
| App shell + keyboard + error surfacing | `src/ui/App.tsx` | land vs working view, focus state, hotkeys, `lastError` → toast |
| Land / empty state | `src/ui/panels/LandScreen.tsx` | designed first-load, thesis headline, 3-step explainer |
| Prompt + intent + assist | `PromptForm.tsx`, `IntentSelector.tsx`, `PromptAssist.tsx` | hero & compact-bar variants, guided fields, Surprise me |
| Draft grid | `DraftGrid.tsx`, `DraftCard.tsx` | staggered reveal, cost chips, per-card failed → free reroll |
| Stage (focus / render view) | `Stage.tsx` | large take, Render (cost-before-click), Remix, nudge chips, success glow |
| Recovery | `RecoverySurface.tsx` | human message + free reroll + 5 corrective nudges |
| Version rail | `VersionRail.tsx` | depth-first branch tree from `useRail()`, live enter/exit |
| Command palette (P1) | `CommandPalette.tsx` | ⌘K, context-aware actions + effects/apps shell (P2 labeled) |
| Placeholder media | `components/Poster.tsx`, `lib/media.ts` | offline cinematic gradient "footage", grain, drift, skeleton+progress |
| Primitives / motion / cost | `components/ui.tsx`, `components/Toaster.tsx`, `lib/motion.ts`, `lib/cost.ts` | Button/chips/status, toasts, expo-out presets, cost quote |
| Keyboard | `hooks/useHotkeys.ts` | ⌘K, Esc, R render, M remix, ←/→ navigate takes |

## Design system (from ui-ux-pro-max)

Modern Dark / cinematic · deep navy `#0F172A` (never pure black) · pink primary `#EC4899`, indigo/blue accent · Inter, tabular numerals · expo-out `cubic-bezier(0.16,1,0.3,1)` · staggered reveals, skeleton→ready settle, spring press. Persisted at `design-system/cutroom/MASTER.md`.

## Motion & a11y

Staggered draft reveal, skeleton progress (never a bare spinner), draft→stage transition, sliding rail, credit count-up, render success glow. `prefers-reduced-motion` honored via `<MotionConfig reducedMotion="user">` + a CSS media-query safety net. Visible focus rings, ARIA labels, 44px+ targets, keyboard-navigable palette.

## Verified

Typecheck + `vite build` clean; no console errors. Live: draft batch (with a real engine failure), select → stage, render (credits 120 → 112, render branch on the rail), full recovery on a failed take, command palette context states, responsive at 375 / 768 / desktop.

## Run

```bash
npm install && npm run dev
```

## Integration notes

- Binds to the store only through `src/store/index.ts` (`actions` + selector hooks). Swapping Part A's `mockEngine` for the current `fallbackEngine` touches `useProjectStore.ts` only — the UI does not change.
- Failure injection lives in the engine (Part A). The recovery UI consumes whatever failures the engine produces; it required no change when the engine began injecting them.
