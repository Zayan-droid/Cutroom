# Cutroom

[![CI](https://github.com/Zayan-droid/Cutroom/actions/workflows/ci.yml/badge.svg)](https://github.com/Zayan-droid/Cutroom/actions/workflows/ci.yml)
[![Deploy](https://github.com/Zayan-droid/Cutroom/actions/workflows/deploy.yml/badge.svg)](https://github.com/Zayan-droid/Cutroom/actions/workflows/deploy.yml)

> Generation as editing, not gambling.

**Live demo:** https://zayan-droid.github.io/Cutroom/

Cutroom is a demo UI for AI video generation that treats every generation as a
**take** in an editable tree — not a one-shot slot-machine pull. You draft, pick,
render, remix, retry, and nudge; nothing you make is ever thrown away, and the
version rail always lets you walk back up your own history.

This repository is the **Part C: UI & Motion** build, wired to a self-contained
mock engine and store so the whole experience runs offline with no backend.

## Architecture

Three layers, kept deliberately separate. Calls only ever run one way:
**UI → store → engine.**

```
  Part C — UI & Motion          Part B — Store & State        Part A — Engine
 ┌──────────────────────┐      ┌──────────────────────┐      ┌──────────────────────┐
 │ React components      │─────▶│ Zustand store         │─────▶│ Mock generation      │
 │ Framer Motion / feel  │ read │ take tree + actions   │ call │ engine (stub)        │
 │ prompt · drafts ·     │◀─────│ credits · selection   │◀─────│ timing · cost ·      │
 │ rail · render · recover│ subs │ persistence           │resolve│ failure injection   │
 └──────────────────────┘      └──────────────────────┘      └──────────────────────┘
```

- **`src/engine/`** — the mock generation engine (timing, cost quoting, failure
  injection, bundled offline clips). Has no store, React, or network deps.
- **`src/store/`** — a vanilla Zustand store that owns every state transition:
  the take tree, credit balance, selection, and persistence.
- **`src/ui/`** — React components and Framer Motion: prompt, draft grid, stage,
  version rail, render, and recovery surfaces.

See [`Docs/WORKSTREAMS.md`](Docs/WORKSTREAMS.md) for the full breakdown, and the
per-layer READMEs in [`src/engine/`](src/engine/README.md) and
[`src/store/`](src/store/README.md).

## Getting started

```bash
npm install
npm run dev
```

Then open the Vite URL it prints. The app seeds a session with 120 simulated
credits and runs entirely against the bundled mock engine.

### Mock engine configuration (optional)

Copy [`.env.example`](.env.example) to `.env.local` to control the demo engine's
seed, outcome (random / success / failure), and timing. Restart Vite to apply.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Typecheck, then build for production |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Run the full Node test suite |
| `npm run test:engine` | Engine tests only |
| `npm run test:store` | Store tests only |

## CI / CD

Every push and pull request runs [CI](.github/workflows/ci.yml) — typecheck,
tests, and build must all pass. Merges to `main` auto-deploy to GitHub Pages via
[deploy.yml](.github/workflows/deploy.yml). Work happens on per-part feature
branches; see [`CONTRIBUTING.md`](CONTRIBUTING.md) for the branch strategy.

## Tech stack

React 18 · TypeScript · Vite · Tailwind CSS · Zustand · Framer Motion ·
lucide-react. Tests run on the built-in `node --test` runner (Node 24+, which
strips TypeScript types so the `.test.mjs` files import `.ts` sources directly).

## Project layout

```
src/
  engine/   Mock generation engine (Part A)
  store/    Zustand store & persistence (Part B)
  ui/       React components & motion (Part C)
  story/    3-minute story agent — headless engine & timeline (Half 1)
  lib/      Shared helpers (cost, media, motion, cn)
  assets/   Bundled offline demo clips
tests/      Engine, store, story, and integration tests
Docs/       PRD, TRD, workstreams, Part C spec, story-agent spec
design-system/  Cutroom design system notes
```
