# PORT-AUDIT.md — portable-module inventory for the Android / React Native port

> **Purpose.** A *verified* inventory of which modules under `src/` can be
> seeded into the Android port's `core/` directory, and which cannot. Written
> ahead of scaffolding (issue #7) so a module that quietly imports a DOM helper
> is caught here rather than three sessions into the port.
>
> **Scope discipline.** This is a read-and-report audit. **No existing file was
> modified**; `PORT-AUDIT.md` is the only file created. No scoping call, no
> library-replacement recommendation, and no port work is made here — options
> are surfaced with trade-offs in [§7](#7-unresolved--needs-a-decision-from-delta)
> for Delta to decide.
>
> Companion to [ARCHITECTURE.md](ARCHITECTURE.md) (Porting notes),
> [DECISIONS.md](DECISIONS.md), [FINDINGS.md](FINDINGS.md).
> **Audit date:** 2026-08-25. **Branch:** `chore/portable-module-audit`.
> **Commit audited:** `d888aa1`.

---

## 0. What was RUN vs. what was INFERRED

Stated up front, per this repo's own evidentiary discipline (FINDINGS legend).

### Actually executed (✅)

| What | Command / method | Result |
|---|---|---|
| Import listing, every file | `grep -nE "from ['\"]\|require\("` over all 37 `.ts`/`.tsx` | full table below |
| Browser-global scan, raw | `grep -nE` for 25 globals over all 37 files | raw hits below |
| Browser-global scan, **comment-stripped** | Node script stripping `//` and `/* */`, then re-grepping | separates real hits from prose noise |
| React / JSX usage | `grep -rnE "from .(react\|react-dom)"` + intrinsic-element counts per `.tsx` | 13 React importers, 15 JSX files |
| npm-package (non-relative) imports | `grep -rnE "from .[^.\"']"` + `package.json` | 5 runtime deps |
| **Transitive import closure, per module** | `esbuild --bundle --metafile` per entry point, externalising `react`/`react-dom`/`@tanstack/react-virtual`/`jszip`/`pdfjs-dist`, then reading `metafile.inputs` | **this is the strongest evidence in the report** — it catches value-imports that a per-file grep cannot |
| Build | `npm run build` (`tsc -b && vite build`) | **clean, 72 modules transformed, no type errors** |
| All 12 headless suites | `node <each>-headless-test.mjs` | **all green** (see §0.1) |
| Working tree unchanged | `git status --porcelain` before and after | clean both times |

#### 0.1 Headless suite re-run (confirming nothing was disturbed)

```
src/model/headless-test.mjs                          17 passed, 0 failed
src/model/delimiterSpans-headless-test.mjs           18 passed, 0 failed
src/pacer/headless-test.mjs                          13 checks: 13 passed, 0 failed.
src/pacer/orp-headless-test.mjs                      14 checks: 14 passed, 0 failed.
src/pacer/dwell-headless-test.mjs                     9 passed, 0 failed
src/parsers/headless-test.mjs                        15 passed, 0 failed
src/parsers/pdfText-headless-test.mjs                14 passed, 0 failed
src/parsers/pdf-headless-test.mjs                    14 passed, 0 failed
src/parsers/epubStructure-headless-test.mjs          12 passed, 0 failed
src/parsers/spine-integrity-headless-test.mjs        26 passed, 0 failed
src/presets/headless-test.mjs                        12 checks: 12 passed, 0 failed.
src/storage/headless-test.mjs                        15 checks: 15 passed, 0 failed.
```

```
$ npm run build
✓ 72 modules transformed.
✓ built in 1.08s
```

### Inferred, NOT executed (📐 / ❓)

- **Every claim about React Native / Hermes runtime behaviour.** No RN project,
  no device, and **no Hermes binary** exists in or near this repo (searched —
  none found), so nothing here was executed on the target engine. Where F25 and
  F41 made Hermes claims, they did so by downloading and running real Hermes
  binaries; **this audit did not repeat that**, and every RN-side statement
  below is marked ❓ accordingly.
- **The pacer and parser boundary analyses (§4, §5)** are structural readings of
  the actual source, not measurements. No RN prototype was built.
- **"Pure" means "no web dependency in its transitive closure"**, proven by
  esbuild. It does **not** mean the module has been proven to *behave*
  identically under Hermes. That is a separate, still-open obligation
  (§7, item 6).

---

## 1. Summary table — every module under `src/`

Classification key:
**PURE** = no React, no DOM, no browser globals, no web-only npm dep, in the
**whole transitive closure**.
**IMPURE** = depends on DOM, React rendering, or browser APIs.
**BORDERLINE** = the module's own logic is pure, but it carries a specific,
named, removable dependency.

`closure` = number of local files esbuild pulls in when bundling that file as an
entry point (itself included); `ext` = external packages actually reached.

| File | Classification | Blocking dependency (grep evidence) |
|---|---|---|
| `src/model/types.ts` | **PURE** | none. No imports. Comment-stripped global scan: **NONE**. closure 1, ext NONE |
| `src/model/tokenize.ts` | **PURE** | none. Imports only `./types` (type-only). Scan: **NONE**. closure 1, ext NONE |
| `src/model/blocks.ts` | **PURE** | none. Imports only `./types` (type-only). Scan: **NONE**. closure 1, ext NONE |
| `src/model/delimiterSpans.ts` | **PURE** | none. Imports only `./types` (type-only). Scan: **NONE**. closure 1, ext NONE |
| `src/pacer/orp.ts` | **PURE** | none. **No imports at all.** Scan: **NONE**. `Intl` appears only in comments (lines 62, 66) explaining why `Intl.Segmenter` is *not* used. closure 1, ext NONE |
| `src/pacer/dwell.ts` | **PURE** | none. Imports only `../model/types` (type-only). Scan: **NONE**. closure 1, ext NONE |
| `src/reader/bionic.ts` | **PURE** | none. No imports. Scan: **NONE**. closure 1, ext NONE |
| `src/parsers/markdown.ts` | **PURE** | none. Imports `../model/tokenize` + `../model/types`. Scan: **NONE**. closure 2 (`markdown.ts`, `tokenize.ts`), ext NONE |
| `src/parsers/pdfText.ts` | **PURE** | none. No imports. Scan: **NONE**. closure 1, ext NONE |
| `src/parsers/epubStructure.ts` | **PURE** | none. No imports. Scan: **NONE**. Uses `console.warn` (lines 104, 193) — present in RN. closure 1, ext NONE |
| `src/ui/theme.ts` | **PURE** | none. No imports. Scan: **NONE**. Pure token/label data. closure 1, ext NONE |
| `src/ui/sample.ts` | **PURE** | none. No imports. Scan: **NONE**. A template-literal string constant. closure 1, ext NONE |
| `src/pacer/keyboard.ts` | **BORDERLINE** | **DOM *types* only, erased at runtime.** No imports, no globals. But the signature is `spaceTogglesFrom(el: Element \| null)` (line 36) and the body reads `el.tagName` (38), `el.hasAttribute(...)` (44), `(el as HTMLInputElement).type` (50). `Element`/`HTMLInputElement` are `lib.dom` types with no RN equivalent. closure 1, ext NONE — **compiles away, but the concept (`tagName`/focus) does not exist in RN.** See §7 item 3 |
| `src/storage/storage.ts` | **BORDERLINE** | **`localStorage`** — the only blocker, 3 call sites: `localStorage.getItem` (18), `.setItem` (29), `.removeItem` (38). No imports, no other global. Already designed as the single swap point (its own header says so). closure 1, ext NONE |
| `src/storage/readingPosition.ts` | **BORDERLINE** | **transitively `localStorage`, via `storage.ts` only.** Own scan after comment-strip: **NONE**. Uses `Date.now()` (71) — fine in RN. closure 2 (`readingPosition.ts`, `storage.ts`), ext NONE. Pure the moment `storage.ts` is swapped |
| `src/presets/presets.ts` | **BORDERLINE → in practice IMPURE as shipped** | **⚠️ The headline finding. Value-imports four `DEFAULT_*` constants out of React component modules**: `DEFAULT_DISPLAY` from `../ui/Settings` (line 2), `DEFAULT_FLOWING` from `../pacer/modes/FlowingHighlight` (5), `DEFAULT_RSVP` from `../pacer/modes/Rsvp` (6), `DEFAULT_CHUNK` from `../pacer/modes/ChunkHighlight` (7), plus `storageGet/Set` (8). **Measured closure: 16 local files, ext `react` + `@tanstack/react-virtual`** — it drags in `Reader.tsx`, `RsvpContextStrip.tsx`, `usePacer.ts`, `BionicText.tsx`. Its own body is pure (scan after comment-strip: **NONE**). See §3.5 |
| `src/pacer/usePacer.ts` | **BORDERLINE** | **React + two browser globals.** `import ... from 'react'` (1); `requestAnimationFrame` (164, 177), `cancelAnimationFrame` (122), `performance.now()` (175). closure 2 (`usePacer.ts`, `dwell.ts`), ext `react`. React exists in RN; the two globals are RN-*runtime*-provided, not Hermes-provided (❓, §6). See §4 |
| `src/pacer/modes/scrollHelpers.ts` | **IMPURE** | DOM measurement + scroll: `HTMLElement` params (17, 18), `getBoundingClientRect()` (21, 22), `scroll.scrollTo({...behavior})` (24), `clientHeight`/`scrollTop` (23, 24). closure 1, ext NONE — pure of *imports*, entirely DOM in *body* |
| `src/parsers/index.ts` | **IMPURE** | Web File + Web Crypto: `computeFingerprint(file: File)` (30), `file.arrayBuffer()`/`file.slice()` (34, 38–40), **`crypto.subtle.digest('SHA-256', …)`** (53), `parse(file: File, …)` (65), `file.text()` (69). closure 7, ext `jszip`, `pdfjs-dist`, `pdfjs-dist/build/pdf.worker.min.mjs?url`. See §5 |
| `src/parsers/pdf.ts` | **IMPURE** | `import * as pdfjs from 'pdfjs-dist'` (1); **`import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'` (2) — a Vite-specific `?url` suffix**; `pdfjs.GlobalWorkerOptions.workerSrc = workerUrl` (17). closure 3, ext `pdfjs-dist` + the `?url` specifier. See §5.1 |
| `src/parsers/epub.ts` | **IMPURE** | `import JSZip from 'jszip'` (1); `JSZip.loadAsync(data)` (22), `zip.file(...)`/`.async('string')` (24–45); `ArrayBuffer` input (21). closure 3, ext `jszip`. See §5.2 |
| `src/App.tsx` | **IMPURE** | React (1); `document.documentElement.setAttribute` (128); `window.addEventListener('keydown')` (179–180); `setInterval`/`clearInterval` (199, 210); `document.visibilityState` (202); `visibilitychange` + `pagehide` listeners (206–207, 211–212); `CSSProperties` (302); 14 JSX intrinsic elements |
| `src/main.tsx` | **IMPURE** | `react-dom/client` `createRoot` (2, 6); `document.getElementById('root')` (6) |
| `src/reader/Reader.tsx` | **IMPURE** | React (10); `@tanstack/react-virtual` `useVirtualizer` (11); `HTMLDivElement`/`HTMLElement` refs (39, and throughout); `querySelector('[data-word-id=…]')` (138); `(e.target as HTMLElement).closest(...)` (149); `virtualizer.scrollToIndex` |
| `src/reader/BionicText.tsx` | **IMPURE** | JSX only (2 intrinsic elements) — renders `<b>`/fragment. Imports the pure `./bionic`. No globals, but it *is* a web view |
| `src/pacer/modes/FlowingHighlight.tsx` | **IMPURE** | React (1); `HTMLElement[]` (59); `classList.remove/add` (67, 76); `requestAnimationFrame`/`cancelAnimationFrame` (95, 154, 157); `getBoundingClientRect` (99, 100); `overlay.style.transform/width/height/transition` (106–112); `window.addEventListener('resize')` (170–171) |
| `src/pacer/modes/ChunkHighlight.tsx` | **IMPURE** | React (1); `HTMLElement[]` (49); `classList` (67, 72); `requestAnimationFrame`/`cancelAnimationFrame` (89, 127, 128); `getBoundingClientRect` (98); `window` resize listener (139–140) |
| `src/pacer/modes/Rsvp.tsx` | **IMPURE** | React (1); `HTMLSpanElement` refs; **`textContent` writes (92, 93, 94)** — the RSVP hot path; `tick.style.*` + **`void tick.offsetWidth` reflow flush (108)**; 7 JSX elements |
| `src/pacer/modes/RsvpContextStrip.tsx` | **IMPURE** | React (11); `HTMLElement` (89); `querySelector` (99); `classList` (101, 102); **`getComputedStyle` + `DOMMatrixReadOnly` transform read** (114 and following); `getBoundingClientRect` (121, 122); `.closest('[data-word-id]')` (190); `CSSProperties` custom property (202) |
| `src/pacer/PacerControls.tsx` | **IMPURE** | React (1); `textContent` write (57); **`document.activeElement`** (59, 62); 11 JSX elements (range/number inputs) |
| `src/pacer/ModeSettings.tsx` | **IMPURE** | No React import and no globals, but **16 JSX intrinsic elements** (`<select>`, `<option>`, …) via the automatic JSX runtime. A web view |
| `src/ui/Settings.tsx` | **IMPURE** | 7 JSX intrinsic elements. No globals. **Also exports the non-UI constants `DEFAULT_BIONIC` (13) and `DEFAULT_DISPLAY` (26)** — the second is what taints `presets.ts` (§3.5) |
| `src/ui/FileInput.tsx` | **IMPURE** | React (1); **`loadFile(file: File)` (48)**; drag/drop + `<input type=file>`; 7 JSX elements |
| `src/ui/PresetsPanel.tsx` | **IMPURE** | React (1); 17 JSX elements; DOM refs for autofocus |
| `src/ui/ResumePrompt.tsx` | **IMPURE** | React (1); 15 JSX elements; `Date.now()` (5) |
| `src/ui/ThemeSelector.tsx` | **IMPURE** | 1 JSX intrinsic element. Imports the pure `./theme` |
| `src/index.css` | **IMPURE** | CSS. The whole `data-theme` variable mechanism, `.rsvp-word` grid, HUD `max-height` collapse |
| `src/vite-env.d.ts` | **N/A (build config)** | 1-line Vite type reference. Not a module |
| `src/*/**-headless-test.mjs` (12 files) | **NODE-ONLY TEST HARNESS** | `node:assert/strict`, `node:url`, `node:path`, `node:fs/promises`, and `esbuild` as a library; `storage/headless-test.mjs` additionally uses `node:crypto` and installs a `globalThis.localStorage` stub (line 77). Neither portable nor web — they are the build-time proof harness. **Do not seed into `core/`; re-point them at the ported sources instead** (§7 item 5) |
| `src/.DS_Store` | **N/A** | macOS Finder artifact, not source. Worth noting it is tracked/present at all |

---

## 2. `core/` seed candidate list — PURE only

Every file below was proven by **esbuild transitive-closure measurement** to
reach zero external packages and zero web-only files, *and* by a
comment-stripped global scan to contain no browser global. These are the ones
that can be copied into the port's `core/` verbatim.

| # | File | Closure (local files) | External pkgs | Global scan | LOC |
|---|---|---|---|---|---|
| 1 | `src/model/types.ts` | 1 (self) | **NONE** | NONE | 48 |
| 2 | `src/model/tokenize.ts` | 1 (self) | **NONE** | NONE | 108 |
| 3 | `src/model/blocks.ts` | 1 (self) | **NONE** | NONE | 48 |
| 4 | `src/model/delimiterSpans.ts` | 1 (self) | **NONE** | NONE | 132 |
| 5 | `src/pacer/orp.ts` | 1 (self) | **NONE** | NONE | 145 |
| 6 | `src/pacer/dwell.ts` | 1 (self) | **NONE** | NONE | 88 |
| 7 | `src/reader/bionic.ts` | 1 (self) | **NONE** | NONE | 66 |
| 8 | `src/parsers/markdown.ts` | 2 (self + `tokenize.ts`) | **NONE** | NONE | 250 |
| 9 | `src/parsers/pdfText.ts` | 1 (self) | **NONE** | NONE | 179 |
| 10 | `src/parsers/epubStructure.ts` | 1 (self) | **NONE** | NONE | 201 |
| 11 | `src/ui/theme.ts` | 1 (self) | **NONE** | NONE | 16 |
| 12 | `src/ui/sample.ts` | 1 (self) | **NONE** | NONE | 26 |

**Total: 12 files, 1,307 LOC, closure-clean.**

Notes that matter for seeding, not caveats to the classification:

- **Closure of 1 for 10 of the 12.** Nine of these import nothing at all, or
  only `./types` **as a type-only import**, which esbuild erases — that erasure
  is visible in the measurement: `dwell.ts` and `blocks.ts` both report
  `closure 1` despite having an `import type` line. Only `markdown.ts` has a
  genuine runtime local dependency (`tokenize.ts`), and that dependency is
  itself on this list.
- **`epubStructure.ts` calls `console.warn`** (D63/D93 chapter-skip warnings,
  lines 104 and 193). `console` exists in RN, so this is not a blocker, but the
  warnings currently go nowhere user-visible in either target — that is issue
  #26's existing scope, unchanged by the port.
- **`ui/theme.ts` and `ui/sample.ts` are PURE but live under `ui/`.** They are
  data (theme ids/labels; a sample Markdown string), not views. Their directory
  is misleading, not their content. ARCHITECTURE.md's portable table already
  covers "theme token *values*"; `sample.ts` is not listed there at all — a
  small omission, not a drift.
- **`orp.ts` is the strongest single case on the list.** Zero imports, zero
  globals, and F41 already executed the *real bundled module* on a Hermes
  v0.13.0 binary (23/23 safe, 6/6 Latin literals matched). Of the 12, it is the
  only one with direct target-engine evidence behind it.

### Not on the list but one swap away

`storage/storage.ts` + `storage/readingPosition.ts` (closure 2, ext NONE,
blocked only by three `localStorage` calls) and `pacer/keyboard.ts` (closure 1,
ext NONE, blocked only by DOM *types*) are each a single, named, bounded change
from qualifying. They are BORDERLINE rather than PURE because this report does
not pre-approve the change — see §6 and §7.

---

## 3. The known candidates, resolved specifically

### 3.1 `splitOrp` / `toGraphemeClusters` / `orpIndex` — `src/pacer/orp.ts`

**CONFIRMED PORTABLE. The single cleanest module in the codebase.**

Evidence:
- `grep -nE "from ['\"]|require\("` → **no imports at all**, the only non-test
  file in `src/` with none besides `types.ts`, `bionic.ts`, `pdfText.ts`,
  `epubStructure.ts`, `keyboard.ts`, `storage.ts`, `theme.ts`, `sample.ts`.
- Comment-stripped global scan → **NONE**.
- esbuild closure → 1 file, **ext NONE**.
- The only `Intl` occurrences in the file are lines 62 and 66, **inside the doc
  comment**, and they say the opposite of a dependency: they record that
  `Intl.Segmenter` is deliberately *not* used because Hermes lists
  `intl402/Segmenter/` in its `permanent_skip_list` (D118/F41). The clusterer is
  hand-rolled from `\p{M}`, `ZWJ`, a 5-entry conjunct-linker set and the
  regional-indicator range — all plain regex/`Set` work.

**Less portable than assumed? No — but one adjacent claim is.** `splitOrp`
itself crosses cleanly. What does **not** cross is the *fixed-x anchor
mechanism* it feeds: that is a CSS-grid `2fr auto 3fr` + monospace property
(D29/F3), living in `index.css` and `Rsvp.tsx`, and it is reimplemented on the
RN side, not copied. D118 has already formally amended that guarantee from
universal to **script-scoped** (upheld for Latin/ASCII/Cyrillic/Greek; not
guaranteed for Indic/Thai/Hebrew-with-points), and F42/F43 closed the web-side
visual verification — but **F42 explicitly records the RN visual re-check as a
standing port-time obligation**, and this audit does not discharge it.

### 3.2 The shared `dwellMultiplier` helper — `src/pacer/dwell.ts`

**CONFIRMED PORTABLE.**

Evidence: imports only `../model/types` **as a type-only import** (line 1);
comment-stripped scan **NONE**; esbuild closure **1 file, ext NONE** — the
type-only import is provably erased.

The module exports `DWELL_CLAUSE`/`DWELL_SENTENCE`/`DWELL_PARAGRAPH`,
`dwellMultiplier(dwell, naturalPauses, index)`, `trailingDwell(token)`, and
`buildDwellMultipliers(doc)`. All four are arithmetic and string inspection over
the model.

Worth recording, because it makes the point of D114 concrete: `dwellMultiplier`
was extracted specifically so `usePacer.ts` and `Rsvp.tsx` stop duplicating the
gating expression, and it was given a **three-parameter pure signature rather
than the closure-shaped `dwellFor(index)` the issue proposed** precisely so it
would survive this port. That decision holds up under measurement — the helper
is reachable from `core/` with no closure, and both current callers pass their
own index (`last` for the clock, the flashed word's `index` for the pause cue —
not interchangeable).

### 3.3 The tokenizer and `reindexWords` — `src/model/tokenize.ts`

**CONFIRMED PORTABLE.**

Evidence: imports only `./types` (type-only, line 1); scan **NONE**; closure
**1 file, ext NONE**.

`tokenize`, `splitDashRuns` (internal), `flattenWords`, `reindexWords` are
whitespace splitting, `\p{L}\p{N}`/`\p{N}` regex tests, a `[–—]+` dash-run
scan, and array mapping. `reindexWords`'s `{ ...word, id: String(next++) }`
spread is what carries `spaceBefore` through re-indexing untouched (D107/F38).

**One porting obligation that is a contract, not a dependency, and must not be
lost in translation:** the `Word.id === flat word index` invariant (CLAUDE.md
§4, D13) is enforced *by discipline* — parsers must call `reindexWords` **last**
and must not filter blocks afterward. Nothing in `tokenize.ts` can enforce that
on the RN side; the port inherits the obligation along with the file. The same
applies to `\p{L}`/`\p{N}` Unicode property escapes: F41 measured `\p{M}` as
byte-identical between Hermes v0.13.0 and Node across 60 checks, which is strong
adjacent evidence, but **`\p{L}` and `\p{N}` specifically were not in that
probe** — flagged in §7 item 6 rather than assumed.

### 3.4 The document model / spine types — `src/model/types.ts` (+ `blocks.ts`, `delimiterSpans.ts`)

**CONFIRMED PORTABLE, all three.**

- `types.ts` — no imports, scan NONE, closure 1. Three interfaces
  (`Word`/`Block`/`Document`) and one type alias (`BlockType`). Pure type
  declarations; it emits no runtime code at all.
- `blocks.ts` — type-only import, scan NONE, closure 1. `buildBlockStarts` +
  `blockIndexForWord`, a monotonic-array build and a binary search. Carries the
  F16 lesson (an out-of-range sentinel breaks a binary search's precondition) in
  its own doc comment, which is worth keeping verbatim in `core/`.
- `delimiterSpans.ts` — type-only import, scan NONE, closure 1. Stack-based
  string scanning returning a parallel array. **Its header already asserts
  portability** ("No DOM, no React, no browser globals — ships with
  `pacer/orp.ts` and the model layer to the Android `core/` seed"); this audit
  confirms that assertion by measurement rather than restating it.

### 3.5 ⚠️ `src/presets/presets.ts` — REFUTED as portable

**This is the one candidate that is materially less portable than the docs
assume, and it is the finding most likely to bite the port.**

[ARCHITECTURE.md line 547](ARCHITECTURE.md) lists `presets/presets.ts` in the
**Portable (pure TS — copy as-is)** table, and it is *not* listed in the
web-coupled table. Its §11 also says "**Portable:** `presets.ts` (pure types,
CRUD, `bundlesEqual`) — no DOM deps".

The file's own body is genuinely pure (comment-stripped scan: **NONE**). But its
**imports are not**, and the measured closure proves it:

```
=== src/presets/presets.ts ===
  local closure (16): src/model/blocks.ts, src/model/delimiterSpans.ts,
    src/pacer/dwell.ts, src/pacer/modes/ChunkHighlight.tsx,
    src/pacer/modes/FlowingHighlight.tsx, src/pacer/modes/Rsvp.tsx,
    src/pacer/modes/RsvpContextStrip.tsx, src/pacer/modes/scrollHelpers.ts,
    src/pacer/orp.ts, src/pacer/usePacer.ts, src/presets/presets.ts,
    src/reader/BionicText.tsx, src/reader/Reader.tsx, src/reader/bionic.ts,
    src/storage/storage.ts, src/ui/Settings.tsx
  external pkgs: @tanstack/react-virtual, react
```

**Root cause, precisely.** Four **value** imports (not type imports) pull the
default-settings constants out of React component modules:

| Line | Import | Defined at | Drags in |
|---|---|---|---|
| 2 | `import { DEFAULT_DISPLAY } from '../ui/Settings'` | `Settings.tsx:26` | a JSX component module |
| 5 | `import { DEFAULT_FLOWING, ... } from '../pacer/modes/FlowingHighlight'` | `FlowingHighlight.tsx:25` | → `Reader.tsx` → `@tanstack/react-virtual` + DOM |
| 6 | `import { DEFAULT_RSVP, ... } from '../pacer/modes/Rsvp'` | `Rsvp.tsx:35` | → `RsvpContextStrip.tsx` (`getComputedStyle`, `DOMMatrix`) |
| 7 | `import { DEFAULT_CHUNK, ... } from '../pacer/modes/ChunkHighlight'` | `ChunkHighlight.tsx:22` | → `Reader.tsx` again |
| 8 | `import { storageGet, storageSet } from '../storage/storage'` | `storage.ts` | `localStorage` (the *expected* one, already documented) |

The `type`-qualified siblings on those same lines (`FlowingSettings`,
`RsvpSettings`, `ChunkSettings`, `PacerMode`, `Theme`, `BionicSettings`,
`ReaderDisplay`) are all erased — confirmed by `ModeSettings.tsx` and `theme.ts`
being **absent** from the closure despite being imported. It is specifically the
four unqualified `DEFAULT_*` value imports that do the damage.

**Why this matters more than it looks.** `presets.ts` is not a leaf. It defines
`PresetBundle`, the 9 built-in presets, the user-preset CRUD and `bundlesEqual`
— the settings spine the port needs early. Copying it into `core/` as the docs
currently sanction would either fail to resolve or silently pull `Reader.tsx`
and `@tanstack/react-virtual` into a React Native tree.

**This is a documentation/code disagreement.** Per CLAUDE.md §2 the drift must
be flagged rather than left standing — but this task's constraints forbid
modifying `ARCHITECTURE.md`, so it is flagged here and in §7 item 1 instead of
being fixed. **ARCHITECTURE.md line 547 is currently wrong and should not be
trusted as a seed list until it is corrected or the code is changed.**

By contrast `storage/storage.ts` appears in **both** ARCHITECTURE tables (line
545 portable-with-a-swap-note, line 562 web-coupled → `localStorage`) — slightly
redundant, but not misleading, and not drift.

---

## 4. Boundary case (a) — THE PACER

*Analysis only. The seam is described, not chosen.*

### 4.1 The invariant that has to survive

> The document tree must NOT reconcile on the per-pacer-tick path. Highlights
> move imperatively; re-render only at block/window boundaries. — CLAUDE.md §4

This is not a preference. F1 records that rendering the highlight as a React
**prop** re-reconciled ~57k word components / ~170k DOM nodes per tick and blew
the frame budget above ~150 WPM. Any RN mechanism that re-renders the list per
word reintroduces exactly that cliff — and RN's bridge/JSI hop makes the
per-item cost *worse*, not better.

### 4.2 What is already portable arithmetic, verified

Everything in the clock's decision-making is arithmetic over `Word[]` and two
numbers. Reading `usePacer.ts` in full, the portable half is:

| Concern | Location | Nature |
|---|---|---|
| `msPerWord = 60000 / wpm` | line 129 | arithmetic |
| chunk stepping (advance N word-like tokens) | 137–143 | array walk via `firstWordlikeFrom` |
| dwell gating | 144, via `dwellMultiplier` | **already extracted to the pure `dwell.ts`** (D114) |
| advance threshold `msPerWord · size · mult` | 145 | arithmetic |
| **≤1 step/frame clamp** `min(acc - threshold, msPerWord·size)` | 161 | arithmetic — the F2 no-skip guarantee |
| end detection (`next === -1` → `atEnd`) | 148–157 | array scan |
| `firstWordlikeFrom` / `lastWordlikeUpTo` / `nearestWordlike` | 21–43 | **pure module-level functions, already outside the hook** |
| `startedRef` never-started-vs-at-end distinction | 94–99, 190, 200 | boolean state machine (F31) |
| pub/sub set (`add`/`delete`/`forEach`) | 89, 101–106, 118 | plain `Set` |

None of that touches the DOM. `firstWordlikeFrom` is even already exported and
consumed by `App.tsx`, `FlowingHighlight`, `ChunkHighlight` — so part of the
seam is *already* drawn.

### 4.3 What is web-specific in the clock itself

Only three things, and they are shallow:

1. `requestAnimationFrame` / `cancelAnimationFrame` (122, 164, 177).
2. `performance.now()` (175) — the one timestamp read.
3. `import { useCallback, useEffect, useMemo, useRef, useState } from 'react'`
   (1) — React, which RN has.

That is the entire web surface of the clock. The accumulator never reads a
layout value.

### 4.4 Where the web mechanism actually lives — the consumers

The DOM coupling is **not** in `usePacer`; it is in the four subscribers. What
each does per tick, measured by grep:

| Consumer | Per-tick DOM work | Lines |
|---|---|---|
| `FlowingHighlight.tsx` | `wordEl(index)` → `getBoundingClientRect()` ×2 → write `overlay.style.transform/width/height/transition`; `classList` add/remove for lead words; conditional `scrollWordToBand` **only on line change** | 89–123 |
| `ChunkHighlight.tsx` | `wordEl(j)` per chunk member → `classList.add/remove('pacer-chunk')`; one `getBoundingClientRect()` for the line-change test; conditional scroll | 56–103 |
| `Rsvp.tsx` | three `textContent` writes (`pre`/`anchor`/`post`); `tick.style.*` + **`void tick.offsetWidth`** to force a reflow so the pause tick animates from full width | 92–116 |
| `RsvpContextStrip.tsx` | `querySelector('[data-word-id=…]')`; `classList` swap; `getBoundingClientRect()` ×2; **`getComputedStyle` + `DOMMatrixReadOnly.m42`** to read the live `translateY`; writes a line-snapped `translateY` | 99–140 |

Plus `Reader.tsx`, which owns `ReaderHandle` — `scrollEl` / `contentEl` /
`overlayEl` / `wordEl(index)` / `scrollToWord(index)` — the contract every mode
drives through, and `scrollHelpers.ts` (`getBoundingClientRect` + `scrollTo`).

### 4.5 Where the seam would be drawn

The natural cut is **already present in the code**, and it is the `PacerApi`
object plus `ReaderHandle`:

```
                      ── PORTABLE (core/) ──────────────┐
  Word[] ─► clock arithmetic (msPerWord, chunk step,    │
            dwell, ≤1/frame clamp, end detection)       │
                      │                                 │
                      ▼                                 │
            indexRef (ref) + subscribe(cb)   ◄── the SEAM
                      │                                 │
  ────────────────────┼─────────────────────────────────┘
                      ▼        ── WEB / RN MECHANISM ──
      cb(index) ─► locate word N ─► move highlight ─► maybe scroll
       web:  querySelector + getBoundingClientRect + style/classList + scrollTo
       RN:   measured layout map + setNativeProps / Reanimated shared value
             + scrollToOffset
```

Concretely, the seam has three properties worth stating precisely, because each
is what makes the invariant survivable rather than merely restated:

1. **The seam is `subscribe(cb: (index: number) => void)` — an integer
   callback.** It already carries nothing but a number. That is why it can cross
   engines unchanged: no element, no rect, no style object passes through it.
   `usePacer` needs **zero** knowledge of what the subscriber does.

2. **`indexRef` being a ref, not state, is the load-bearing half — and it
   transfers.** `useRef` exists in RN identically. What must *not* happen on the
   RN side is a well-meaning "just use `useState` for the index, RN lists are
   fast enough" — that is precisely the F1 cliff, and the `MutableRefObject`
   in `PacerApi` (line 49) is the type-level guard against it.

3. **The three web globals need a decision, not a redesign** (see §6). The
   accumulator's *shape* — "compute elapsed, add to accumulator, compare against
   a threshold, advance at most once" — is agnostic to whether the tick source
   is `requestAnimationFrame`, a Reanimated frame callback, or a
   `setInterval`-driven fallback.

**The part that does NOT transfer, and needs designing rather than porting:**

- **`wordEl(index)` has no RN equivalent.** On web it is
  `querySelector('[data-word-id="N"]')` — an O(1)-ish lookup against live DOM
  needing no bookkeeping (D13 is what makes the selector possible at all). RN
  has no query-by-attribute; the port needs an explicit index→node-handle (or
  index→measured-rect) map maintained as the list mounts/unmounts rows. That map
  is new code with a new invalidation problem, not a translation.
- **`getBoundingClientRect()` is synchronous on web; RN measurement is not.**
  Flowing mode reads the active word's rect *inside the tick callback* and
  positions the overlay from it in the same frame (lines 99–111). RN's
  `measure()`/`measureLayout` are callback-based; `onLayout` is
  commit-time-only. Either the port pre-measures word rects per row and reads
  from a cache in the tick, or the overlay lags a frame. This is the single
  hardest structural difference in the whole pacer path.
- **`void tick.offsetWidth`** (`Rsvp.tsx:108`) is a *forced synchronous reflow*
  used to restart a CSS transition. There is no reflow to force in RN — the
  pause-cue depletion becomes an explicit animation restart (a Reanimated
  `withTiming` re-trigger or equivalent).
- **`getComputedStyle` + `DOMMatrixReadOnly.m42`** (`RsvpContextStrip.tsx:114`,
  and D53's whole reason for existing) reads the *live, mid-transition*
  `translateY` so a re-center retargets without jitter. In RN a shared animated
  value **is** already readable directly — this is one place the RN mechanism is
  arguably cleaner than the web one, not worse.
- **The 40% reading band and line-change-only scroll** (`scrollHelpers.ts`,
  D24) is a *policy* that is portable arithmetic — `delta = wordTop - (paneTop +
  paneHeight · 0.4)` — wrapped in two web calls. The formula crosses; the
  `getBoundingClientRect`/`scrollTo` pair does not.
- **`onRangeChange` must stay class-only.** D85/F21 established that
  `onRangeChange` fires on *any* scroll including the user's own, so it may
  never reach a scroll call. RN's `onViewableItemsChanged` is the analogue and
  carries the identical hazard. **This is the constraint most likely to be
  silently violated during the port**, because the RN callback has a different
  name and an innocent-looking signature.

### 4.6 Honest limits of this analysis

Nothing above was prototyped. Whether `setNativeProps` (deprecated on the New
Architecture) or Reanimated shared values is the right per-tick mechanism is a
question this audit does not answer — see §7 item 4. Whether RN's
`requestAnimationFrame` has enough timestamp fidelity for the accumulator is
likewise unmeasured (§6).

---

## 5. Boundary case (b) — THE PARSERS

*Analysis only. No replacement library is recommended; the scoping call is
Delta's.*

The architecture here is genuinely good and the audit confirms it: **each
format is already split into a thin browser-shaped I/O wrapper and a pure
logic module**, and the pure halves measure clean.

| Format | Web-shaped wrapper | Pure logic | Pure logic's measured closure |
|---|---|---|---|
| Markdown | *(none — `parse()` only calls `file.text()`)* | `markdown.ts` | 2 files, **ext NONE** |
| PDF | `pdf.ts` (127 LOC) | `pdfText.ts` (179 LOC) | 1 file, **ext NONE** |
| EPUB | `epub.ts` (60 LOC) | `epubStructure.ts` (201 LOC) | 1 file, **ext NONE** |
| dispatch/identity | `index.ts` (81 LOC) | — | 7 files, ext `jszip` + `pdfjs-dist` |

### 5.1 PDF — `pdfjs-dist`

**What it actually depends on, line by line:**

- `import * as pdfjs from 'pdfjs-dist'` (line 1).
- `import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'` (line 2) —
  **the `?url` suffix is a Vite bundler feature, not JavaScript.** Metro does
  not understand it. This line alone makes the file non-portable regardless of
  what pdf.js can or cannot do on RN.
- `pdfjs.GlobalWorkerOptions.workerSrc = workerUrl` (17) — a **Web Worker**
  handoff. The build output confirms the shape: `pdf.worker.min-*.mjs` ships as
  a separate 1,262 kB chunk.
- `pdfjs.getDocument({ data })` (98) taking an **`ArrayBuffer`**; `pdf.getPage`,
  `page.getTextContent()` (104–105); `loadingTask.destroy()` in `finally` (125,
  the F18/#15 worker-leak fix).

**How deep does the coupling run?** *Shallower than the dependency's size
suggests.* Everything pdf.js-specific is confined to `parsePdf` (97–126) and the
first three import lines. The interesting logic below it is already free of it:

- **`itemsToLines(items: TextItem[])` (28–91) is *nearly* pure.** Its only tie to
  pdf.js is the **`TextItem` type** (a type-only import, line 3, provably erased
  — `pdf.ts`'s closure reaches `pdfjs-dist` through lines 1–2, not line 3) and
  its reading of `it.transform[4]`/`[5]`/`[3]`, `it.width`, `it.height`,
  `it.str`. It immediately projects those into a **local `Glyph` interface
  defined in this repo** (19–25). From line 40 onward — median height,
  the D100 total-order sort `(a,b) => b.y - a.y || a.x - b.x`, row clustering
  at `medianH * 0.6`, the space-insertion gap test, `PdfLine` construction — it
  is arithmetic over `Glyph[]`. F33 already exercises it headlessly (14/14).
- **`pdfText.ts` is fully pure and already proven** — closure 1, ext NONE,
  14/14 headless. It holds every cleanup heuristic worth keeping:
  header/footer/page-number drop, de-hyphenation (`ENDS_SOFT_HYPHEN`
  vs. `ENDS_DASH`, D60), the D98 per-page body-margin indent cue and
  unconditional page-boundary break, and the D99 `splitOversizedParagraphs`
  300-word hard cap.

**Is the parse logic separable from the browser I/O?** **Yes, and the separation
line is unusually crisp.** The contract between the two halves is
`PdfLine[][]` — a plain `{ text, x, gapBefore }[][]`. Anything that can produce
positioned text runs per page can feed `linesToParagraphs` unchanged. The
practical seam has two candidate positions, and which one is chosen determines
how much survives:

- **Seam at `PdfLine[][]`** — port only `pdfText.ts`; the RN side must produce
  positioned lines itself, including its own row clustering. Loses
  `itemsToLines`' clustering and the D100 sort.
- **Seam at `Glyph[]`** — additionally port `itemsToLines`' body by having the
  RN extractor emit `{x, y, h, w, str}`. Keeps clustering and the sort;
  requires extracting `itemsToLines` from `pdf.ts` (it is already `export`ed,
  and F33 notes the export exists specifically to make it testable without
  `pdfjs-dist`).

Both are viable; the second preserves strictly more verified logic. **Which
one — and whether PDF is in the first Android cut at all — is not decided
here.** Note D95 resolved EPUB into the first cut and said nothing about PDF.

### 5.2 EPUB — `JSZip`

**What it actually depends on:** `import JSZip from 'jszip'` (line 1) and four
call sites, all inside `parseEpub`: `JSZip.loadAsync(data)` (22),
`zip.file(CONTAINER_PATH)` (24), `zip.file(opfPath)` (30, 34), `zip.file(href)`
(40), and `.async('string')` (29, 34, 45). Input is an `ArrayBuffer` (21).

**How deep?** **The shallowest of the three.** `epub.ts` is 60 lines and its
JSZip usage reduces to a single capability: *given a path, give me the entry's
text*. Everything structural is in `epubStructure.ts` (closure 1, **ext NONE**,
12/12 + 26/26 headless), which by deliberate design (D35) uses **targeted string
scanning, not `DOMParser`** — specifically so it stays portable and testable.
That decision pays off exactly here. `epubStructure.ts` holds
`parseContainerOpfPath` (with the D62/#47 `safeDecodeHref`),
`parseOpfSpine` (with the D93 `(?:^|[\s"'])` attribute-name boundary),
`resolvePath`, `decodeEntities` (with the D65 U+10FFFF guard), `stripTags`
(with the D101/#74 script/style/comment stripping), `xhtmlToBlocks` and its
D94/#14 unclosed-tag fallback.

**Is the parse logic separable?** **Yes — more so than PDF.** The interface
`epub.ts` needs from any unzip implementation is effectively:

```
loadZip(bytes) -> { has(path): boolean, readText(path): Promise<string> }
```

Three methods. Every EPUB *decision* in this repo's bug-fix history lives on the
pure side of that line.

**One caveat worth naming rather than discovering later:** `epub.ts` orders its
reads by spine order and awaits each `.async('string')` sequentially in a `for`
loop (39–46). A replacement with different streaming/concurrency behaviour could
change memory profile on a large book, though not correctness.

### 5.3 Markdown — no wrapper at all

`markdown.ts` needs nothing but a string. `parse()` calls `file.text()` and
hands it over. **Fully portable today** (closure 2, ext NONE, 15/15 + 26/26
headless), and F25 additionally verified its four D91 lookbehind regexes
compile *and execute* on two real Hermes binaries (bytecode v84 and v96). Of
the three parsers this is the one with the least port work: the only thing
needed is a platform way to read a file into a string.

### 5.4 `parsers/index.ts` — the part nobody lists as a parser

Easy to overlook because it is dispatch, but it holds the **book-identity
fingerprint**, and it is the most web-API-dense file outside the UI:

- `computeFingerprint(file: File)` (30) — `File`, `file.size`, `file.slice()`,
  `file.arrayBuffer()` (34, 38–40).
- **`crypto.subtle.digest('SHA-256', buffer)`** (53) — Web Crypto.
- `parse(file: File, format)` (65) — `file.text()`, `file.arrayBuffer()`.
- `await import('./pdf')` / `await import('./epub')` (71, 75) — dynamic import
  for code-splitting (D36). Metro's dynamic-import support differs from Vite's;
  worth confirming, not assumed.

The **algorithm** is portable and already documented as such in the file's own
header (lines 23–25): sample 32 KB × 3 regions + an 8-byte big-endian size,
threshold 96 KB (D67). The `DataView`/`Uint8Array`/`BigInt` work is standard JS.
Only the byte-source (`File.slice`) and the digest (`crypto.subtle`) are
platform calls. **This matters more than its size suggests: the fingerprint is
what makes reading-position persistence work at all, and if the port's
implementation produces different bytes for the same book, every saved position
becomes unreachable.** The sampling regions and the size suffix must be
reproduced exactly, not approximately.

---

## 6. Timer and storage dependencies

### 6.1 Timers

| API | Call sites | RN status |
|---|---|---|
| `requestAnimationFrame` / `cancelAnimationFrame` | `usePacer.ts` 122, 164, 177 (**the clock**); `FlowingHighlight.tsx` 95, 154, 157; `ChunkHighlight.tsx` 89, 127, 128 | **Direct equivalent — RN provides both as globals.** ❓ *unverified here* (no RN project, no device). Important distinction: these come from the **React Native runtime**, not from Hermes — a bare Hermes CLI has neither, so F41's Hermes-binary method could not test them even if a binary were present |
| `performance.now()` | `usePacer.ts` 175 — **one call**, the accumulator's start timestamp | RN exposes a `performance` global in recent versions, but this is **version-dependent** and among the least certain items in this report ❓. A shim is trivial (`Date.now()`, or the timestamp `requestAnimationFrame` already passes its callback — note `tick(now)` at line 127 **already receives a timestamp argument**, so line 175 is arguably the only place a separate clock read is needed at all) |
| `setInterval` / `clearInterval` | `App.tsx` 199, 210 — the 30 s position save | **Direct equivalent.** RN implements both. Behaviour differs when backgrounded — see 6.3 |
| `setTimeout` / `clearTimeout` | **none** (grep: zero hits in `src/`) | n/a |

**Assessment:** the pacer's timing needs **no rethinking** — it needs one
decision about the frame source and one about the timestamp. The arithmetic
(§4.2) is untouched either way. What genuinely does need rethinking is not
timing but *mechanism* (§4.5).

### 6.2 Storage

| API | Call sites | RN status |
|---|---|---|
| `localStorage` | **`storage.ts` only** — `getItem` (18), `setItem` (29), `removeItem` (38) | **Needs a shim, and the file was built for it.** No direct RN equivalent |
| `crypto.subtle` | `parsers/index.ts:53` | **No RN equivalent built in.** Needs a native crypto module or a JS SHA-256. §5.4 |
| `sessionStorage`, `fetch`, `Blob`, `FileReader`, `URL.createObjectURL` | **zero hits anywhere in `src/`** (verified by grep) | n/a — nothing to port |

**`storage.ts` is the model case of a well-drawn seam.** Its own header states
the intent ("the three public functions are the only calls that touch the
platform API, so an Android port can substitute AsyncStorage… behind the same
interface"), and the measurement confirms it: closure 1, ext NONE, three call
sites, all `try`-wrapped. `readingPosition.ts` sits on top and is *already*
pure — closure 2, ext NONE, scan NONE — so **the entire persistence schema and
gating logic ports the moment `storage.ts` is swapped**: `BookRecord`,
`PositionSnapshot` (including the #76 per-snapshot `wordCount`), the
always-write-`latest` rule, the >2 % history gate, the 5-entry cap.

One shape mismatch to name, because it is the kind of thing that surfaces as a
bug rather than a compile error: **`localStorage` is synchronous; AsyncStorage
is not.** `storageGet<T>(key): T | null` returns a value directly (line 16), and
`loadBookRecord` (53) and `presets.ts`'s `loadStore` (221) both call it
synchronously. An async replacement changes those three signatures and every
caller — `App.tsx`'s `handleLoad` and the presets panel. MMKV *is* synchronous
and would preserve the signatures; AsyncStorage is not and would not. **That is
a real fork, not a detail — §7 item 2.**

### 6.3 Two behavioural gaps that are neither timer nor storage, but ride on both

- **`visibilitychange` / `pagehide` (`App.tsx` 202–212) have no RN equivalent.**
  They are two of the three save triggers (D73). RN's analogue is
  `AppState` (`active`/`background`/`inactive`). This is a **mechanism** swap,
  not a shim — and mobile backgrounding is *more* aggressive than a browser tab
  hide, so the 30 s interval alone is a weaker safety net there than here.
- **Backgrounded `setInterval` is throttled or suspended on Android.** The web
  save loop assumes the interval keeps running while the tab is merely
  unfocused. On Android a backgrounded JS timer may not fire at all, making the
  `AppState` transition save the *primary* trigger rather than a backup. This
  does not require code changes to `readingPosition.ts` — the schema and gating
  are unaffected — but it changes which trigger the design leans on. ❓ not
  measured.

---

## 7. Unresolved / needs a decision from Delta

Options and trade-offs only. No call is made here.

**1. `presets.ts`'s four `DEFAULT_*` value imports (§3.5) — and the
ARCHITECTURE.md line that says it is portable.**
The doc and the code disagree; per CLAUDE.md §2 that must not be left standing,
but this task forbids editing either, so it is surfaced rather than fixed.
Options: **(a)** move the four `DEFAULT_*` constants into a new pure
`settings-defaults.ts` (or into `presets.ts` itself) and have the `.tsx` modules
import *from* it — makes `presets.ts` genuinely closure-clean, touches 4 files,
and inverts a dependency that arguably points the wrong way today; **(b)** leave
the code and correct ARCHITECTURE.md line 547 to move `presets.ts` to the
web-coupled table — zero code risk, but the port then hand-copies the bundle
defaults, which is exactly how they drift (see F-PRESETS-5, where a hand-copied
preset table already drifted once); **(c)** defer, and let the port duplicate
the constants — cheapest now, and the option most likely to produce a
D103-style contradiction later. **Note (a) and (b) are not exclusive** — (a)
still needs the doc updated.

**2. Synchronous vs. asynchronous storage (§6.2).** MMKV keeps
`storageGet/Set/Remove`'s synchronous signatures and every caller unchanged;
AsyncStorage forces those three signatures to `Promise`-returning and ripples
into `loadBookRecord`, `presets.ts`'s `loadStore`, `App.tsx`'s `handleLoad`,
and the presets panel. This is the single decision with the widest blast radius
in the storage layer, and it should be made **before** `readingPosition.ts` is
seeded, not after.

**3. `keyboard.ts` / `spaceTogglesFrom` — port, or drop?** It is closure-clean
but models a concept (a focused DOM element with a `tagName`, competing for the
Space key) that has no Android analogue. Options: drop it from `core/` entirely
and let Android use touch transport; keep it for a future keyboard/tablet
target; or keep the *shape* and re-point it at whatever focus model RN
introduces. ARCHITECTURE.md lists it as portable, which is true mechanically
and questionable conceptually. **Not a bug — a scoping question.**

**4. The per-tick RN mechanism (§4.5).** `setNativeProps` is deprecated under
the New Architecture; Reanimated shared values are the current idiom but add a
dependency to a layer the port is trying to keep thin. Whichever is chosen must
satisfy the same contract `ReaderHandle` states today: locate word N, move a
highlight to it, and scroll only on line change — **without** re-rendering the
list.

**5. What happens to the 12 `.mjs` headless suites.** They are the only proof
the pure logic works, and 8 of them esbuild-bundle the **real** source (the
pattern F24/F32/F34/F38/F41 established deliberately). Options: keep them in
this repo pointed at these sources and re-run them against `core/` after each
sync; move them into the port repo; or duplicate. The failure mode to avoid is
the one F-PRESETS-5 already documents — a hand-copied test fixture drifting from
the real source with no automated guard.

**6. Hermes verification for the seed set (§0, §3.3).** F25 and F41 executed real
Hermes binaries for `markdown.ts`'s lookbehinds and `orp.ts`'s `\p{M}`; **this
audit executed none** (no binary present). Unverified on Hermes for the
remaining seed candidates: `\p{L}` / `\p{N}` (`tokenize.ts`, `bionic.ts`),
`String.prototype.normalize` on the seed set generally (F41 confirmed it exists
on v0.13.0 — good adjacent evidence), `Intl`-free operation (nothing in the
seed set uses `Intl`, confirmed by grep), and RN's
`requestAnimationFrame`/`performance` (§6.1 — RN-runtime, so a bare Hermes CLI
cannot answer it anyway). Whether to repeat F25/F41's binary method across the
seed set before scaffolding, or wait for a real device once the RN version is
pinned, is open — F25 already flags the device smoke test as an explicit
pre-port dependency.

**7. PDF's seam position, and whether PDF is in the first cut (§5.1).** D95 put
EPUB in the first Android cut and is silent on PDF. If PDF ships, the
`PdfLine[][]`-vs-`Glyph[]` seam choice determines whether `itemsToLines`'
clustering and the D100 total-order sort survive or are rewritten.

**8. The web-side `atEnd`/`startedRef` semantics carry to RN unchanged?** D96
settled "Play stays disabled at end-of-document; ↺ Restart is the explicit
gesture" for the web. That was reasoned partly from browser affordances (a
visible disabled button, a keyboard Space). Whether the same choice is right for
a touch UI is a product question the port inherits, and D96 does not pre-answer
it for Android.

---

## 8. What I could not determine

Stated plainly rather than papered over.

1. **Anything about actual React Native or Hermes runtime behaviour.** No RN
   project, no device, no emulator, and **no Hermes binary** anywhere reachable
   (searched). Every RN claim in this report is ❓ inference from the platform's
   documented surface, not execution. Where earlier findings *did* execute on
   Hermes (F25, F41), they are cited as such and credited to those findings, not
   to this audit.
2. **Whether `performance.now()` exists in the RN version the port will use.**
   Version-dependent, and no RN version is pinned (issue #7 has none). Called
   out because it is one line (`usePacer.ts:175`) with an easy shim — but "easy"
   is an inference too.
3. **Whether Metro handles the dynamic `import('./pdf')` / `import('./epub')`
   code-splitting** the way Vite does (D36). Not tested.
4. **Whether pdf.js can run on RN at all**, in any configuration. Not
   investigated — and deliberately so: §5 was asked to report coupling, not to
   evaluate replacements.
5. **Runtime behaviour of `presets.ts`'s tainted closure.** esbuild proves the
   *import graph* reaches `react` and `@tanstack/react-virtual`. Whether merely
   importing `presets.ts` would *execute* DOM code at module-eval time (as
   opposed to failing to resolve, or resolving and lying dormant) was not tested
   — the import graph alone is enough to disqualify it from a verbatim `core/`
   copy, so the further question was not pursued.
6. **Any performance number on either platform.** No profiling was run. The F1
   perf-cliff reasoning in §4.1 is quoted from the existing finding, which is
   itself 📐 + 👁, never profiler-measured (that file says so).
7. **Whether the 12-file seed set is *sufficient*** to stand up a useful
   `core/`. This audit answers "which files *can* go" — it does not simulate a
   port to check that what remains is a coherent, compilable unit on the other
   side. A seed set can be individually clean and still be missing something the
   port needs.
8. **Bundler/tsconfig-level assumptions.** `vite-env.d.ts`, the `?url` import
   suffix, and `tsconfig` path/JSX settings were noted where they appear as
   *source* dependencies but the build configuration itself was not audited —
   it is out of scope for a module inventory and will be replaced wholesale by
   Metro anyway.

---

## Appendix A — raw evidence, method notes

**Closure measurement.** Per entry point:

```
./node_modules/.bin/esbuild <file> --bundle --format=esm --platform=neutral \
  --outfile=/dev/null --metafile=meta.json \
  --external:react --external:react-dom --external:react/jsx-runtime \
  --external:@tanstack/react-virtual --external:jszip \
  --external:pdfjs-dist --external:'pdfjs-dist/*'
```

then reading `metafile.inputs` (filtering `node_modules`) for the local closure,
and each input's `imports[].external` for the packages actually reached.
Externalising the five runtime deps is what makes the measurement *report* them
rather than inlining them — an entry point that reaches `react` shows
`external pkgs: react`, and one that does not shows `(NONE)`. Type-only imports
are erased by esbuild, which is why `dwell.ts` reports closure 1 despite its
`import type` line, and why `ModeSettings.tsx` and `ui/theme.ts` are absent from
`presets.ts`'s closure while `ui/Settings.tsx` is present.

**Comment stripping.** Raw grep over `src/` produced many false positives —
`document` as a *prop name* in the mode components, `window` inside
`RsvpContextStrip`'s "buffered window" prose, `Intl` inside `orp.ts`'s comment
explaining why it is *not* used. A Node pass replacing `/* … */` and `// …` with
whitespace (preserving line numbers) before re-grepping separates real hits from
prose. Both passes are reflected above: the table cites the **comment-stripped**
result and calls out the notable prose false positives by line.

**Prop-name caveat, stated because it is a genuine limit of the method.** The
mode components take a prop literally named `document` (`FlowingHighlight.tsx`
28/40, `ChunkHighlight.tsx` 25/36, `Rsvp.tsx` 42/52, `RsvpContextStrip.tsx`
49/59, `Reader.tsx` 45/103). Inside those components the identifier is
**shadowed** and refers to the app's `Document` model, not `window.document` —
so a `document.blocks` hit is *not* a DOM hit. Those files are classified IMPURE
on other, independent evidence (React, `classList`, `getBoundingClientRect`,
`querySelector`), never on the `document` identifier alone. The shadowing is
also a mild readability hazard for the port, worth mentioning once.

**Globals scanned:** `document`, `window`, `navigator`, `localStorage`,
`sessionStorage`, `fetch`, `Blob`, `FileReader`, `File`, `performance`,
`requestAnimationFrame`, `cancelAnimationFrame`, `setTimeout`, `setInterval`,
`clearTimeout`, `clearInterval`, `Intl`, `getBoundingClientRect`,
`getComputedStyle`, `crypto`, `querySelector`, `closest`, `addEventListener`,
`removeEventListener`, `scrollTo`, `scrollTop`, `classList`, `textContent`,
`createElement`, `HTMLElement`, `Element`, `Node`, `DOMMatrix`, `CSSProperties`,
plus `Date.now`, `new Date`, `console.*`, `process.env`, `import.meta`,
`URL.createObjectURL`.
**Zero hits anywhere in `src/`:** `navigator`, `sessionStorage`, `fetch`,
`Blob`, `FileReader`, `URL.createObjectURL`, `setTimeout`, `clearTimeout`,
`process.env`. `import.meta` appears only via Vite's `?url` import mechanism in
`pdf.ts:2`.

---

## Appendix B — cross-references into the existing docs

Claims above that rest on prior verified findings rather than on this audit:

| Claim here | Source | Its own evidence tier |
|---|---|---|
| Per-tick reconciliation was the perf cliff (~57k nodes, >150 WPM) | F1 | 📐 + 👁, never profiled |
| ≤1 word/frame clamp prevents skipping | F2 | ✅ headless |
| Monospace is *required* for the fixed-x anchor | F3, D29 | 📐 + ✅ + 👁 |
| `Intl.Segmenter` is permanently out of scope on Hermes | F41, D118 | 🧪 — Hermes repo `permanent_skip_list` |
| `orp.ts` runs correctly on Hermes v0.13.0 (23/23) | F41 | 🧪 real binary |
| `\p{M}` is byte-identical Hermes vs. Node (60/60) | F41 | 🧪 real binary |
| Lookbehind regexes work on Hermes (bytecode v84 + v96) | F25 | 🧪 two real binaries |
| `onRangeChange` must never scroll | D85, F21 | 📐 + static grep |
| Pacer consumers must depend on `indexRef`/`subscribe`, not `pacer` | D102, F35 | 📐 traced |
| `epubStructure.ts` avoids `DOMParser` deliberately for portability | D35 | design decision |
| Fingerprint sampling: 32 KB × 3 + 8-byte BE size, 96 KB threshold | D67, F20 | ✅ headless |
| EPUB is in the first Android cut | D95 | product decision |
| Play stays disabled at end-of-document | D96 | product decision |
| A hand-copied fixture already drifted once | F-PRESETS-5 | ✅ + its own caveat |

**The D29/F3 zero-advance-width reasoning remains ❓** (reasoned, never
measured) per F41/F42/F43, and **F42's Android/RN visual re-verification
obligation for `orp.ts` stands undischarged** — this audit does not touch
either.
