# Cutroom — agent guide

Cutroom is a mock-engine UI for AI video generation ("generation as editing, not
gambling"). Three layers, calls only run one way: **UI → store → engine**. See
[`README.md`](README.md) and [`Docs/WORKSTREAMS.md`](Docs/WORKSTREAMS.md).

- `src/engine/` — mock generation engine (no store/React/network deps)
- `src/store/` — Zustand store; the only caller of the engine
- `src/ui/` — React + Framer Motion; reaches the engine only through the store
- `src/story/` — headless 3-minute story engine (Half 1)
- `src/ui/story/` — story player: stage, lip-sync, subtitles, transport (Half 2)

## Checks before you commit

```bash
npm run typecheck   # tsc --noEmit, must be clean
npm test            # node --test, all suites must pass
```

## Session Logs

Always commit `.agent-logs/` with your changes.

Session capture is the official 8x agent-capture setup: `UserPromptSubmit` and
`Stop` hooks in `~/.claude/settings.json` run `~/.claude/extract-log.py` (a copy
lives in [`.claude/extract-log.py`](.claude/extract-log.py)), which writes a
redacted prompt+response digest to `.agent-logs/<timestamp>_<session>.md`. Only
user prompts and final assistant text are kept — never tool calls, diffs, or
secrets. `.agent-logs/` is the directory the assignment brief requires, checked
at the repo root; it is canonical for every agent. Do not rename it (it was once
`.claude-logs/`; the hiring reviewer looks for `.agent-logs/`) or add it to
`.gitignore`.
