# Working agreement for this repo

This file is standing instruction. Follow it every session without being re-asked.

## 1. Branch before changing code — always

Never make code changes on `main`. Before starting ANY code change:
- Confirm the current branch (`git branch --show-current`).
- If on `main`, STOP and tell me — a new change needs its own branch off an
  up-to-date main (`git checkout main && git pull && git checkout -b <name>`).
- If the change is unrelated to the current branch's purpose, STOP and flag it:
  it likely belongs on its own branch. Do not pile unrelated work onto a branch.
- Do not commit or push unless I explicitly say so. Propose first; wait for
  sign-off; I review in the browser before commit.

Branch naming: `feature/<name>` for new features, `fix/<name>` for bug fixes.

## 2. Docs are part of "done" — never skip them

This codebase is headed for a React Native port, so documentation is
load-bearing, not optional. A change is NOT complete until the docs reflect it:
- **DECISIONS.md** — append an entry for every judgment call or resolved design
  fork (what, why, alternative rejected). Append-only; never rewrite history.
- **FINDINGS.md** — record anything LEARNED by building/testing (distinct from
  decisions), tagged with how it was verified: check-unit / build / user-confirmed /
  derived / assumed. Be honest about the level.
- **ARCHITECTURE.md** — update when structure, data flow, or the portable-vs-
  web-layer split changes.
- **PROJECT_CONTEXT.md** — keep scope current when features are added or changed.

If a change contradicts something the docs record as done, fix the code OR
correct the doc — the two must never disagree. Flag drift when you find it.

## 3. Verify honestly

Where practical, prove a change with a headless check (esbuild to node, the
repo's existing ad-hoc pattern) and show the output. Distinguish what was
actually run from what is assumed. Never claim something is verified when it
was only reasoned about. npm run build must stay clean.

## 4. Project facts (so a fresh session has context)

- Stack: React + Vite + TypeScript, fully client-side, no backend/API.
- Core invariant: Word.id === flat word index; the pacer and RSVP context
  strip both depend on it. Never break it (parsers must call reindexWords
  last; don't filter blocks after).
- Perf invariant: the document tree must NOT reconcile on the per-pacer-tick
  hot path. Highlights move imperatively; re-render only at block/window
  boundaries.
- The four docs above + the GitHub issues are the source of truth. Read them
  if you lack context.
