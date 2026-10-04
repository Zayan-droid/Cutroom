# Part C — UI & Motion (status)

The UI & Motion workstream from [WORKSTREAMS.md](WORKSTREAMS.md). Built as a standalone slice, now **integrated with Part B's real store** (Checkpoint 2: C ← B) — no UI changes were needed to swap from a local mock to the real store, which is the seam working as designed.

**Redesign (2026-10-04):** the original "Modern Dark" skin (navy, pink/violet gradients, glass cards, Lucide icons, ⌘K palette, grain and shimmer) was replaced with a light-first, footage-first system. The full rules, tokens, and the list of rejected patterns live in [`design-system/cutroom/MASTER.md`](../design-system/cutroom/MASTER.md). The store and engine contracts are unchanged.

## What ships

Core flow (all P0): **Land → describe → draft grid → pick → stage → render → remix / adjust / recover**, on a branching version history.

| Area | File | Notes |
|------|------|-------|
| App shell + keyboard + error surfacing | `src/ui/App.tsx` | land vs working view, per-take stage keys, hotkeys, `lastError` → toast, visible shortcut list |
| Top bar | `panels/TopBar.tsx` | wordmark, workspace tabs, credit readout (with held credits), light/dark switch, confirmed "New session" |
| Opening screen | `panels/LandScreen.tsx` | direct title, left-aligned composer, labeled sample clip per format, drafts/render/versions explained with real prices |
| Prompt + format + details | `PromptForm.tsx`, `IntentSelector.tsx`, `PromptAssist.tsx` | full and compact composers, native-radio format picker drawn at true ratios, optional subject/look/camera/mood, worked examples |
| Draft grid | `DraftGrid.tsx`, `DraftCard.tsx` | staggered reveal, status summary, one stretched button per card, separate free reroll for failed drafts |
| Stage | `Stage.tsx` | full-frame playback with controls, Render (price before click), Remix, five adjustments; layout adapts to the format |
| Recovery | `RecoverySurface.tsx` | plain failure message, free reroll, reroll with one change |
| Version history | `VersionRail.tsx` | depth-first branch tree from `useRail()`, numbered rows, live enter/exit |
| Media | `components/TakeFrame.tsx` | unprocessed footage; progress, failed, no-media, and load-error states; reduced-motion playback |
| Primitives | `components/ui.tsx`, `Glyph.tsx`, `Toaster.tsx`, `ConfirmDialog.tsx`, `hooks/useTheme.ts` | buttons with inline prices, status squares, solid glyph set, toasts, native dialog, theme store |
| Keyboard | `hooks/useHotkeys.ts` | Esc, R render, M remix, N new prompt, ←/→ move between drafts (paused while a dialog is open) |

The ⌘K command palette was removed: its real actions already have visible controls, and its "effects & apps" entries were non-functional placeholders.

## Motion & a11y

Staggered draft reveal, determinate progress (never a bare spinner or shimmer), draft-into-stage shared frame, sliding history rows, rolling credit count, render-complete confirmation. One ease-out curve, short durations, no springs. `prefers-reduced-motion` is honored via `<MotionConfig reducedMotion="user">`, a CSS safety net, and no video autoplay.

WCAG AA contrast in both themes (measured), an ink focus ring that is never removed, native radios and `<dialog>`, `aria-live` status and toasts, no nested interactive controls, 44px touch targets on coarse pointers, and no horizontal scroll from 320px up.

## Verified (2026-10-04)

`npm run typecheck`, `npm test`, and `npm run build` pass. Headless Chrome against the mock engine covered: opening screen, generating, ready, selected, stage, rendering with held credits, rendered, failed drafts, recovery, insufficient credits, confirm dialog (Esc keeps work), draft ↔ stage ↔ render ↔ history navigation, a new batch from the stage, Story studio empty / composing / playback / failure, light and dark themes, reduced motion, keyboard order, and 320–1920px widths.

## Run

```bash
npm install && npm run dev
```

## Integration notes

- Binds to the store only through `src/store/index.ts` (`actions` + selector hooks). Swapping engines touches `useProjectStore.ts` only — the UI does not change.
- Failure injection lives in the engine (Part A). The recovery UI consumes whatever failures the engine produces.
