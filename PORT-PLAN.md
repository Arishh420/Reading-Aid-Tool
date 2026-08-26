# PORT-PLAN.md — decisions for the Android / React Native port

> **Purpose.** The *decisions* governing the Android port (issue #7), written
> down so a fresh session can act on them instead of re-deriving or re-asking.
>
> **Relationship to [PORT-AUDIT.md](PORT-AUDIT.md).** That document answers
> "which files **can** go" and deliberately decides nothing — it surfaces
> options in its §7 for Delta. This document answers "what **will** we do,"
> resolves two of those §7 items, and carries the rest forward unresolved. It
> **cites** PORT-AUDIT.md by section rather than restating its measurements;
> where a number matters, go read the section named.
>
> **Scope discipline.** This is a planning document. **No source file was
> modified**, no React Native scaffold was created, and no file was copied
> anywhere. `PORT-PLAN.md` is the only file added.
>
> Companion to [PORT-AUDIT.md](PORT-AUDIT.md) (the inventory),
> [CLAUDE.md](CLAUDE.md) (the working agreement that carries),
> [ARCHITECTURE.md](ARCHITECTURE.md) (Porting notes),
> [DECISIONS.md](DECISIONS.md), [FINDINGS.md](FINDINGS.md).
>
> **Written:** 2026-08-26. **Branch:** `docs/port-plan`.
> **Commit at time of writing:** `21c7235` (PR #104, `Closes #101`).

---

## 0. How to read this file

**Every claim about React Native or Hermes in this document is marked ❓.**
Nothing here was executed on the target: there is still no RN project, no
device, no emulator, and no Hermes binary in or near this repo. That is the same
limitation PORT-AUDIT.md §0 and §8 state for itself, and this document does not
improve on it — it makes *decisions* under that uncertainty, it does not reduce
it. Where a claim rests on an earlier finding that **did** execute on Hermes
(F25, F41), it is credited to that finding, not to this document.

The two decisions below (§2, §3) are **product/architecture calls**, not
measurements. They are correct-by-choice, not correct-by-evidence. The evidence
they *lean on* is cited; the choice itself is Delta's and is recorded here so it
stops living only in chat.

---

## 1. Status board

| # | Item | Status | Where |
|---|---|---|---|
| — | Repository topology (two repos, sibling, seed-not-clone) | **DECIDED** | [§2](#2-decided--repository-topology-two-repos-side-by-side) |
| §7.2 | Storage: MMKV, synchronous | **DECIDED** | [§3](#3-decided--storage-mmkv-synchronous) |
| — | What carries verbatim vs. what needs rewriting | **DECIDED** | [§4](#4-decided--what-carries-verbatim-vs-what-needs-rewriting) |
| §7.1 | `presets.ts`'s `DEFAULT_*` value-import taint | **RESOLVED** by issue #101 / PR #104 (D119) | [§6](#6-open--carried-forward-from-port-auditmd-7) |
| — | **Core drift across the repo boundary** | **OPEN — no option chosen** | [§5](#5-open--core-drift-across-the-repo-boundary) |
| §7.3 | `keyboard.ts` — port, or drop? | **OPEN** | [§6](#6-open--carried-forward-from-port-auditmd-7) |
| §7.4 | The per-tick RN mechanism | **OPEN** | [§6](#6-open--carried-forward-from-port-auditmd-7) |
| §7.5 | Fate of the 12 headless suites | **OPEN** | [§6](#6-open--carried-forward-from-port-auditmd-7) |
| §7.6 | Hermes verification for the seed set | **OPEN** | [§6](#6-open--carried-forward-from-port-auditmd-7) |
| §7.7 | PDF's seam position; is PDF in the first cut? | **OPEN** | [§6](#6-open--carried-forward-from-port-auditmd-7) |
| §7.8 | `atEnd`/`startedRef` semantics on touch | **OPEN** | [§6](#6-open--carried-forward-from-port-auditmd-7) |

---

## 2. DECIDED — Repository topology: two repos, side by side

### 2.1 The decision

**The Android port lives in its own, brand-new repository containing a fresh
React Native scaffold. It is not a fork of this repo, not a clone of it, and not
a branch of it. Its `core/` directory is *seeded* — portable files are copied
in — not inherited.**

**That repository lives as a SIBLING directory to this one. Never nested inside
it.**

```
~/Documents/Claude Code/
├── Reading Aid Tool/          ← this repo (web).      .git here
└── Reading Aid Android/       ← the port (new repo).  .git here
```

Not:

```
~/Documents/Claude Code/
└── Reading Aid Tool/          ← .git here
    └── android/               ← .git ALSO here  ✗ never do this
```

### 2.2 Why a fresh scaffold and not a clone

A clone looks cheaper and is not. Three concrete costs, all of which a fresh
scaffold simply does not incur:

1. **It brings roughly two dozen files that cannot go.** PORT-AUDIT.md §1
   classifies every module under `src/`: of the 38 `.ts`/`.tsx` files present at
   commit `21c7235`, 12 are PURE (§2 of that document), one is
   `vite-env.d.ts` (build config, replaced wholesale by Metro), and one —
   `settings-defaults.ts` — postdates the audit (see §4.2 below). The remaining
   **24 are BORDERLINE or IMPURE**, plus `index.css`. Cloning drags all of them
   in. The problem is not disk space; it is that they *look* usable. A file like
   `scrollHelpers.ts` or `FlowingHighlight.tsx` will typecheck far enough to be
   tempting, and the port's job — designing an RN mechanism that satisfies
   CLAUDE.md §4's invariant (PORT-AUDIT.md §4.5) — is precisely the job that a
   half-working web implementation sitting in the tree discourages. Seeding
   makes "what goes in `core/`" an explicit act with a checkable answer; cloning
   makes it a deletion exercise nobody finishes.

2. **It brings git history describing a different app.** Every commit,
   every `Closes #N`, every PR reference in the log resolves against *this*
   repo's issue tracker. In a cloned Android repo, `git log` becomes a
   permanent source of false context: `#87` means the ORP grapheme-cluster fix
   here and something else (or nothing) there. The port's history should start
   at its own first commit and mean what it says.

3. **It brings docs that describe the web app.** ARCHITECTURE.md's
   `@tanstack/react-virtual` and `index.css` sections, PROJECT_CONTEXT.md's
   Vite stack, and DECISIONS.md's 119 entries are all *true of this repo* and
   mostly *not true of the port*. §4.3 states what each needs instead. A clone
   starts the port with four documents that are confidently wrong, which is
   worse than starting with none.

**What is *not* a reason:** none of this says the web repo's history or docs are
low quality — the opposite; they are the reason the port is tractable at all.
The port reaches them **by reference** (§4.3, §5), not by inheritance.

### 2.3 Why sibling, and never nested

Two `.git` directories in a parent/child relationship is a well-known source of
git-state confusion: commands run from the child can resolve against the parent
(or vice versa) depending on `cd` position and how the tool invoking them
resolves the working directory, so a status/diff/commit can silently target the
wrong repository. This repo's own working agreement is built on *always
confirming which branch you are on before changing anything* (CLAUDE.md §1) —
an ambiguity about which **repo** you are in defeats that check entirely,
because the branch name reported would be the right answer to the wrong
question.

A sibling layout removes the ambiguity structurally rather than by discipline:
there is no path from inside one repo that lands inside the other, so no command
can be confused about which it belongs to.

> **Citation note, flagged rather than left standing (CLAUDE.md §2).** The task
> that produced this document cited a *"Git state confusion" section in
> CLAUDE.md*. **No such section exists** — `grep -rni "git state confusion"`
> across the repo returns nothing, and `git log --all -S "Git state confusion"`
> returns no commit in any revision of any file, including all six revisions of
> CLAUDE.md. The reasoning above is therefore stated on its own terms here
> rather than pointing at a target that would not resolve for a future reader.
> If that section is intended to exist in CLAUDE.md, adding it is a separate
> change on its own branch.

### 2.4 What "seeding" means concretely

Seeding is a **copy, in one direction, at a known commit**, recorded as such:

- The port's `core/` receives the files listed in §4.2, copied from this repo.
- The copy is made from a **named commit**, and that commit is written down in
  the port repo (its own `PORT-PLAN`-equivalent or first commit message), so
  "which version of `orp.ts` is this?" always has an answer.
- Nothing flows back automatically, and nothing is kept in sync automatically.
  **That is precisely the unresolved problem §5 raises** — seeding is decided;
  what happens to the two copies afterward is not.

---

## 3. DECIDED — Storage: MMKV, synchronous

**This resolves PORT-AUDIT.md §7 item 2.**

### 3.1 The decision

**The port uses MMKV, and `storageGet`/`storageSet`/`storageRemove` stay
synchronous.** AsyncStorage is rejected.

### 3.2 Why: it is a substitution at a seam that already exists

PORT-AUDIT.md §6.2 identifies `storage.ts` as "the model case of a well-drawn
seam" — three call sites, all `try`-wrapped, closure 1, ext NONE, and the
file's own header already states that swapping the platform API behind the same
interface is its purpose. §6.2 further records that `readingPosition.ts` sits on
top of it and is *already* pure (closure 2, ext NONE, scan NONE).

A synchronous MMKV backing keeps that seam a seam: `storage.ts`'s three function
bodies change, their **signatures do not**, and `readingPosition.ts` — the
entire persistence schema and gating logic, `BookRecord`, `PositionSnapshot`
(including the #76 per-snapshot `wordCount`), the always-write-`latest` rule,
the >2 % history gate, the 5-entry cap — is seeded with **zero edits**. ❓ The
claim that MMKV's API is synchronous on the target is taken from its documented
surface and has not been executed here.

### 3.3 Why not AsyncStorage

AsyncStorage forces the three signatures to `Promise`-returning. PORT-AUDIT.md
§6.2 traces the ripple precisely: `storageGet<T>(key): T | null` returns a value
directly, and it is called synchronously by `loadBookRecord` and by
`presets.ts`'s `loadStore`; making it async changes those, and then
`App.tsx`'s `handleLoad` and the presets panel above them.

That is **four files rewritten to accomplish a substitution** — and a
substitution that rewrites its callers is not a substitution, it is a redesign
of the seam the architecture spent effort establishing. The cost is not the
typing; it is that every one of those four rewrites is a place where the ported
logic diverges from the verified web logic for a reason that has nothing to do
with the port's actual problem.

### 3.4 The correctness argument — this is the load-bearing half

Reading position saves on three triggers (D73): a 30 s interval, a
visibility-change, and a page-hide. The last two fire at **moments when the app
may be terminating**. PORT-AUDIT.md §6.3 records that on the RN side these
become `AppState` transitions ❓, and — importantly — that **mobile
backgrounding is more aggressive than a browser tab hide**, and that a
backgrounded `setInterval` on Android may be throttled or suspended entirely ❓.
The consequence §6.3 draws is that the `AppState` save becomes the *primary*
trigger on Android rather than a backup.

That shifts the whole weight of the feature onto exactly the trigger that fires
during teardown. And there:

- **A synchronous write either completes or it does not.** It is done before the
  handler returns.
- **An awaited write during teardown is a race** against process suspension. It
  may resolve; it may be abandoned mid-flight with no error anyone sees.

The failure mode is losing the user's place — which is the core promise of the
feature (issue #6) and, given problem 2 in PROJECT_CONTEXT.md §1, close to the
core promise of the app. Trading a guaranteed write for a probable one, at the
one moment it matters most, is not an acceptable trade for API convenience.

### 3.5 The cost, recorded not hidden

This decision is not free, and pretending otherwise would make it unreviewable:

- **MMKV is a third-party native module.** AsyncStorage is closer to the RN
  community default. Choosing MMKV means choosing the less-defaulted path ❓.
- **It requires native configuration** — an autolinked native dependency with
  platform build setup, rather than a pure-JS drop-in ❓.
- **It complicates Expo Go.** A managed Expo Go workflow cannot load arbitrary
  native modules; using MMKV implies a development build / prebuild (or a
  bare workflow) rather than the zero-setup path ❓.
- **AsyncStorage would be genuinely easier to stand up** on day one.

The decision accepts a harder day one for a correctness property that cannot be
recovered later by refactoring. If the native-module cost turns out to be
prohibitive in practice, that is a reason to **revisit this entry explicitly**
(and record the revisit) — not a reason to quietly swap in AsyncStorage and
leave `readingPosition.ts` looking untouched while its guarantees changed.

### 3.6 Sequencing — this had to be decided *before* seeding, not after

PORT-AUDIT.md §7 item 2 states the sequencing requirement in its own words: this
"is the single decision with the widest blast radius in the storage layer, and
it should be made **before** `readingPosition.ts` is seeded, not after."

That requirement is what this section discharges. The order is:

1. This decision (recorded here). ✅
2. Then `storage.ts` is written against MMKV in the port.
3. Then `readingPosition.ts` is seeded, unedited.

Reversing 1 and 3 means seeding a file whose callers' signatures are not yet
settled — and discovering, after it is in `core/` and looks portable, that it
needs `await` threaded through it.

### 3.7 What this decision does *not* settle

- It does **not** settle `crypto.subtle` (PORT-AUDIT.md §5.4, §6.2). The
  book-identity fingerprint needs a native crypto module or a JS SHA-256 on the
  RN side ❓, and §5.4 flags the sharp edge: if the port's implementation
  produces different bytes for the same book, **every saved position becomes
  unreachable**. The sampling regions and the 8-byte big-endian size suffix
  (D67) must be reproduced exactly. Still open; not part of this entry.
- It does **not** settle the `visibilitychange`/`pagehide` → `AppState`
  mechanism swap (§6.3), only the guarantee the swap has to preserve.
- It does **not** re-decide the key schema. `readingaid_v1:` (D68) is carried by
  `storage.ts` and is unaffected.

### 3.8 One consequence worth confirming at seed time

With `storage.ts` swapped, `presets.ts` — which PORT-AUDIT.md §3.5 refuted as
portable, and which #101 / PR #104 has since fixed (D119) — is in the same
position as `readingPosition.ts`: pure the moment the storage seam is swapped.
D119 records the re-measured closure as 3 local files (`presets.ts`,
`settings-defaults.ts`, `storage.ts`), external packages NONE.

This document does **not** add `presets.ts` to the seed set on that basis.
PORT-AUDIT.md §2's list was measured at commit `d888aa1` and has not been re-run
at `21c7235`. **Re-measure the seed set at seed time** using the method in
PORT-AUDIT.md Appendix A, and treat the result — not this paragraph — as the
list.

---

## 4. DECIDED — What carries verbatim vs. what needs rewriting

### 4.1 CLAUDE.md carries VERBATIM

**Decision: CLAUDE.md is copied to the Android repo unchanged.**

PR #103 (`Closes #97`) prepared it for exactly this. Three properties make it
carry:

1. **The F1/F16 citations state their substance inline.** CLAUDE.md §4's
   preamble says so explicitly — "Each is stated in full below because this file
   carries verbatim between repos and must stand alone" — and instructs the
   reader to treat the `F1`/`F16`/`PORT-AUDIT.md §4.5` IDs as a back-reference
   for anyone who has the web repo, **not** as a live pointer. So the file is
   self-contained in a repo where FINDINGS.md does not exist.

2. **The reconciliation invariant is stated platform-neutrally, with the RN
   mechanism marked undecided.** CLAUDE.md §4 separates the *principle* ("must
   NOT re-render the document tree on the per-pacer-tick path") from the
   *mechanism*, marks React Native **"UNDECIDED — do not treat this as
   settled,"** names both candidates, and then states the three guards that hold
   on either platform — the integer-callback seam, the index-as-ref rule, and
   the "a mounted-range / viewability callback may never trigger a scroll" rule
   that names `onViewableItemsChanged` alongside `onRangeChange`. The file
   therefore arrives in the port repo already correct about the port, including
   about what the port has not yet chosen.

3. **A grep confirms no web-only dependency.** Run against the file at
   `21c7235`, searching for `DOM|localStorage|querySelector|getBoundingClientRect|browser|CSS|vite|Vite|window.|document.|classList|HTMLElement|react-dom|@tanstack`,
   there is exactly **one** hit — line 65, `- **Web:** direct DOM manipulation
   from the subscriber callback.` That is not a dependency; it is the labelled
   *web* half of the deliberate web-vs-RN contrast described in point 2, and its
   RN counterpart is the next line. The file has no other web coupling.

**One small thing to confirm rather than assume, since "verbatim" is a strong
claim:** CLAUDE.md §3 requires `npm run build` to stay clean. That command name
is generic, but an RN scaffold does not necessarily define a `build` script. The
port should confirm the sentence still names a command that exists there ❓ —
and if it does not, that is a one-line adjustment in the *port's* copy, made
deliberately, not a reason to withhold the file.

### 4.2 The 12 PURE files are copied as-is

These are PORT-AUDIT.md §2's seed candidates — each proven by esbuild
transitive-closure measurement to reach zero external packages and zero web-only
files, *and* by a comment-stripped global scan to contain no browser global. See
that section for the measurements; they are not restated here.

| # | File | Role |
|---|---|---|
| 1 | `src/model/types.ts` | `Document`/`Block`/`Word` model |
| 2 | `src/model/tokenize.ts` | tokenizer, `flattenWords`, `reindexWords` |
| 3 | `src/model/blocks.ts` | flat-word-index → block lookup (binary search) |
| 4 | `src/model/delimiterSpans.ts` | per-word RSVP delimiter decoration |
| 5 | `src/pacer/orp.ts` | ORP index, grapheme clustering, `splitOrp` |
| 6 | `src/pacer/dwell.ts` | dwell multipliers + `dwellMultiplier` |
| 7 | `src/reader/bionic.ts` | `splitBionic` head/tail math |
| 8 | `src/parsers/markdown.ts` | Markdown → Document |
| 9 | `src/parsers/pdfText.ts` | PDF cleanup heuristics (lines → paragraphs) |
| 10 | `src/parsers/epubStructure.ts` | EPUB container/OPF spine + XHTML → blocks |
| 11 | `src/ui/theme.ts` | theme token/label data (**data, not a view** — see below) |
| 12 | `src/ui/sample.ts` | the built-in sample Markdown string |

Four things to carry along with the files:

- **`ui/theme.ts` and `ui/sample.ts` are data that happen to live under `ui/`.**
  PORT-AUDIT.md §2 makes this point: their directory is misleading, not their
  content. They should not land in a `ui/` directory in the port's `core/`.
- **The seed set is a snapshot, not a standing list.** §2's measurement was
  taken at commit `d888aa1`; this document is written at `21c7235`. Since the
  audit, `src/settings-defaults.ts` was added by PR #104 and is pure by D119's
  own re-measurement (closure 1, ext NONE) — a **13th** candidate the audit could
  not have listed. Re-run PORT-AUDIT.md Appendix A's method at seed time and use
  its output.
- **`tokenize.ts` carries an obligation, not just code.** PORT-AUDIT.md §3.3
  states it plainly: the `Word.id === flat word index` invariant is enforced *by
  discipline* — parsers must call `reindexWords` **last** and must not filter
  blocks afterward — and nothing in the file can enforce that on the RN side.
  The port inherits the obligation with the file. CLAUDE.md §4 carries it too,
  which is one more reason §4.1's verbatim copy matters.
- **`orp.ts` arrives with an undischarged obligation.** PORT-AUDIT.md §3.1 and
  the F42/F43 tails record that the RN **visual** re-verification of ORP
  rendering is a standing port-time obligation. Copying the file does not
  discharge it ❓.

### 4.3 ARCHITECTURE.md, PROJECT_CONTEXT.md, DECISIONS.md, FINDINGS.md do NOT carry

None of the four is copied. Each describes the web app; each needs something
different in the port:

| Doc | What the port needs instead |
|---|---|
| **ARCHITECTURE.md** | **A scoped rewrite, written as the port is built.** Its pipeline spine (parser → `Document` → `flattenWords` → clock + view) survives, and its Porting-notes tables are the *input* to the port rather than a description of it. But §9 (`@tanstack/react-virtual`, `getBoundingClientRect`, the reader pane as scroll element), §10 (CSS variables + `data-theme`), §7's mode views, and §8's CSS-grid fixed-x anchor all describe mechanisms the port replaces. Do not port the document and edit it down — write the RN one against the RN code, and use ARCHITECTURE.md's Porting-notes tables plus PORT-AUDIT.md §4/§5 as the specification of what the new mechanisms must satisfy. |
| **PROJECT_CONTEXT.md** | **A fresh, scoped document.** Its §1 problem statement (subvocalization; poor short-term retention) is app-level and true on any platform — that part is worth restating in the port's own words. Everything else is web-cut scope: §5's Vite/pdf.js/JSZip stack, §3's shipped-feature checklist, §9's milestone sequence. The port's scope is its own question, and only one piece of it is already settled: **D95 put EPUB in the first Android cut**; PDF is explicitly still open (§6, item §7.7). |
| **DECISIONS.md** | **A fresh, empty log — plus a back-reference, never a transcription.** D115 already established this as a forward-carrying principle for exactly this situation: future documentation, *including the port repo's*, references the frozen `-archive-v1.md` snapshot (and the live log) rather than restating or rewriting its contents. The port's log starts at its own D1 and inherits this repo's history by reference. Numbering deliberately restarts — a port-repo `D1` and a web-repo `D1` are different decisions in different repos, and pretending otherwise would make every cross-reference ambiguous. |
| **FINDINGS.md** | **A fresh, empty log — and the honest reason is that almost nothing in it transfers as *evidence*.** Its verification legend and its discipline should carry (the port should keep tagging ✅/🧪/👁/📐/❓ and keep an "Open / needs verification" index). Its *contents* are web measurements: F1's ~57k-node cliff, F3's CSS-grid algebra, F42/F43's browser A/B. The two entries with genuine target-engine evidence — **F25** (lookbehind on two Hermes binaries) and **F41** (`\p{M}` parity, `orp.ts` on Hermes v0.13.0) — are cited by reference from the port, and both already flag that the Hermes version tested is not the version the port will ship ❓. |

**The pattern in all four rows:** the port repo gets *fresh* narrative docs that
describe itself, and reaches this repo's history by **reference**. That is the
same relationship D115 defined between the live logs and the frozen v1 archive,
applied one repo boundary out — and it is why §2.2's third reason (a clone
brings docs that describe the web app) is a cost rather than a bonus.

---

## 5. OPEN — core drift across the repo boundary

**No option is chosen here. This is stated as an unresolved question because it
is one.**

### 5.1 The problem

§4.2 copies 12 files (13, once the seed set is re-measured — §3.8, §4.2) into a
second repository. From that moment there are **two copies of `orp.ts`, two
copies of `tokenize.ts`, two copies of `dwell.ts`**, and nothing whatsoever
keeping them in agreement. A fix landed in one is invisible to the other. There
is no type error, no failing test, no symptom — the two repos each build clean
while diverging.

**This repo has already documented this exact failure mode twice, at smaller
scale:**

- **F-PRESETS-5** — `presets/headless-test.mjs` hand-copies the preset
  definitions instead of importing the real module. When #78 changed the real
  bundles, the inline copy had to be updated by hand and the two "were diffed by
  eye"; that entry's own caveat says there is "no automated guard against the
  inline copy drifting from the real source."
- **Issue #105** (open) — `DEFAULT_BUNDLE.bionic` duplicates `DEFAULT_BIONIC` by
  value rather than referencing it. The issue's own words: *"Change one and the
  other drifts silently: no type error, no test failure, no visible symptom."*
  It explicitly names F-PRESETS-5 as the same failure mode, and concludes
  "duplication by value is how that happens."

Seeding `core/` is **duplication by value, one repo boundary up**, with the same
absence of a guard and a wider blast radius: the duplicated units are not two
constants but ~1,300 LOC carrying the bug-fix history of #9, #13, #14, #25, #41,
#42, #43, #47, #72, #73, #74, #77, #84, #87 and more.

It is also worth being precise about *which direction* hurts. Both do, but not
symmetrically: a fix landed **here** and not propagated leaves the port shipping
a bug this repo already fixed and documented — the worst case, because the port
repo's docs will not even know the bug exists.

### 5.2 Options, with trade-offs — none selected

**(a) A shared package.** Publish `core/` as a package (private registry, or a
workspace/monorepo arrangement) consumed by both apps.
*For:* one source of truth; drift becomes structurally impossible; versioning is
explicit; a fix propagates by bumping a dependency.
*Against:* the heaviest option. It contradicts §2's "two repos, side by side" by
introducing a third thing to own, or forces a monorepo that re-raises §2.2's
concerns in a new shape. It adds a publish/release step to every core change,
including one-line ones. Metro's resolution of a linked/workspace package needs
confirming ❓. And it front-loads infrastructure work before the port has proven
that `core/` is even the right boundary (PORT-AUDIT.md §8 item 7 explicitly does
not know whether the 12-file seed set is *sufficient*).

**(b) A git submodule.** `core/` is a submodule pointing at a repo (or a
subtree of this one) pinned to a commit.
*For:* one source of truth with an explicit, recorded pin; no publish step;
`git` already knows how to do it.
*Against:* submodules are a well-known source of "I forgot to update the
pointer" and of contributors ending up on a detached HEAD without noticing —
which is a **git-state-confusion class problem**, the same category §2.3
deliberately designed out of the repo layout. Choosing (b) partially re-adopts
what §2.3 rejected, and that tension should be resolved consciously rather than
discovered.

**(c) A sync script with a conformance check.** A script copies the seed set in
one direction and a check (run in CI, or as a documented pre-release step) fails
when the two copies differ — e.g. comparing hashes of the seed files, or
re-running the seed set's headless suites against the port's copies.
*For:* keeps §2's two independent repos exactly as decided; the check is the
automated guard that F-PRESETS-5 and #105 both identify as the missing piece;
it can be as small as a shell script plus a manifest. It also composes naturally
with PORT-AUDIT.md §7 item 5 (the fate of the 12 headless suites) — those suites
already esbuild-bundle the **real** source, so pointing them at the port's copy
is close to a conformance check that already exists.
*Against:* a check that fails is not a fix; someone still has to reconcile, and
a check that fails routinely gets muted. It only guards files on the manifest,
so a new pure module added here is invisible to it until someone remembers to
add it — the same "remember to update the copy" weakness one level up. And a
byte-comparison is too strict the moment the port legitimately needs a
platform-conditional line, while a looser comparison is not really a guard.

**(d) Accept the drift deliberately, with a documented reconciliation cadence.**
No mechanism. Instead, a written rule: the seed set is reconciled at stated
points (e.g. before each port release, or whenever a `core/`-set file changes
here), the reconciliation is recorded, and the two copies are allowed to differ
in between.
*For:* zero infrastructure; honest about what is actually going to happen; keeps
both repos completely independent; costs nothing until it costs something. It
also acknowledges that the two copies may *legitimately* diverge — the port may
need a change this repo does not want.
*Against:* it is the option that most resembles what F-PRESETS-5 and #105
already document as having gone wrong — a documented intention with no automated
guard. Its success depends entirely on someone remembering, at a moment when the
port and the web app are being worked on by different sessions weeks apart. If
chosen, the cadence and the record-keeping need to be as concrete as the
alternatives' tooling, or it degrades into (e) below by default.

**(e) The unstated default: do nothing and let them drift.** Named only so it is
visibly not one of the four. This is what happens if the question is left
unanswered, and it is strictly worse than (d), which at least writes the
intention down.

### 5.3 What answering this needs

The choice interacts with at least two other open items and probably should not
be made in isolation:

- **PORT-AUDIT.md §7 item 5** (fate of the 12 headless suites) — options (a)
  and (c) largely *are* answers to it; options (b) and (d) leave it fully open.
- **PORT-AUDIT.md §8 item 7** — whether the seed set is even a coherent unit on
  the other side is unknown. Building shared-package infrastructure around a
  boundary that turns out to be drawn in the wrong place is expensive to undo;
  there is a reasonable argument for deferring this decision until the port has
  compiled `core/` once and the boundary is empirical rather than predicted.
  **That argument is not a decision either** — deferring is itself (e) unless it
  is written down as (d) with a date.

---

## 6. OPEN — carried forward from PORT-AUDIT.md §7

Every §7 item, with its status. **The analysis is not restated — read the
section named.** Nothing below is decided by this document.

| §7 item | Subject | Status |
|---|---|---|
| **1** | `presets.ts`'s four `DEFAULT_*` value imports, and the ARCHITECTURE.md line calling it portable | **RESOLVED** — issue #101 / PR #104 took option (a): the constants moved to the new pure `src/settings-defaults.ts`; `presets.ts` and `App.tsx` import from there. D119 records the reasoning (including why the settings-*type* interfaces deliberately stayed put) and the re-measured closure. ARCHITECTURE.md's portable-table claim is now true rather than aspirational. **Residual:** issue #105 (open) is the tail of the same problem — `DEFAULT_BUNDLE.bionic` still duplicates `DEFAULT_BIONIC` by value. |
| **2** | Synchronous vs. asynchronous storage | **RESOLVED by this document** — §3. MMKV, synchronous. |
| **3** | `keyboard.ts` / `spaceTogglesFrom` — port, or drop? | **OPEN.** See PORT-AUDIT.md §7 item 3 for the three options. It is closure-clean but models a concept (a focused element with a `tagName` competing for the Space key) with no Android analogue ❓ — a scoping question, not a bug. It is **not** in §4.2's seed list, so no decision is forced to seed `core/`; it becomes forcing only if a keyboard/tablet target enters scope. |
| **4** | The per-tick RN mechanism | **OPEN — and this is the port's central design problem.** See PORT-AUDIT.md §7 item 4 and §4.5. CLAUDE.md §4 already carries it into the port repo marked "UNDECIDED — do not treat this as settled," with the contract any answer must satisfy. PORT-AUDIT.md §4.5 additionally names the two hardest sub-problems: `wordEl(index)` has no RN equivalent and needs an explicit index→handle map with a new invalidation problem, and `getBoundingClientRect` is synchronous on web while RN measurement is not ❓. |
| **5** | What happens to the 12 `.mjs` headless suites | **OPEN.** See PORT-AUDIT.md §7 item 5. Interacts directly with §5 above — options (a) and (c) there largely answer this one. |
| **6** | Hermes verification for the seed set | **OPEN.** See PORT-AUDIT.md §7 item 6 for exactly what is and is not covered. F25 and F41 executed real Hermes binaries for `markdown.ts`'s lookbehinds and `orp.ts`'s `\p{M}`; `\p{L}`/`\p{N}` (`tokenize.ts`, `bionic.ts`) specifically were **not** in that probe ❓. Whether to repeat the binary method across the seed set before scaffolding, or wait for a device once the RN version is pinned, is undecided. |
| **7** | PDF's seam position, and whether PDF is in the first cut | **OPEN.** See PORT-AUDIT.md §5.1 and §7 item 7. D95 put EPUB in the first cut and is silent on PDF. If PDF ships, the `PdfLine[][]`-vs-`Glyph[]` seam choice determines whether `itemsToLines`' clustering and the D100 total-order sort survive or are rewritten. Note `pdfText.ts` is on §4.2's seed list either way — it is pure and useful the moment anything can feed it positioned lines. |
| **8** | `atEnd`/`startedRef` semantics on a touch UI | **OPEN.** See PORT-AUDIT.md §7 item 8. D96 settled "Play stays disabled at end-of-document; ↺ Restart is the explicit gesture" for the web, reasoning partly from browser affordances (a visibly disabled button, a keyboard Space). D96 does not pre-answer it for Android ❓; the port inherits it as a product question. |

---

## 7. What this document deliberately does not do

Stated plainly, in the spirit of PORT-AUDIT.md §8:

1. **It does not begin the port.** No RN scaffold exists, no repository was
   created, no file was copied anywhere, and no source file in this repo was
   modified.
2. **It does not decide anything in §5 or §6.** Options are laid out with
   trade-offs; the choices are Delta's.
3. **It does not verify anything on the target.** Every RN/Hermes statement is
   ❓, inherited from PORT-AUDIT.md's own limits (§0, §8 item 1). This document
   *decides under* that uncertainty; it does not reduce it.
4. **It does not re-measure PORT-AUDIT.md's closures.** The seed list in §4.2 is
   that document's §2 output at commit `d888aa1`, and §3.8/§4.2 both flag that
   it must be re-run at seed time rather than trusted from here.
5. **It does not update ARCHITECTURE.md, PROJECT_CONTEXT.md, DECISIONS.md or
   FINDINGS.md.** §4.3 states what each needs on the *port* side; whether the
   decisions in §2–§4 also warrant a DECISIONS.md entry in *this* repo is a
   separate change on its own branch.
6. **It does not resolve the CLAUDE.md citation discrepancy** flagged in §2.3 —
   it only records it, and states the reasoning without the missing pointer.

---

## Appendix — what was run for this document

| What | Result |
|---|---|
| `git branch --show-current` | `docs/port-plan` ✅ |
| Read PORT-AUDIT.md in full (all sections + both appendices) | ✅ |
| Read CLAUDE.md in full at `21c7235` | ✅ |
| Read ARCHITECTURE.md's Porting notes (lines 527–575) | ✅ |
| `grep` for web-only terms in CLAUDE.md | 1 hit, line 65, the deliberate web-vs-RN contrast — §4.1 point 3 |
| `grep -rni "git state confusion"` over the repo; `git log --all -S "Git state confusion"` | **no match in any file, in any revision** — §2.3's flagged note |
| `gh issue view 105` | read; open, `bug` — cited in §5.1 |
| Source-file census (`find src -name "*.ts" -o -name "*.tsx"`, excluding `.mjs`) | 38 files at `21c7235` (37 at the audit's `d888aa1`, plus `settings-defaults.ts`) — §2.2 |
| `npm run build` | clean — literal output in the PR/handoff summary |
| `git status --porcelain` | `PORT-PLAN.md` untracked, sole entry |

**Not run:** anything on React Native, Hermes, MMKV, or a device. No closure was
re-measured. No headless suite was re-run — this change touches no source file,
so there was nothing for them to exercise.
