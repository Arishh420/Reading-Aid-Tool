# DOC-AUDIT-V1 — Entry-by-entry audit of the live DECISIONS.md and FINDINGS.md

## 1. Header — ground truth

- **Repo HEAD:** `d9b23dbe4d22a2f93cb0e32c857704eaa7ed0721` — 2026-07-30 12:45:03 -0400
  (the issue-#79 freeze commit itself; archives frozen at `4df4888`, matching both
  files' pointer notes and `git log`).
- **Line counts:** DECISIONS.md **1,914**; FINDINGS.md **2,216**.
- **ID ranges actually found:** DECISIONS **D1–D115** (115 entries, contiguous, no
  duplicates — every `**Dn ·**` header counted once). FINDINGS **F1–F40** (40
  entries) **plus F-PRESETS-1..5** (5 entries) = **45** entries.
- **Scope:** live files only. `DECISIONS-archive-v1.md` / `FINDINGS-archive-v1.md`
  are immutable and were not audited, per instruction.
- **Method:** both logs read end to end; every mechanical claim that could be
  checked from this environment was spot-verified against `src/` at HEAD
  (file:line cited in rationales where a check was run). Claims that require a
  browser, a device, or GitHub-side data are marked uncertain rather than guessed.

### Verdict legend
- **KEEP-ACTIVE** — still load-bearing; stays in the live file as-is.
- **SHARPEN** — sound but verbose; stays, tightened; the rationale says what to cut.
- **CONSOLIDATE** — overlaps other entries; the group in §4 names the survivor.
- **ARCHIVE** — no longer load-bearing live; a one-line stub points at the frozen
  archive (the ID never disappears — no silent holes, citations keep resolving).

### Port-tag legend
- **PORTABLE** — constrains logic that ships to the React Native `core/` seed.
- **WEB-ONLY** — DOM, CSS, virtualization, browser-specific.
- **PROCESS** — working agreement, tooling, methodology.
- **GENERAL** — a principle that would apply to any project (gathered in §9).

Verdict counts — DECISIONS: 104 KEEP-ACTIVE, 7 SHARPEN, 2 CONSOLIDATE, 2 ARCHIVE.
FINDINGS: 44 KEEP-ACTIVE, 1 SHARPEN, 0 CONSOLIDATE, 0 ARCHIVE.

---

## 2. DECISIONS.md — verdicts

| ID | Verdict | Port tag | Rationale |
|---|---|---|---|
| D1 | KEEP-ACTIVE | PROCESS | Foundational typing rationale, still the stated basis of the port contract; three lines, nothing to cut. |
| D2 | SHARPEN | PROCESS | Keep the 2026-07-08 correction (position persistence shipped in #6/D67–D76; settings auto-persistence still deferred — still true); cut the original M5 deferral prose, readable in the archive. |
| D3 | ARCHIVE | PROCESS | One-time scaffold choice with no forward constraint on any live code; stub → archive. |
| D4 | KEEP-ACTIVE | PORTABLE | Zero-dep parser rationale governs `markdown.ts`, which ships verbatim to the port. |
| D5 | KEEP-ACTIVE | PORTABLE | The heading\|paragraph collapse is live parser behavior the port inherits. |
| D6 | KEEP-ACTIVE | PORTABLE | Strip-inline-to-plain-text contract is live (D91 refined the how, not the what). |
| D7 | KEEP-ACTIVE | WEB-ONLY | `data-word-id` spans are still the imperative hook (`Reader.tsx:87`); refinement pointer to D19/D21 already in place. |
| D8 | KEEP-ACTIVE | PORTABLE | Three-slot lead/head/tail split verified live in `bionic.ts`. |
| D9 | KEEP-ACTIVE | PORTABLE | Letters-only `L` is live bionic behavior. |
| D10 | KEEP-ACTIVE | PORTABLE | Default-on/Medium ships as a default value in the bundle. |
| D11 | KEEP-ACTIVE | GENERAL | Distinct logic/view filenames dodge case-insensitive-FS and Metro case-sensitivity — a naming rule for any cross-platform repo (empirical twin: F9). |
| D12 | KEEP-ACTIVE | WEB-ONLY | `data-theme` mechanism verified (`ui/theme.ts`); the token *values* port per ARCHITECTURE, the mechanism doesn't. |
| D13 | KEEP-ACTIVE | PORTABLE | Core invariant #1; cited by CLAUDE.md §4 and ARCHITECTURE — carries to the port verbatim. |
| D14 | KEEP-ACTIVE | PORTABLE | rAF + time-accumulator is `usePacer`'s live clock design. |
| D15 | KEEP-ACTIVE | WEB-ONLY | Translucency-so-bionic-stays-legible is a live rendering constraint; short. |
| D16 | KEEP-ACTIVE | PORTABLE | Seek-snaps-to-word-like is live pacer logic. |
| D17 | KEEP-ACTIVE | PORTABLE | Defaults verified (`App.tsx:65`, WPM 300; lead 1). |
| D18 | KEEP-ACTIVE | WEB-ONLY | Dep choice explains the web virtualizer; RN swaps to FlatList (F1 carries the caveat). |
| D19 | KEEP-ACTIVE | PORTABLE | Core invariant #2 (imperative hot path); the principle ships even though the DOM mechanism is rewritten. |
| D20 | KEEP-ACTIVE | WEB-ONLY | Block-level (not word-level) virtualization; the FlatList analogue is noted in F1. |
| D21 | KEEP-ACTIVE | WEB-ONLY | Single gliding overlay is the live highlight mechanism. |
| D22 | KEEP-ACTIVE | WEB-ONLY | Fixed-height `100dvh` pane verified (`index.css:72`). |
| D23 | KEEP-ACTIVE | PORTABLE | ≤1 word/frame clamp is live clock logic (empirical twin: F2). |
| D24 | KEEP-ACTIVE | WEB-ONLY | 40% band verified (`scrollHelpers.ts:8`, `READING_BAND = 0.4`). |
| D25 | KEEP-ACTIVE | WEB-ONLY | Live class-reapply trigger; the D85 supersession is annotated in place (and its D77→D85 miscite already corrected via the appendix); ARCHITECTURE cites it. |
| D26 | KEEP-ACTIVE | PORTABLE | Dwell-in-the-clock is live (`dwell.ts` ships; empirical twin F5). |
| D27 | KEEP-ACTIVE | PORTABLE | Toggle + default-on ship in settings/bundles. |
| D28 | KEEP-ACTIVE | PORTABLE | Left-of-centre ORP is a design constraint the port inherits; grid verified (`index.css:686`, `2fr auto 3fr`). |
| D29 | KEEP-ACTIVE | PORTABLE | Monospace is a hard port requirement (F3's algebra). |
| D30 | KEEP-ACTIVE | PORTABLE | Chunk-size-fixed-at-1 RSVP is live semantics. |
| D31 | KEEP-ACTIVE | WEB-ONLY | Depleting-tick cue live in `Rsvp.tsx`; the principle (perceptible dwell, anchor untouched) carries. |
| D32 | KEEP-ACTIVE | PORTABLE | Chunk stepping with `threshold ×= N` is live `usePacer` logic. |
| D33 | KEEP-ACTIVE | GENERAL | Docs-as-done working agreement — the seed principle for every future repo's doc set. |
| D34 | KEEP-ACTIVE | PORTABLE | Pure-cleanup/thin-wrapper split is the exact architecture the `core/` seed is built from. |
| D35 | KEEP-ACTIVE | PORTABLE | String-scanning-not-DOMParser *is* the portability decision; live in `epubStructure.ts`. |
| D36 | KEEP-ACTIVE | WEB-ONLY | Dynamic-import code-split is Vite-specific (twin F8); RN bundling differs. |
| D37 | KEEP-ACTIVE | PORTABLE | Text-volume scanned check verified (`pdf.ts:112–114`, `max(16, pages*2)`); the rule carries to the RN PDF path. |
| D38 | KEEP-ACTIVE | WEB-ONLY | Untouched-dropdown case still accurate; the D97 supersession is annotated in place. |
| D39 | KEEP-ACTIVE | WEB-ONLY | CSS-vars + `layoutKey` is the live typography plumbing. |
| D40 | KEEP-ACTIVE | WEB-ONLY | Arrows/Home half still accurate (`App.tsx:159`); the Space half is superseded by D86→D89 with **no marker on D40** — see Drift §5.1 / Supersession §6.1; fix is an annotation, not removal. |
| D41 | KEEP-ACTIVE | PORTABLE | Zero-block-parse-is-an-error is a parser contract the port keeps. |
| D42 | KEEP-ACTIVE | WEB-ONLY | Strip-as-independent-subscriber; the portable half of the principle is carried by F12. |
| D43 | SHARPEN | WEB-ONLY | Keep the anchor-untouched guarantee; cut the superseded `top:68%` mechanism (already annotated; verbatim in the archive). |
| D44 | KEEP-ACTIVE | WEB-ONLY | Peripheral-not-readable strip styling rationale still governs (and should govern the RN strip). |
| D45 | SHARPEN | WEB-ONLY | Keep "Show context" default-on + RSVP-only-by-construction; cut the superseded clamp/page-flip scroll model (D47 annotation already present). |
| D46 | KEEP-ACTIVE | PORTABLE | Records the reversed hot-path rationale and the shared-module import — verified live (`Reader.tsx:13`). |
| D47 | KEEP-ACTIVE | WEB-ONLY | Pinned-line continuous scroll is the live strip mechanism (F13 carries the port-facing principle). |
| D48 | CONSOLIDATE | PORTABLE | Merge into **D50** (survivor): fold the odd-values-guarantee and the `contextLines`-in-`RsvpSettings` storage shape into D50; the range/default here is fully superseded. |
| D49 | KEEP-ACTIVE | WEB-ONLY | Flex-column + em-gap verified (`index.css:674`, `gap: 1.8em`); the scaling algebra is the value — keeps its own words. |
| D50 | KEEP-ACTIVE | PORTABLE | Live values verified (3/5 options in `ModeSettings.tsx`, default 3 in `Rsvp.tsx:38`); survivor of the D48 merge; the setting ships in preset bundles. |
| D51 | KEEP-ACTIVE | WEB-ONLY | Formula verified (`index.css:762`, `max(0.6rem, 0.32em)`). |
| D52 | KEEP-ACTIVE | WEB-ONLY | Length line-height / line-snap / zero-height separator all live (`--rc-line`, `index.css:756`); the D53 gotcha note is already in place. |
| D53 | KEEP-ACTIVE | WEB-ONLY | Rect-based, offsetParent-independent centering is the live fix; F15 carries the general lesson. |
| D54 | KEEP-ACTIVE | WEB-ONLY | Color + underline marker verified (`index.css:833`). |
| D55 | KEEP-ACTIVE | PORTABLE | Monotonic `buildBlockStarts` is live in `model/blocks.ts`, which ships (empirical twin F16); completion note verified. |
| D56 | KEEP-ACTIVE | PORTABLE | Memoized-pacer-identity design is the base D102/F35 build on; unchanged and live. |
| D57 | KEEP-ACTIVE | WEB-ONLY | Delegated click-to-seek verified (`RsvpContextStrip.tsx:184`); a11y note still accurate (strip stays `aria-hidden`). |
| D58 | KEEP-ACTIVE | WEB-ONLY | `showBionic` gate verified (`Settings.tsx:64`); survivor of the D59 merge. |
| D59 | CONSOLIDATE | WEB-ONLY | Merge into **D58** (survivor): identical `showX`-gate pattern; carry D59's hide-vs-unify reasoning (two font sizes, two purposes) into D58 verbatim. |
| D60 | KEEP-ACTIVE | PORTABLE | `ENDS_SOFT_HYPHEN`/`ENDS_DASH` split with distinct joins is live `pdfText.ts` behavior. |
| D61 | KEEP-ACTIVE | PORTABLE | The rejected uppercase-after-dash heuristic is on record precisely so the port doesn't relitigate it. |
| D62 | KEEP-ACTIVE | PORTABLE | `safeDecodeHref` + the decode-in-the-structure-layer rationale is live `epubStructure.ts` behavior. |
| D63 | KEEP-ACTIVE | PORTABLE | Warn-not-silent contract; its message shape is deliberately mirrored by D93/D94 — load-bearing as the template. |
| D64 | KEEP-ACTIVE | PROCESS | Live scope deferral while #26 remains open. **Uncertain:** #26's open/closed status is not verifiable from this environment; if it has shipped, re-verdict D64 to ARCHIVE in the execution pass. |
| D65 | KEEP-ACTIVE | PORTABLE | Range guard + raw-text fallback choice is live (empirical twin F17). |
| D66 | KEEP-ACTIVE | WEB-ONLY | `try/finally` + `loadingTask.destroy()` is the live pdf.js wrapper behavior (twin F18). |
| D67 | KEEP-ACTIVE | PORTABLE | Sampling scheme verified (`parsers/index.ts`: 32 KB × 3 + 8-byte size, 96 KB threshold); schema and logic port, crypto impl swaps. |
| D68 | KEEP-ACTIVE | PORTABLE | Prefix verified (`storage.ts:14`); the key schema carries to AsyncStorage/MMKV unchanged. |
| D69 | KEEP-ACTIVE | PORTABLE | `latest` + gated `history` two-layer model is the live `readingPosition.ts` schema. |
| D70 | KEEP-ACTIVE | WEB-ONLY | Interstitial-over-modal rationale still governs the resume UI (and should inform the RN one). |
| D71 | KEEP-ACTIVE | WEB-ONLY | Phase enum is the live App state shape. |
| D72 | KEEP-ACTIVE | WEB-ONLY | The direct-seek timing argument documents why no deferred ref exists — short, keeps future readers from re-adding one. |
| D73 | KEEP-ACTIVE | WEB-ONLY | Triggers verified (`App.tsx:199–207`: 30 s interval, visibilitychange, pagehide); RN swaps to AppState — the reasoning carries. |
| D74 | KEEP-ACTIVE | PORTABLE | The position-0 save guard and its mirrored load check are live persistence logic. |
| D75 | KEEP-ACTIVE | PORTABLE | 2% gate verified (`readingPosition.ts:78`); the two-thresholds-two-purposes reasoning is the value. |
| D76 | KEEP-ACTIVE | PORTABLE | `__builtin_sample__` sentinel fingerprint is live. |
| D77 | KEEP-ACTIVE | PORTABLE | Built-ins-in-code vs user-presets-in-storage verified (`presets.ts` via the storage wrapper); ARCHITECTURE cites it. |
| D78 | KEEP-ACTIVE | PORTABLE | Atomic 13-field bundle verified (`bundlesEqual` compares exactly 13); the React-18 batching claim is correctly tracked as ❓ in F-PRESETS-2, not asserted. |
| D79 | KEEP-ACTIVE | PORTABLE | Derived `isModified` via `lastAppliedBundle` ref is live design; no setter threading exists. |
| D80 | KEEP-ACTIVE | PORTABLE | Never-auto-overwrite save-as is live CRUD semantics. |
| D81 | KEEP-ACTIVE | PORTABLE | Its intent is now *enforced* in code by D103/F-PRESETS-5 — keep as the governing statement they point back to. |
| D82 | KEEP-ACTIVE | PORTABLE | The copy-vs-setting boundary prevents the port inventing phantom settings. |
| D83 | KEEP-ACTIVE | PORTABLE | Group inference from `bundle.mode` verified (`presets.ts:250`). |
| D84 | KEEP-ACTIVE | WEB-ONLY | Placement rationale (inline block in `app-top`, no z-index) still matches the rendered layout. |
| D85 | KEEP-ACTIVE | WEB-ONLY | Class-only vs scroll-owning split verified live (`updateLeadClasses`/`updateChunkClasses` are `onRangeChange`'s entire body); ARCHITECTURE cites it. |
| D86 | ARCHIVE | WEB-ONLY | Fully superseded by D89 and already marked as such; nothing in it shipped. Stub → archive; the stub keeps the ID resolvable for ARCHITECTURE's historical "D86, then corrected by D89" references — see the ARCHITECTURE note in §4. |
| D87 | KEEP-ACTIVE | WEB-ONLY | The `max-height` collapse mechanism (height-only, never width; flex-grow glide) is live; the D89 ceiling correction is annotated in place. |
| D88 | SHARPEN | WEB-ONLY | Keep the stays-mounted / hoisted-`pctRef` / scrubber-and-Word-field-dropped decisions; cut the reversed compact-WPM-slider paragraph (D89 annotation present; archive holds the full text). |
| D89 | SHARPEN | PORTABLE | Keep everything that shipped (default-to-toggle yield set, 40rem/4rem ceilings, `:disabled` rule, compact WPM number box, floor 50 + the why-not-0 divergence argument); cut the bug-diagnosis chronology that F23 records nearly verbatim. The predicate half ships (`keyboard.ts` is in ARCHITECTURE's portable table). |
| D90 | KEEP-ACTIVE | PORTABLE | The CommonMark starts-at-1 interrupt rule is live `markdown.ts` behavior. |
| D91 | KEEP-ACTIVE | PORTABLE | NUL-placeholder escapes + per-delimiter flanking is live; F25 retired the Hermes-compatibility risk. |
| D92 | KEEP-ACTIVE | PORTABLE | Silent percent-fallback verified (`App.tsx:263–268`), with F36's per-snapshot refinement layered on top — both live. |
| D93 | KEEP-ACTIVE | PORTABLE | `(?:^\|[\s"'])` boundary + mirrored manifest-miss warn is live `epubStructure.ts` behavior. |
| D94 | KEEP-ACTIVE | PORTABLE | Whole-chapter-zero fallback gating, plus the flagged partial-loss gap (F29), is live and honestly scoped. |
| D95 | KEEP-ACTIVE | PROCESS | Port-scope decision (EPUB in the first Android cut) is still ahead of us; D96 resolution note already in place. |
| D96 | KEEP-ACTIVE | PORTABLE | No-auto-restart-at-end is shipped pacer semantics the port inherits (guards verified in `usePacer.ts`). |
| D97 | KEEP-ACTIVE | WEB-ONLY | `userSetFormat` verified (`FileInput.tsx:45,49`); the D38↔D97 supersession is annotated in both directions. |
| D98 | KEEP-ACTIVE | PORTABLE | Indent cue + unconditional page-boundary break verified (`pdfText.ts:48,113`); ARCHITECTURE cites it. |
| D99 | KEEP-ACTIVE | PORTABLE | `splitOversizedParagraphs` hard-split net is live; the 300-word sizing argument is the value. |
| D100 | KEEP-ACTIVE | PORTABLE | Total-order comparator verified (`pdf.ts:50`); constrains the shipped pre-sort; the transitivity lesson generalizes but the entry's job is this code. |
| D101 | KEEP-ACTIVE | PORTABLE | Continuation rule + `forcedParagraphAt` is live; the hand-trace of why the naive fix re-swallows the line is load-bearing. |
| D102 | KEEP-ACTIVE | PORTABLE | Dependency-array discipline applies unchanged in RN React; the per-site audit record is the value. |
| D103 | KEEP-ACTIVE | PORTABLE | Explicit `rsvp` overrides verified (7× `showContext: false` in `presets.ts` — six non-RSVP built-ins + Afterburner's own meaningful false). |
| D104 | SHARPEN | PROCESS | Keep the stub design and the two still-mirrored pieces with their concrete reasons; cut the task-negotiation narration ("offered as optional in the task…"). |
| D105 | SHARPEN | PORTABLE | Keep the NFC-vs-`Intl.Segmenter` reasoning including the anchor/length-semantics ripple and the recorded residual gap; cut the task-direction quoting. |
| D106 | KEEP-ACTIVE | PORTABLE | Dash-split rules verified (`tokenize.ts:29,40`: em/en only, left-attach, digit-flank guard); ARCHITECTURE cites it. |
| D107 | KEEP-ACTIVE | PORTABLE | `spaceBefore` verified at both join sites (`Reader.tsx:87`, `RsvpContextStrip.tsx:212`); pure data on `Word`, ports verbatim. |
| D108 | KEEP-ACTIVE | PORTABLE | MAX dwell roll-up verified (`dwell.ts:82`); block-last priority preserved. |
| D109 | KEEP-ACTIVE | PORTABLE | Known-accepted gaps (`--` not split; standalone tokens invisible in RSVP) on record — prevents re-fixing as bugs. |
| D110 | KEEP-ACTIVE | PORTABLE | No-cap mirrored nesting is live `delimiterSpans.ts` semantics. |
| D111 | KEEP-ACTIVE | PORTABLE | Single-quote exclusion + the apostrophe-collision argument is live and is the feature's most re-askable question. |
| D112 | KEEP-ACTIVE | PORTABLE | Per-block stack reset (blast-radius trade) is live. |
| D113 | KEEP-ACTIVE | PORTABLE | Parallel-array-not-`Word`-field keeps the flat-index invariant provably undisturbed — the exact argument the port needs. |
| D114 | KEEP-ACTIVE | PORTABLE | Three-arg pure helper verified (`dwell.ts:39`); the signature-deviation record prevents an acceptance-vs-code mismatch misread later. |
| D115 | KEEP-ACTIVE | GENERAL | Freeze-before-sharpen + archive-by-reference + no-header-so-byte-identity-stays-checkable — the forward principle for every future doc set, the port's included. |

---

## 3. FINDINGS.md — verdicts

| ID | Verdict | Port tag | Rationale |
|---|---|---|---|
| F1 | KEEP-ACTIVE | PORTABLE | The two-independent-fixes perf cliff + the FlatList still-needs-imperative-highlight caveat is the port's #1 constraint (CLAUDE.md and ARCHITECTURE cite it). |
| F2 | KEEP-ACTIVE | PORTABLE | Clamp-vs-catch-up semantics ship with the clock; explains a symptom that would otherwise be misdiagnosed as a tokenizer bug. |
| F3 | KEEP-ACTIVE | PORTABLE | The monospace-required algebra (drift = `0.1·Δwidth`) is a hard port constraint; the centred-grid subtlety is the non-obvious part. |
| F4 | KEEP-ACTIVE | PORTABLE | Left-of-centre AND pinned as load-bearing (not stylistic) underpins D28/D29; honestly tagged 📐 with no stronger backing — leave the tag as is. |
| F5 | KEEP-ACTIVE | PORTABLE | Dwell-in-the-clock inheritance is why `dwell.ts` ships once instead of three times. |
| F6 | KEEP-ACTIVE | PORTABLE | The PDF best-effort boundary list (columns/tables/footnotes/drop-caps; ≥50% header rule; text-volume scanned check; no headings) is exactly what the RN PDF path inherits. |
| F7 | KEEP-ACTIVE | PORTABLE | EPUB scope and limits (captured tags, DRM, real-world-variety ❓) carry unchanged. |
| F8 | KEEP-ACTIVE | WEB-ONLY | Bundle-size numbers are Vite-specific; the lazy-load principle informs but does not bind RN. |
| F9 | KEEP-ACTIVE | GENERAL | Case-insensitive-FS collision is an any-repo footgun; Metro's case-sensitivity makes it a cross-platform one (decision twin: D11). |
| F10 | KEEP-ACTIVE | PROCESS | The built/not-built spec ledger stops the port from assuming unbuilt settings exist. |
| F11 | KEEP-ACTIVE | GENERAL | "No drift" = a careful reader found none, not proven consistent — the epistemics rule this very audit operates under. |
| F12 | KEEP-ACTIVE | PORTABLE | Paragraph-is-the-render-unit / word-is-the-imperative-unit is the strip's explicit port rule. |
| F13 | KEEP-ACTIVE | PORTABLE | Pin-the-fixation-line, scroll-the-text-under-it carries as the RN strip design (explicit port note). |
| F14 | KEEP-ACTIVE | GENERAL | A fixed % can't track em-scaled quantities; stack + em-gap + snap-to-the-line-grid + line-height-as-length — layout lessons for any project. |
| F15 | KEEP-ACTIVE | WEB-ONLY | The offsetParent trap and the rect-based cure are DOM-specific; the measure-robustly / reason-about-the-whole-flow moral is noted in §9's honourable mentions. |
| F16 | KEEP-ACTIVE | PORTABLE | In-range sentinel encoding ships with `blocks.ts`; the completion note (Reader imports the shared module) verified live. |
| F17 | KEEP-ACTIVE | PORTABLE | `String.fromCodePoint` ceiling + surrogate pass-through is live parser knowledge (decision twin: D65). |
| F18 | KEEP-ACTIVE | WEB-ONLY | pdfjs-dist v6 `destroy()` API facts; the rejected-load sub-question remains genuinely open (**uncertain** — needs a browser, unverifiable here; the entry already says so). |
| F19 | KEEP-ACTIVE | WEB-ONLY | Virtualizer-remount class loss and the `items`-driven re-apply is live Reader behavior. |
| F20 | KEEP-ACTIVE | PORTABLE | The ten persistence invariants still hold (suite since grown to 15, growth cross-referenced in its own header); **relocate** per Structure note S1. |
| F21 | KEEP-ACTIVE | WEB-ONLY | The scroll-ownership split record (manual scroll must never reach the auto-center); ARCHITECTURE cites it. |
| F22 | SHARPEN | GENERAL | Keep the methodology vindication (the ❓ tags refused unearned confidence and were vindicated; a green suite only proves what it exercises) and the still-open ❓ tail; cut the four-bug "confirmed broken" list that duplicates F23's diagnoses. |
| F23 | KEEP-ACTIVE | WEB-ONLY | Root-cause records for the shipped predicate/HUD/`:disabled` fixes; both D96 resolution annotations already in place. |
| F24 | KEEP-ACTIVE | PORTABLE | Real-bundled-parser verification record for D90/D91; the real-file caveat is honest and still true. |
| F25 | KEEP-ACTIVE | PORTABLE | Hermes lookbehind proven empirically across two real binaries — a port-blocking risk retired; the transcript *is* the evidence, keep it whole. |
| F26 | KEEP-ACTIVE | PORTABLE | The drift→percent mapping record is live; needs a one-line forward pointer to F36/D104 (see Drift §5.2 / Supersession §6.2 — its "14 checks total" is stale). |
| F27 | KEEP-ACTIVE | PORTABLE | `attr()` boundary verification record, including the capture-group-index regression check. |
| F28 | KEEP-ACTIVE | PORTABLE | Same-root-cause-recurring-at-a-second-call-site record — the recurrence pattern is the lesson. |
| F29 | KEEP-ACTIVE | PORTABLE | Fallback verification plus the asserted-unchanged partial-loss gap keeps the known hole on record, not implied fixed. |
| F30 | KEEP-ACTIVE | PORTABLE | The chunk `atEnd` trace and single-source-of-truth `atEndRef` is live `usePacer` design; honestly 📐, no test runner exists. |
| F31 | KEEP-ACTIVE | PORTABLE | `startedRef` verified live (`usePacer.ts:99,190`); the never-started vs reached-end distinction ships with the clock. |
| F32 | KEEP-ACTIVE | PORTABLE | #9 repro + both-fix verification against the real bundled `pdfText.ts`; ARCHITECTURE cites it. |
| F33 | KEEP-ACTIVE | PORTABLE | The proof-vs-regression-guard distinction for D100, including the honestly-reported failed search for realistic corruption — an overclaim-prevention exemplar. |
| F34 | KEEP-ACTIVE | PORTABLE | Three-parser spine-integrity record with contiguity checks through the real `tokenize`/`reindexWords` wiring. |
| F35 | KEEP-ACTIVE | PORTABLE | Identity-churn record; React-dependency discipline applies identically in RN. |
| F36 | KEEP-ACTIVE | PORTABLE | Per-snapshot `wordCount` verified live (`readingPosition.ts:36,71`; `App.tsx:263`); **relocate** per Structure note S2. |
| F37 | KEEP-ACTIVE | PORTABLE | NFC fix verified (`orp.ts:39`); the non-precomposable residual gap is on record; **relocate** per Structure note S2. |
| F38 | KEEP-ACTIVE | PORTABLE | Dash-split + dwell-rollup verification record; ARCHITECTURE cites it. |
| F39 | KEEP-ACTIVE | PORTABLE | Delimiter-span verification including the by-construction-guard-not-anchor-verification caveat — exactly the honesty the port needs; ARCHITECTURE cites it. |
| F40 | KEEP-ACTIVE | PORTABLE | `dwellMultiplier` verification record; the pure-refactor-≠-rendered-cue-proof caveat matches the file's established practice. |
| F-PRESETS-1 | KEEP-ACTIVE | PORTABLE | Inert-in-chunk fact still true (strip rendered only in RSVP); **renumber → F41** (§7). |
| F-PRESETS-2 | KEEP-ACTIVE | PORTABLE | React-18 batching still ❓/Assumed; the top-of-file index correctly surfaces it; port team must re-verify on their RN version; **renumber → F42**. |
| F-PRESETS-3 | KEEP-ACTIVE | PORTABLE | 13-field exhaustiveness verified against code (`bundlesEqual` compares exactly 13); **renumber → F43**. |
| F-PRESETS-4 | KEEP-ACTIVE | PORTABLE | Baseline 11-check suite record; its browser-test tail is still open (per the index); **renumber → F44**. |
| F-PRESETS-5 | KEEP-ACTIVE | PORTABLE | D103 verification; carries the hand-copied-suite caveat — the presets suite is the one suite NOT importing the real module (already a logged backlog item); **renumber → F45**. |

---

## 4. CONSOLIDATE groups, spelled out

1. **D48 + D50 → D50 survives.** D50 already holds the live range/default (3/5,
   default 3 — verified in code). Fold in from D48, verbatim: the odd-values
   guarantee ("odd values guarantee a centered line with equal context
   above/below") and the storage shape ("stored as `contextLines` in
   `RsvpSettings`, spread on update; box height and buffered window adapt live;
   shown only when Show context is on"). D48 then contains nothing unique and is
   removed; its ID becomes a numbering gap (correct — monotonic ≠ contiguous).
2. **D59 + D58 → D58 survives.** Identical `showX`-gate pattern
   (`mode !== 'rsvp'`), state untouched, returns on mode switch. Fold in from
   D59, verbatim: the Text-size case and the hide-vs-unify reasoning (two
   ranges, two purposes; unifying would merge `ReaderDisplay.fontSize` with
   `RsvpSettings.fontSize`) and the line-width-stays note. D59's ID becomes a gap.

**ARCHITECTURE.md changes required by ARCHIVE/CONSOLIDATE verdicts:** none are
strictly forced. ARCHITECTURE cites D86 only as superseded history ("D86, then
corrected by D89"), and the ARCHIVE verdict leaves a one-line D86 stub in the
live file, so the citation keeps resolving. D48/D59 are not cited by
ARCHITECTURE. If the execution pass prefers ARCHITECTURE to cite only live
prose, the two D86 reference clusters (ARCHITECTURE.md ~lines 463–489 and
608–628) can optionally append "(archived)" — cosmetic, not required.

---

## 5. Drift — entries contradicting the current code

Every mechanical claim that could be checked from this environment was checked
against `src/` at HEAD `d9b23db`. Result: **live-log drift is confined to two
items, both already corrected elsewhere in the logs but unannotated at the
stale site.** The real drift concentration is README.md (§8).

1. **D40 (partial — the Space clause).** D40 states Space yields for any focused
   `input`/`select`/`textarea`/`button`. Current code: Space **defaults to
   toggle** and yields only for a narrow enumerated set — the marked Play/Pause
   button, `TEXTAREA`, and `text`/`checkbox`/`radio`/`file` inputs
   (`src/pacer/keyboard.ts:36–59`), consulted before the blanket guard
   (`src/App.tsx:151`). The arrows/Home clause of D40 remains correct
   (`src/App.tsx:159`). The correction exists in-log (D89) but D40 carries no
   marker — fix is an annotation on D40, not deletion (D40 stays for its
   still-true half; ARCHITECTURE cites it).
2. **F26 (minor — stale suite description).** "the suite is now 14 checks
   total" — `src/storage/headless-test.mjs` is now **15** (F36 and F40 both
   record 15/15), and tests 1–4/10 no longer hand-mirror the logic (converted
   to the real module by D104/F36). Fix: a one-line pointer on F26 to F36/D104.
3. **No other live-log statement was found to contradict the code.** Claims
   verified, with locations: `WPM_MIN = 50` (`PacerControls.tsx:25`); Space
   predicate design (`keyboard.ts`); arrows blanket guard (`App.tsx:159`);
   `buildBlockStarts`/`blockIndexForWord` imported by Reader (`Reader.tsx:13`);
   dash split + `spaceBefore` (`tokenize.ts:29,40,81`; `Reader.tsx:87`;
   `RsvpContextStrip.tsx:212`); dwell roll-up + `dwellMultiplier`
   (`dwell.ts:39,82`); NFC (`orp.ts:39`); `computeDelimiterSpans`
   (`delimiterSpans.ts:112`; `Rsvp.tsx:3,71,101`); PDF total-order comparator
   (`pdf.ts:50`) and per-row x re-sort (`pdf.ts:59`); indent/page-boundary cues
   + `isEdge` gating (`pdfText.ts:30,34,48,89–113`); scanned check
   (`pdf.ts:112–114`); fingerprint sampling (`parsers/index.ts`); storage
   prefix (`storage.ts:14`); 2% gate + history cap (`readingPosition.ts:78–79`);
   per-snapshot `wordCount` (`readingPosition.ts:36,71`); drift fallback
   (`App.tsx:263–268`); save triggers (`App.tsx:199–207`); `startedRef`/`atEnd`
   guards (`usePacer.ts:93–208`); `userSetFormat` (`FileInput.tsx:45,49`);
   `showBionic`/`showTextSize` gates (`Settings.tsx:64,104`); preset groups,
   label "Accessibility", group inference, 7× `showContext:false`, 13-field
   `bundlesEqual` (`presets.ts`, `PresetsPanel.tsx:10–16`); RSVP grid
   (`index.css:686`), flex gap 1.8em (`:674`), context font formula (`:762`),
   `--rc-line` (`:756`), underline marker (`:833`), `100dvh` (`:72`);
   `READING_BAND = 0.4` (`scrollHelpers.ts:8`); strip click-to-seek delegation
   (`RsvpContextStrip.tsx:184`); class-only `onRangeChange` helpers
   (`FlowingHighlight.tsx:66`, `ChunkHighlight.tsx:57`).

**Structure notes (file-order problems, not code contradictions):**
- **S1.** F20 sits at line ~1935, between the Change log and the Presets
  section — stranded outside any topical section, not between F19 and F21.
  Recommend a sanctioned relocation to the Post-V1/persistence area (precedent:
  the D33 relocation recorded in DECISIONS' appendix as the single sanctioned
  reorder; do the same here, recorded in FINDINGS' change log).
- **S2.** F36/F37 (dated 2026-07-14) physically follow F38–F40 (2026-07-16 /
  07-30) *and* follow the Change log — the Change log is no longer the file's
  footer. Recommend moving the Change log to the end of the file (or F36/F37
  above it) in the same relocation pass.

---

## 6. Unmarked supersessions

1. **D40 ← narrowed by D86, corrected by D89 — no marker on D40.** (Known item
   1, confirmed.) D86's headline says "annotates/narrows D40" and D89's says it
   supersedes D86, but D40 itself reads as fully current. Required annotation on
   D40: *"Space routing superseded — narrowed by D86, redesigned by D89
   (default-to-toggle, enumerated yield set). The arrows/Home yield described
   here is unchanged and still shipped."*
2. **F26 ← extended and partially outdated by F36 + D104 — no forward pointer
   on F26.** The suite F26 describes was converted from hand-mirrored logic to
   real-module imports for tests 1–4/10 and grew to 15 checks; F26's
   methodology description and count read as current but aren't. One-line
   pointer suffices.
3. **Checked and clean.** Every other supersession in the web is annotated at
   the superseded site: D25←D85, D38↔D97, D43←D49, D45←D47, D48←D50, D52←D53
   (gotcha note), D86←D89, D87←D89 (ceilings), D88←D89 (WPM control), D95→D96,
   F22→F23 (revision note), F23/F31→D96 (resolution notes), F20→F26 (growth
   note), D2 (in-place correction).

---

## 7. Citations

**Broken citations: none found.** Every `D`/`F` ID referenced in the live
DECISIONS.md, FINDINGS.md, ARCHITECTURE.md, PROJECT_CONTEXT.md, CLAUDE.md, and
README.md resolves to an existing entry (D1–D115, F1–F40, F-PRESETS-1..5). The
only out-of-range token a scan surfaces is "D800" — the Unicode surrogate
`0xD800` in D65/F17, not a citation. The one historical miscitation on record
(D25 citing "D77" instead of D85) was already corrected via the DECISIONS
appendix note (2026-07-08); the live D25 text cites D85 correctly.

**ARCHITECTURE.md citation inventory** (these entries cannot be ARCHIVEd
without a listed ARCHITECTURE change; all are KEEP/SHARPEN in this audit except
D86, whose stub preserves resolvability — see §4): D13, D25, D40, D77, D86–D92,
D98, D99, D106–D108, D110–D113; F1, F21, F22, F23, F24, F26, F32, F38, F39.
Also cited elsewhere: CLAUDE.md → F1, F16; PROJECT_CONTEXT.md → D1, D2, D12,
D18, D24, D67, D76, D89, D90, D91, D95, F22, F23, F24.

**F-PRESETS references needing update when renumbering to F41–F45**
(F-PRESETS-1→F41, -2→F42, -3→F43, -4→F44, -5→F45 — assigned in existing order;
the next free numbers are the only assignment that doesn't collide with an
existing ID):

Every reference outside the frozen archives lives inside FINDINGS.md itself —
none exist in `src/`, ARCHITECTURE.md, PROJECT_CONTEXT.md, CLAUDE.md, or
README.md (verified by repo-wide grep):

| FINDINGS.md line | Reference | Context |
|---|---|---|
| 43 | F-PRESETS-2 | "Open / needs browser verification" index |
| 55 | F-PRESETS-4 | same index, browser-test-tails bullet |
| 1877 | F-PRESETS-5 | Change log entry |
| 1963 | F-PRESETS-1 | entry header |
| 1971 | F-PRESETS-2 | entry header |
| 1980 | F-PRESETS-3 | entry header |
| 1988 | F-PRESETS-4 | entry header |
| 2008 | F-PRESETS-5 | entry header |
| 2032 | F-PRESETS-4 | cross-reference inside F-PRESETS-5's caveat |

Constraints and caveats for the execution pass:
- The frozen archives contain F-PRESETS text and **must not be touched**; a
  reader following an archive reference to "F-PRESETS-3" must still find its
  renumbered live descendant, so the renumbered entries should each carry a
  parenthetical "(formerly F-PRESETS-n)".
- **GitHub-side references could not be scanned from this environment** (issue
  bodies, comments, PR descriptions). Before renaming, run
  `gh search issues "F-PRESETS" --repo Arishh420/Reading-Aid-Tool` (and the
  same over PRs) and update or accept any hits knowingly.
- F41–F45 breaks pure chronological numbering (these entries date 2026-07-08 /
  07-14, before F21's era ended) — acceptable, and worth one line in the change
  log, because the alternative (renumbering the tail) violates ID immutability.

---

## 8. README.md drift, itemized

Audited the whole file, not only the known items. Drift found:

1. **§3 "Set the pace": WPM "100–1000".** Code: `WPM_MIN = 50`
   (`src/pacer/PacerControls.tsx:25`; floor lowered 100→50, issue #38 item 6,
   D89). Change to **50–1000**.
2. **§6 keyboard note:** "(Shortcuts are ignored while you're typing in a field
   or a control is focused.)" — wrong for Space post-D89. Space toggles by
   default and yields only for the Play/Pause button, `TEXTAREA`, and
   text/checkbox/radio/file inputs; ←/→/Home still yield to any focused
   control. Rewrite the parenthetical to state the split behavior.
3. **Project-structure tree omissions** (files/dirs that exist and are
   load-bearing): `storage/` (`storage.ts`, `readingPosition.ts`), `presets/`
   (`presets.ts`), `model/blocks.ts`, `model/delimiterSpans.ts`,
   `pacer/keyboard.ts`, `ui/PresetsPanel.tsx`, `ui/ResumePrompt.tsx`, and
   `pacer/modes/RsvpContextStrip.tsx` (the modes/ line lists only the other
   four files).
4. **§File-format notes, PDF:** "lines are reflowed into paragraphs on vertical
   gaps" — incomplete post-D98: breaks also fire on a first-line indent versus
   the per-page body margin, and unconditionally at every page boundary.
5. **§3 controls (minor):** the scrubber and Word field are described
   unconditionally, but both are dropped during playback in the compact HUD
   (D88/D89). One clause ("while paused" or "hidden during playback") fixes it.
6. **Checked clean — no change needed:** dropdown-wins-once-touched wording
   (matches D97 exactly), nine built-ins and the group names including the
   "Accessibility" label (matches `GROUP_LABELS`), extension mapping
   (`.md/.markdown/.txt/.pdf/.epub`), RSVP font 1.5–6 rem, lead 0–5, chunk 2–4,
   context 3/5 default on, default WPM 300, four themes/Light default,
   Node 18+/Vite 6, scripts including `typecheck`, EPUB/PDF limitation notes,
   fingerprint-resume description, dependency list.

---

## 9. GENERAL — principles worth carrying into any future project's docs

Gathered from the entries tagged GENERAL (D11, D33, D115, F9, F11, F14, F22):

- **Docs are part of "done" (D33).** A milestone isn't complete until the
  decision log, architecture doc, and scope doc reflect it. Maintained inline,
  not reconstructed later.
- **Freeze before you sharpen; reference, never re-transcribe (D115).** Take a
  verbatim, byte-identical archive before condensing any living log; keep the
  archive header-free so byte-identity stays independently checkable; later
  docs cite the archive instead of copying it back in.
- **Name the logic file and its view differently (D11/F9).** Case-insensitive
  filesystems collide `bionic.ts`/`Bionic.tsx`; case-sensitive bundlers then
  break differently. Distinct names kill the whole bug class on every platform.
- **"No drift" means a careful reader found none (F11).** Manual doc-vs-code
  review is not verification; re-check any specific claim you're about to bet
  on, prioritizing whatever was never machine-checked.
- **Don't position em-scaled things with fixed percentages (F14).** If two
  moving quantities scale in `em`, express their separation in `em` in one
  stacking context so non-overlap is a property of layout, not tuning; snap
  scrolls to the line grid; set line-height as a length.
- **An honest ❓ beats a hopeful ✓ (F22).** A green suite only proves what it
  exercises; verification tags that refuse unearned confidence get vindicated —
  four of F22's ❓ items were real bugs on first browser contact.

Honourable mentions living under other tags, same spirit: sort comparators must
be total orders (D100/F33); a sentinel must respect the invariant of the
algorithm consuming it (F16); integration tests can be regression guards
without being proof — say which (F33); record known-accepted gaps so they
aren't re-fixed as bugs (D109, F29).

---

## 10. Closing count

| File | Entries found | Entries audited (appear exactly once above) | Match |
|---|---|---|---|
| DECISIONS.md | 115 (D1–D115) | 115 | ✔ |
| FINDINGS.md | 45 (F1–F40 + F-PRESETS-1..5) | 45 | ✔ |
| **Total** | **160** | **160** | **✔ — no entry skipped, sampled, or summarized away** |

Open uncertainties, stated rather than guessed: D64's verdict depends on issue
#26's status (not checkable here); F18's rejected-load sub-question remains a
browser-only ❓; GitHub-side F-PRESETS references were not scannable and need a
`gh search` before renumbering; the D86 ARCHIVE verdict relies on the stub
keeping the ID resolvable for ARCHITECTURE's historical references — if the
execution pass reads the ARCHITECTURE constraint more strictly, downgrade D86
to SHARPEN (reduce to the supersession paragraph) with identical effect.