# Cutroom design system — master

> **Logic:** when building a page, first check `design-system/cutroom/pages/<page>.md`.
> If it exists, its rules override this file. Otherwise follow this file.

**Revised:** 2026-10-04. Replaces the generated 2026-09-30 "Modern Dark (Cinema)" master.
**Implemented in:** `tailwind.config.js` (token names), `src/index.css` (token values, both
themes), `src/ui/components/*` (primitives).

---

## Direction

A working edit room, not an AI landing page. The footage is the brightest, most colorful
thing on screen; the interface around it is paper, ink, and one accent. Structure comes
from type, alignment, and hairline rules — not from glow, blur, or gradients. Every
control says what it does and what it costs in plain words.

The ui-ux-pro-max search matched the right *style* families (E-Ink/Paper, Swiss
Modernism 2.0) but its default palette for this product category was the violet + pink
"AI generation" pair, so the palette below is a deliberate override.

## What this system rejects

| Rejected pattern | Use instead |
| --- | --- |
| Near-black navy as the only theme | Light "paper" default; optional warm-graphite dark theme, chosen in the top bar and remembered |
| Violet → pink/fuchsia gradient accent | One flat accent (`mark`, vermilion) for the primary action and selection only; no gradients anywhere in chrome |
| Gradient-filled headline word | Plain, direct titles ("Start a video") set in Archivo; hierarchy from size and width |
| Glassmorphism, `white/[0.03]` fills, hairline white borders | Opaque surfaces (`paper`, `sheet`, `well`); `rule` hairlines; `edge` (3:1) for control borders |
| Lucide thin-line icons everywhere | No icon library. A small solid glyph set (`Glyph.tsx`) only where a symbol is the convention: transport, download, back, reroll, check |
| Centered "Describe what you want…" hero | Left-aligned composer with labeled fields, beside a clearly labeled sample clip and a cost explanation |
| Pill chips for options / "Try:" | Native radio groups drawn as joined rectangles (format picker shows the true frame ratio); examples as underlined text buttons; nudges as rectangular buttons |
| Gradient CTA with ✨ | Solid `mark` button with a verb and its price: "Generate 4 drafts \| Free", "Render final \| 8 credits" |
| ⌘K "Search actions" palette | Every action is a visible control where it applies; plain shortcuts listed under the work area (← →, Esc, R, M, N) |
| Grain, ambient blobs, shimmer skeletons, uppercase micro-labels | Flat surfaces; determinate progress (big percentage + bar from real engine progress); sentence-case labels ≥13px |

Also avoid: Inter, `rounded-2xl` everything, glow shadows, emoji, decorative overlays on
footage (grain, vignette, play badges), and "costume" swaps (film sprockets, monospace
labels, oversized editorial whitespace).

## Color tokens

Values are `R G B` channels on `:root` / `[data-theme]` so Tailwind opacity modifiers work
(`bg-ink/10`). Never use raw hex in components — except media-plate colors burned into
story frames and subtitles, which must not change with the UI theme.

| Token | Light | Dark (graphite) | Role |
| --- | --- | --- | --- |
| `paper` | `#F2EEE6` | `#1A1916` | Page background |
| `sheet` | `#FAF8F3` | `#22201C` | Panels, composer, toolbars |
| `well` | `#E7E2D7` | `#121110` | Media surround, progress frames |
| `field` | `#FFFDF8` | `#121110` | Text inputs, selects |
| `ink` | `#1A1814` | `#EEE9DF` | Primary text, strong rules, focus ring |
| `ink-2` | `#4A453D` | `#BCB5A7` | Secondary text |
| `ink-3` | `#625C51` | `#968F81` | Tertiary text (still ≥5:1) |
| `edge` | `#8C8478` | `#78716A` | Control boundaries (≥3:1) |
| `rule` | `#D9D2C5` | `#37342F` | Decorative hairlines |
| `mark` | `#BF3A10` | `#F06A3E` | The accent: primary action, current selection, scrubber fill |
| `on-mark` | `#FFFFFF` | `#1A1916` | Text on `mark` (5.5:1 / 5.7:1) |
| `ok` / `warn` / `bad` | `#2E6B40` / `#855600` / `#A3221A` | `#7CC48E` / `#E2AE55` / `#F28B7C` | Ready, held credits, failures |

Measured contrast: `ink` 15:1, `ink-2` ≥7:1, `ink-3` ≥5:1 on every surface; `mark` text
≥4.7:1 on `paper`/`sheet`. Status is never color alone — words plus an empty / half / full
square.

## Typography

