# Working agreement for this repo

Standing instruction. Follow every session without being re-asked.

## 1. Branch before changing code — always
Never commit on `main`. Before ANY code change, confirm the branch
(`git branch --show-current`). If on `main`, STOP and say so — a new change needs
its own branch off an up-to-date main
(`git checkout main && git pull && git checkout -b <name>`). If a change doesn't
fit the current branch's purpose, STOP and flag it — it belongs on its own branch;
don't pile unrelated work on. Never commit or push without explicit sign-off:
propose first, I review in the browser. Naming: `feature/<name>`, `fix/<name>`.

## 2. Docs are part of "done"
A change isn't complete until the docs reflect it. Update the relevant one(s);
each documents its own purpose at its top:
- **PROJECT_CONTEXT.md** @PROJECT_CONTEXT.md  — scope.
- **ARCHITECTURE.md** @ARCHITECTURE.md  — structure, data flow, portable-vs-web split.
- **DECISIONS.md** @DECISIONS.md  — append an entry per judgment call (what / why / alternative
  rejected). Append-only; never rewrite history — corrections are appended and marked.
- **FINDINGS.md** @FINDINGS.md  — what was LEARNED by building/testing, tagged with how it was
  verified (unit / build / user-confirmed / derived / assumed). Be honest.
If code and a doc disagree, fix one and flag the drift — never leave them at odds.

## 3. Verify honestly
Prefer a headless check (esbuild → Node, the repo's ad-hoc pattern) over reasoning
alone, and show the output. Say plainly what was run vs. assumed; never call
something verified when it was only reasoned about. `npm run build` must stay clean.

## 4. Two invariants that must never break
Both cause silent, hard-to-trace corruption (see FINDINGS F1, F16):
- `Word.id` === flat word index. Parsers must call `reindexWords` last; don't
  filter blocks after.
- The document tree must NOT reconcile on the per-pacer-tick path. Highlights move
  imperatively; re-render only at block/window boundaries.

For everything else — stack, architecture, scope, decision history — read
PROJECT_CONTEXT.md / ARCHITECTURE.md / DECISIONS.md / FINDINGS.md. Those plus the
GitHub issues are the source of truth.
