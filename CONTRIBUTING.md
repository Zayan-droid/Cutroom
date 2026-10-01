# Contributing to Cutroom

Cutroom is split into three layers that depend on each other in exactly one
direction: **UI → store → engine**. Work is organized along that seam, so each
change stays inside one layer where possible.

## Branch strategy

`main` is always green and deployable. Never commit directly to it — open a pull
request. Name branches by the part they touch:

| Prefix | Layer | Paths |
| --- | --- | --- |
| `feat/part-a-*` / `fix/part-a-*` | Engine | `src/engine/`, `src/assets/` |
| `feat/part-b-*` / `fix/part-b-*` | Store | `src/store/` |
| `feat/part-c-*` / `fix/part-c-*` | UI | `src/ui/`, `src/lib/` |
| `ci/*`, `docs/*`, `chore/*` | Infra | `.github/`, docs, config |

```bash
git switch main && git pull
git switch -c feat/part-a-your-change
# ...work...
git push -u origin feat/part-a-your-change
gh pr create --fill
```

## Before you open a PR

Run the same gates CI runs:

```bash
npm run typecheck   # tsc --noEmit (plus per-part: typecheck:engine / typecheck:store)
npm test            # node --test over tests/*.test.mjs
npm run build       # tsc --noEmit && vite build
```

Tests live in `tests/` as `*.test.mjs` and import the TypeScript sources
directly (Node 24 strips types — see the CI Node version). Add tests next to the
layer you change: engine behavior in `tests/engine*.test.mjs`, store behavior in
`tests/store*.test.mjs` / `tests/toast.test.mjs`, pure UI helpers in
`tests/lib.test.mjs`.

## CI / CD

- **CI** (`.github/workflows/ci.yml`) runs typecheck, tests, and build on every
  push to `main` and every pull request. All three must pass before merge.
- **Deploy** (`.github/workflows/deploy.yml`) builds and publishes the app to
  GitHub Pages on every push to `main`.

Recommended one-time setup on `main`: a branch protection rule requiring the
**Typecheck**, **Tests**, and **Build** checks to pass before merging.

## Commit messages

Imperative mood, present tense ("Add store toast tests", not "Added"). Keep the
subject under ~72 characters and explain the *why* in the body when it isn't
obvious.