- **Archivo** (variable `wdth` 62–125, `wght` 100–900) for all UI. Hierarchy comes from
  weight and width: `.stretch-wide` (112%) for page titles and the wordmark,
  `.stretch-condensed` (84%) for big progress numerals. Numbers that change use `.tnum`.
- **Newsreader** (serif, variable optical size) only for words the user wrote or the
  engine wrote for them: prompts, story ideas, story titles. It separates content from
  chrome; it is not a decorative headline face.
- Sizes: page title 32/40px bold; section 20px bold; body 16px; controls 15px; metadata
  13px minimum. Labels are sentence case at 14px semibold — never tiny tracked caps.

## Shape, surface, depth

Radii 2–4px (`rounded-sm`, `rounded`, `rounded-md`); 0 on media frames. Panels are `sheet`
with a 1px `rule` border. No shadows or blur on surfaces. The top bar has a solid ink rule
underneath. Dialog backdrop is a flat ink scrim.

## Components (`src/ui/components`)

- **Button** — `primary` (mark), `secondary` (ink outline), `quiet` (text), `danger`.
  Sizes sm 36 / md 44 / lg 48px; `.tap` lifts small targets to 44px on touch. Pressed state
  is a 1px nudge, not a scale. Prices ride inside with `ButtonCost`.
- **IntentSelector** — native radios (arrow keys work). Full variant shows name, ratio, and
  render price; stacks on phones. Compact variant shows the ratio on phones, the name on
  wider screens; both are announced in full.
- **Status** — square glyph (empty queued, half generating, full ready/failed) + word,
  with live percentage while generating.
- **TakeFrame** — footage untouched. Thumbs crop to the format; the stage shows the whole
  frame with real controls (play/pause, scrub, time, sound). States: progress (percentage
  + bar), failed (hatched, "No picture"), no media, load error with "Try again". Reduced
  motion: no autoplay, still accessible.
- **Toaster** — solid ink notes bottom-left, `role=status`, tone strip on the left.
- **ConfirmDialog** — native `<dialog>`; focus starts on Cancel; Esc cancels.
- **DownloadTake** — saves a take's media as `cutroom-<prompt>-<version>.<ext>`; if the
  browser can't fetch it, says so and offers the file directly.
- **Glyph** — play, pause, stop, record, restart, back, forward, download, retry, check,
  plus, sound, muted; `BrandMark` is the trimmed-corner frame.

## Layout

Container `max-w-[1400px]`, gutters 16px (phones) / 24px. Breakpoints used: 640 / 768 /
1024 / 1280. Single-column grids are `grid-cols-1` so intrinsic widths can't cause
horizontal scroll.

- **Opening screen:** title + one-line explanation; composer (7fr) beside sample clip and
  the drafts/render/versions explanation (5fr); stacked on phones.
- **Takes:** compact prompt row; work column + 320px version history (below on < 1024px).
  Widescreen drafts are 2-up, tall formats 4-up.
- **Stage:** picture first. Widescreen spans the column with actions directly below; tall
  formats put actions beside the frame. Frame height is budgeted against the viewport so
  "Render final" stays above the fold at 1280×800 and up.

## Motion

One curve, `cubic-bezier(0.2, 0, 0, 1)`; 160ms exits, 240ms entrances, 320ms shared-frame
moves. Motion explains state: drafts arrive in sequence, the chosen draft's frame grows
into the stage, history rows slide in, the credit number rolls. No springs, bounces,
looping decoration, or scale pops. `<MotionConfig reducedMotion="user">` plus a CSS safety
net. Stages are keyed per take so every switch is a clean exit and entrance.

## Copy

Direct verbs and nouns: "Generate 4 drafts", "Render final", "Download final render",
"Remix into 4 drafts", "Adjust and retry", "Reroll" (matches engine messages). State the
price at the decision point and when it is charged ("Charged only when the render
finishes"). No slogans, no internal terms (P1/P2, "palette shell").

## Pre-delivery checklist

- [ ] None of the rejected patterns above, in any state (failed, loading, dialogs, story).
- [ ] Only tokens in components; both themes checked.
- [ ] Text ≥4.5:1, control borders ≥3:1, focus ring visible (ink, 2px, offset).
- [ ] Every action has a visible control and a plain label; prices shown before commit.
- [ ] Shortcuts match exactly: a bare key never fires with Ctrl/Cmd/Alt/Shift held.
- [ ] No nested interactive controls; native radios/dialog where they exist.
- [ ] Touch targets ≥44px on coarse pointers; no hover-only information.
- [ ] Reduced motion: no autoplay, no transforms; content still reachable.
- [ ] No horizontal scroll at 320, 375, 768, 1024, 1440.
- [ ] Footage shown without overlays; media errors are explicit and recoverable.
