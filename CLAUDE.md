# Working agreement for this repo

Standing instruction. Follow every session without being re-asked.

## 1. Branch and issue context — confirm and report, always
Never commit on `main`. Before ANY code change:
- Confirm the branch (`git branch --show-current`). If on `main`, STOP and say so —
  a new change needs its own branch off an up-to-date main
  (`git checkout main && git pull && git checkout -b <name>`).
- If the task references a GitHub issue, run `gh issue view <number>` (including
  comments) before doing anything else — a pasted summary may be stale.
- State both confirmations explicitly at the top of your response — branch name,
  and issue number plus anything that changed since the pasted summary. A check
  that isn't reported is indistinguishable from a check that didn't happen.

If a change doesn't fit the current branch's purpose, STOP and flag it — it belongs
on its own branch; don't pile unrelated work on. Never stage, commit, or push — I
run all git-write operations myself in the terminal. Propose the change, show the
diff, and stop there. Naming: `feature/<name>`, `fix/<name>`.

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
When a prompt asks for a command's output, paste the output verbatim — a summary of
what it said is not a substitute, because the point of the step is that the reader
can check it independently. If a command produced no output, say so explicitly.

## 4. Two invariants that must never break
Both cause silent, hard-to-trace corruption. Each is stated in full below because
this file carries verbatim between repos and must stand alone. The originals —
FINDINGS F1 and F16, plus PORT-AUDIT.md §4.5 — live in the **web repo** (Reading
Aid Tool); treat those IDs as a back-reference for anyone who has that repo, not
as a live pointer.

- **`Word.id` === flat word index.** Parsers must call `reindexWords` last; don't
  filter blocks after. *(F16, in substance: the block lookup is a binary search,
  so its input array must stay non-decreasing. A sentinel that isn't in-range —
  a word-less block marked `Number.MAX_SAFE_INTEGER` — breaks that precondition,
  and one mid-document empty block silently corrupts every lookup after it.
  Encode "absent" in-range: give an empty block the next word's id.)*

- **The active-word highlight must NOT re-render the document tree on the
  per-pacer-tick path.** Move the highlight imperatively; re-render only at
  block / virtualization-window boundaries. *(F1, in substance: rendering the
  highlight as a React prop re-reconciled the whole document tree — ~57k word
  components — on every tick, blowing the frame budget above ~150 WPM. Two
  independent fixes were needed and neither alone sufficed: pub/sub decoupling
  removed the per-tick cost; list virtualization removed the baseline cost. A
  virtualized list hands you the second half for free and the first half not at
  all.)*

  The principle above is platform-neutral. The **mechanism** is not:
  - **Web:** direct DOM manipulation from the subscriber callback.
  - **React Native: UNDECIDED — do not treat this as settled.** The candidates
    are `setNativeProps` (deprecated under the New Architecture) and Reanimated
    shared values (current idiom, but a dependency in a layer the port wants
    thin). Whichever is chosen must locate word N, move a highlight to it, and
    scroll only on line change — without re-rendering the list.

  Three guards make the invariant survivable on either platform:
  1. **The seam stays an integer callback.** It is
     `subscribe(cb: (index: number) => void)` and must remain exactly that — no
     element, rect, or style object may cross it. That is what lets the clock
     move between engines unchanged.
  2. **The index stays a ref, never state.** "Just use `useState`, the list is
     fast enough" is precisely the cliff described above; guard against it. `ref`
     semantics are identical on both platforms.
  3. **A mounted-range / viewability callback may never trigger a scroll.** It
     fires on *any* scroll, including the user's own, so scrolling from it fights
     the user. Web's `onRangeChange` and React Native's `onViewableItemsChanged`
     carry the identical hazard — keep both highlight-state-only. This is the
     constraint most likely to be violated silently during a port, because the
     callback has a different name and an innocent-looking signature.

For everything else — stack, architecture, scope, decision history — read
PROJECT_CONTEXT.md / ARCHITECTURE.md / DECISIONS.md / FINDINGS.md. Those plus the
GitHub issues are the source of truth.