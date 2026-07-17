# Findings

> Empirical things we **learned by building and testing** — distinct from
> [DECISIONS.md](DECISIONS.md) (choices we made). These are the non-obvious
> constraints the React Native port needs to inherit. Companion to
> [ARCHITECTURE.md](ARCHITECTURE.md).

## Verification legend

How each claim here (and the load-bearing claims in ARCHITECTURE.md) was checked:

- ✅ **Unit-verified** — a deterministic headless check was run (esbuild-bundled
  TS executed in Node: tokenizer, markdown, bionic split, ORP, dwell timing,
  clamp no-skip, chunk stepping, PDF cleanup, EPUB end-to-end).
- 🧪 **Build-verified** — `tsc -b` + `vite build` pass; bundle sizes observed.
- 👁 **User-confirmed (browser)** — the user ran the app for ~3h of real reading
  and confirmed behavior/feel.
- 📐 **Derived** — follows analytically from the code/math; not independently
  measured.
- ❓ **Assumed** — believed correct but not exercised in this environment.

> Honest caveat for the port team: almost nothing visual/performance here was
> measured with a profiler *by the build process*. Perf and rendering claims are
> 📐 derived + 👁 user-confirmed, not instrumented. The pure logic is ✅.

---

## Open / needs browser verification (index)

The highest-value unverified claims, surfaced here so they aren't buried inside
long entries. Anything ❓/📐 below was never machine- or browser-checked and
should be re-confirmed before the port (or anyone) relies on it:

- **F-PRESETS-2** ❓ — React 18 batching of the nine `applyPreset` setters into
  one render pass; no render-count test exists.
- **F6** ❓ — the pdf.js extraction path (`itemsToLines` + worker) has never been
  exercised in a real browser; only the pure cleanup is ✅.
- **F7** ❓ — EPUB parsing is ✅ on one constructed file only; real-world EPUB
  variety is untested.
- **F4** 📐 — ORP "left-of-centre + pinned" is pure design rationale, with no
  ✅/🧪/👁 backing (unlike its sibling F3).
- **F18 (open sub-question)** — whether `loadingTask.destroy()` is safe after a
  rejected load (corrupt/truncated PDF) is still unconfirmed; the main leak fix
  itself is 🧪-verified.
- **Outstanding browser-test tails** — F13/F14/F15 (felt centering/overlap), F19,
  F20, F21, and F-PRESETS-4 each close with a browser-test checklist that is still
  open.
- **F32** ❓ — the issue #9 paragraph-break fix (indent cue, page-boundary
  break, hard-split net) is 13/13 headless-verified against synthetic
  `PdfLine[][]` constructions; a real-world PDF has not been loaded through
  the browser UI to confirm the fix reads correctly on actual book layouts.
- **F33** ❓ — the issue #13 glyph-sort fix is proven correct as a comparator
  (direct transitivity proof, 64,000-triple sweep), but despite an extensive
  search, no realistic input was found where the *old* comparator visibly
  corrupted `itemsToLines`'s output in this Node/V8 version — so there is no
  confirmed before/after repro of user-visible text scrambling, only proof
  the old code relied on unspecified `Array.sort` behavior and the new code
  doesn't. Real-world PDF-through-browser-UI verification (same as F6/F32)
  is also still open.
- **F22/F23** ❓ — four of F22's originally-❓ items turned out to be real bugs
  (F23); the *fixes* for those bugs are themselves unwatched in a browser so
  far — still just corrected code + a passing headless predicate suite (now
  13/13). The remaining visual/interactive half (collapse smoothness at the
  new 40rem ceilings, RSVP glide-not-jump, no re-wrap, continuous progress
  bar, no double-toggle on the play button, the paused→play Space repro,
  `:disabled` styling legibility across themes) is still unverified by
  anything but static analysis.

---

## Performance

### F1 — The perf cliff was per-tick reconciliation, and it needed TWO fixes
Rendering the highlight as a React **prop** re-reconciled the entire document
tree (~57k word components / ~170k DOM nodes) on **every pacer tick**. Above
roughly **150 WPM** the per-tick reconciliation blew the frame budget and frames
dropped. The fix was **two independent changes addressing two different
symptoms**, and neither alone is sufficient:
- **Pub/sub decoupling** (index in a ref + `subscribe`, Reader memoized) removes
  the *per-tick* cost — the document tree no longer reconciles during playback.
- **Virtualization** removes the *baseline* cost — 57k mounted components hurt
  first paint, memory, and scroll regardless of ticks.
*Verification:* 📐 (render-path analysis: a normal tick fires zero `setState`) +
👁. **Not** profiler-measured here. → A React Native port using `FlatList` gets
the virtualization half for free, but **must still keep the active-word highlight
off the per-item render path** (drive it via `Animated`/refs), or the cliff
returns.

### F2 — Accumulator catch-up disguises dropped frames as *skipped words*
A time-accumulator clock that advances *as many words as fit* on a slow frame
will visually **skip** words (the highlight jumps N ahead, only the last is
painted). This reads as "the app skipped words," but it's the catch-up logic, not
a tokenizer bug. The **≤1 word/frame clamp** (a single `if`, plus
`acc = min(acc - threshold, msPerWord·chunkSize)`) trades exact long-run average
pace for the guarantee that **every word is actually painted** — under sustained
slow frames the reader *slows* instead of skipping.
*Verification:* ✅ (simulated 300/1000 WPM and a pathological 1000 ms jank frame:
`maxAdvancePerFrame === 1`, every consecutive word-like token visited).

---

## RSVP / ORP

### F3 — Monospace is *required*, not cosmetic, given a left-of-centre anchor
The fixed-anchor layout is a grid `2fr auto 3fr`; the anchor's centre x works out
to `0.4·W + 0.1·(anchor glyph width)`. In a **proportional** font the glyph width
varies per word, so the anchor **drifts** by ~`0.1·Δwidth` between words —
defeating the whole point. **Monospace** makes the glyph width constant, so the
anchor centre is an exact fixed x.
- Subtlety: a *centred* grid (`1fr auto 1fr`) is drift-free even in a proportional
  font (the `+0.1·width` term vanishes at 50%). We chose **left-of-centre** (F4),
  which is what couples the design to monospace.
*Verification:* 📐 (the algebra) + ✅ (`orpIndex`/`splitOrp` unit-tested) + 👁
(anchor stability in use). → The RN port **must** use a monospace font for the
RSVP word, or re-centre the anchor.

### F4 — ORP only works left-of-centre AND pinned
The recognition benefit comes from the eye fixating one consistent point slightly
left of word centre. If the focal point is centred, or if it drifts between
words, the eye re-fixates each word and the speed/flow benefit collapses. So
"left-of-centre" and "fixed x" are both load-bearing, not stylistic.
*Verification:* 📐 / design rationale (consistent with Spritz-style RSVP).

---

## Pacing

### F5 — Dwell belongs in the clock, or you reimplement it per mode
Putting the punctuation dwell in `usePacer` (the threshold) means flowing, RSVP,
and chunk **all inherit natural pauses for free**, including the RSVP pause cue
which just reads the same dwell. Had it lived in a mode, each of the three modes
would need its own copy.
*Verification:* ✅ (dwell timing: comma 1.75×, period 2.5×, paragraph 3× measured
against the base) + 📐.

---

## Parsing (PDF / EPUB)

### F6 — PDF: only the cleanup is proven; extraction and layout are best-effort
- The **cleanup heuristics** (`pdfText.ts`: header/footer + page-number drop,
  de-hyphenation, paragraph reflow) are ✅ unit-verified on synthetic positioned
  lines. The **pdf.js extraction path** (`itemsToLines` + the worker) is ❓ — it
  needs a real PDF in a browser and was **not** exercised here.
- Line grouping is a **y-position heuristic**, so **multi-column layouts, tables,
  footnotes, and drop-caps will reflow incorrectly**.
- Header/footer removal requires the same text on **≥50% of pages**; one-off or
  alternating running heads can slip through, and a frequently-repeated chapter
  title could be wrongly dropped.
- "Scanned" detection is **text-volume based, not OCR** — a PDF with a few
  extractable characters but mostly images may pass the check yet read poorly.
- **No heading detection** for PDF (everything becomes a paragraph); PDFs lack
  reliable structural cues.

### F7 — EPUB: well-formed XHTML only, common content only
- Parsing is **targeted string scanning, not DOMParser** (for portability/test).
  ✅ verified on a constructed EPUB (entity decode, `../` path resolution, spine
  order honored, no `li>p` duplication), but ❓ for the variety of real-world
  EPUBs. Malformed/unusual markup may drop or merge text.
- Only `h1–h6`, `p`, `li`, `blockquote` are captured; text inside `div`/`table`/
  `figure` without those tags is **skipped**.
- **DRM/encrypted EPUBs are unsupported** (no decryption).

### F8 — The heavy parser deps must be code-split
Eagerly importing `pdfjs-dist` (~470 kB) + `JSZip` (~100 kB) pushed the main
bundle to **765 kB**. Dynamic-importing the PDF/EPUB modules restored the main
bundle to **~190 kB (61 kB gz)**; they load only when those formats are used.
*Verification:* 🧪 (build output).

---

## Build / tooling gotchas

### F9 — Case-insensitive filesystem collisions
macOS's case-insensitive FS treats `bionic.ts` and `Bionic.tsx` as the same file
(`tsc` errored). The logic file and its view are named distinctly
(`bionic.ts` / `BionicText.tsx`). React Native's Metro **is** case-sensitive, so
distinct names also avoid a cross-platform footgun.
*Verification:* 🧪 (reproduced the tsc error, then fixed).

### F10 — Spec settings intentionally not built (so the port doesn't assume them)
The spec (§7.3) lists some per-mode settings we did **not** build in v1:
flowing highlight **color/style**, chunk highlight **style**, RSVP focal-letter
**alignment toggle**. Built: flowing **lead words**, RSVP **font size**, chunk
**size (2–4)**, plus global bionic, theme, WPM, natural pauses, and (M7) reader
font-size + line-width and keyboard transport.

---

## Post-V1 techniques

### F12 — "Render per block, move per word" keeps a text view off the hot path
The RSVP context strip renders a whole paragraph but must follow the pacer
word-by-word. The technique that keeps it off the per-tick React path: subscribe
imperatively, **re-render (setState) only when the active word crosses a block
boundary**, and move the highlight *within* a block by toggling a class on word
spans. Consecutive words share a block, so renders happen per paragraph, not per
tick.
*Verification:* ✅ — over a 9-word/3-block sample, `blockIndexForWord` produced
exactly **3** block changes (3 React renders) while the other 6 advances are
imperative class swaps; every word mapped to its correct block. → Any RN port of
a "context" view should follow the same rule: paragraph is the render unit, word
is the imperative unit.

### F13 — For a moving-context view, pin the fixation line; scroll the text under it
The first context-strip cut clamped to 3 lines and swapped a block at a time.
That page-flip **forces re-orientation** at each boundary — exactly the cost RSVP
exists to remove. The fix that works: **pin the active word's line to a fixed
center line and scroll the paragraph text underneath it** (a transitioned
`translateY`), so the reader's fixation point never moves and only *peripheral*
lines drift at the faded edges. Motion that happens away from the fixation point,
one line at a time, doesn't pull the eye the way a whole-box swap does. Rendering
is a **buffered window** of blocks translated continuously; the window shifts
(the only React render) only near its edges.
*Verification:* ✅ (window-shift frequency: ~7 shifts across 180 words at 5 lines,
5 at 7 lines, active block always inside the window) + 📐 (the fixed-fixation
rationale) — the *felt* distraction tradeoff is 👁, to be confirmed in use. →
Port note: reproduce "pinned line + text scrolls under it", not "swap a page".

### F14 — Stack the moving pieces; don't position them by percentage
The first strip cut sat at `top: 68%` (absolute). It collided with the RSVP pause
tick at large font / many context lines. **Root cause was systemic, not a bad
number:** a percentage `top` is decoupled from the two things that actually move —
the word's rendered height and the pause tick's reach (`top: calc(100% +
0.95em)`), **both of which scale in word-`em`**. A fixed % can't track an `em`
quantity, so *some* font size always overlaps. The fix that holds at every size:
put word + strip in **one flex column** and express the separation as an `em` gap
(`1.8em`) — now the gap scales in lockstep with the tick it must clear
(`clear = (1.8 − ~1.1)·F > 0` for all `F`), and non-overlap is a property of the
layout, not of tuning. Two companion lessons for any pinned-line scroller:
- **Snap the scroll to the line grid.** Pixel-centering the active *glyph* leaves
  the top/bottom lines half-clipped — they read as "a smaller line." Because the
  box is an odd multiple of the line box, the ideal offset is already an integer
  multiple of a line, so `Math.round(y / lineH) * lineH` keeps every visible line
  whole *and* the active line dead-centre.
- **Line-height as a length, not a number.** Unitless `line-height: 1.5`
  re-resolves against each element's own font-size; a length (`1.5em` captured in
  a var, inherited as computed px) gives every descendant an identical line box —
  the robust cure for "inconsistent line heights."
- **A paragraph break needn't cost a row.** A zero-height absolutely-positioned
  hairline marks the boundary without adding a line box, so "3 context lines"
  stays 3 lines of *text*.
*Verification:* 📐 (the `em`-coupling algebra + the integer-multiple snap) + 🧪
(build) — the *felt* result is 👁, to confirm in the browser. → Port note: the RN
strip should stack (not overlay) and snap its scroll to the row height.

### F15 — `offsetTop` scroll math is fragile: a positioned descendant silently moves the `offsetParent`
The strip centers the active line with a `translateY` computed from the active
word's offset inside the scroll container. Written as `el.offsetTop`, that offset
is relative to the element's **`offsetParent`** — the nearest *positioned*
ancestor. When a later change (the D52 zero-height paragraph separator) added
`position: relative` to the paragraph purely for a `::before`, the offsetParent
flipped from the scroll container to the `<p>`, so `offsetTop` collapsed to a
within-paragraph value and the strip scrolled to the wrong place (unrelated
paragraph, or blank when the word was deep in a long block). **One unrelated CSS
line broke the sync**, and it presented as four different symptoms (desync / no
highlight / blank-on-toggle / uneven lines) — a reminder to reason about a
feature's data+layout flow as a whole, not symptom-by-symptom.
- **The robust fix is measurement that doesn't depend on offsetParent:**
  `getBoundingClientRect()` of the span vs. the scroll container gives the true
  on-screen delta regardless of positioned ancestors, transforms, or margins.
- **Read the live transform, not a tracked target.** Getting the current
  `translateY` from the computed matrix (`DOMMatrixReadOnly.m42`) means a
  re-center that fires mid-CSS-transition retargets from the actual on-screen
  position — no jitter when words advance faster than the glide.
*Verification:* 📐 (offsetParent semantics) + ✅ (headless: `Word.id ===` flat
pacer index for every word, and `blockIndexForWord` resolves every word-like
index to the block that truly contains its span) + 🧪 (build). The *visual*
centering is 👁, to confirm in the browser. → Port note: any "scroll a container
to center child N" logic should measure with rects (or a layout API that ignores
offsetParent), never raw `offsetTop`.

### F16 — A sentinel that isn't in-range breaks a binary search's precondition
`buildBlockStarts` marked word-less blocks with `Number.MAX_SAFE_INTEGER`. The
block lookup is a **binary search**, which requires a sorted (non-decreasing)
array — and a `MAX` dropped between real starts violates that, so a single
mid-document empty block silently corrupts every lookup after it (a second,
latent desync path in PDF/EPUB, which *can* emit empty blocks; Markdown guards
against them with `if (text)`). Fix: give an empty block the **next** word's id
(the running count), keeping the array non-decreasing; the empty block then ties
with the following real block and never wins the search (ties resolve to the
later index).
*Verification:* ✅ (headless: monotonic starts with empty blocks in mid/leading/
trailing positions; every index resolves to its true owner; the old sentinel
demonstrated to misfire on `[0, MAX, 1]` where the fix is correct). → Lesson: a
sentinel must respect the invariant of the algorithm that consumes it — for a
sorted-array search, "absent" has to be encoded in-range, not as a spike.
*Code fix completed — fix/reader-use-shared-blocks (issue #16):* Reader.tsx
previously maintained a separate inline copy of the block-start computation still
carrying `MAX_SAFE_INTEGER`. That copy is deleted; Reader now imports
`buildBlockStarts` / `blockIndexForWord` from `model/blocks.ts`. Equivalence
on all-non-empty input verified headlessly (27/27); empty-block misbehavior of
the old sentinel also demonstrated (word 3 mapped to block 0 instead of 2 on
`[0, MAX, 3]` input). tag: check-unit / build

---

## Documentation integrity

### F11 — "No drift" is a manual read-through, not automated verification
The docs (ARCHITECTURE / DECISIONS / PROJECT_CONTEXT / FINDINGS) were maintained
**inline each milestone** — written alongside the code they describe, as part of
"done" (D33). The M7 audit re-read the claim-dense source (`usePacer.ts`,
`Reader.tsx`, `App.tsx`, the modes) against the docs and found **no drift**.

**But that audit was a human read-through, not an automated doc-vs-code check.**
There is no test that fails when a doc statement and the code diverge. So "no
drift" means "a careful reader didn't spot a mismatch," not "proven consistent."
*Verification:* 📐 (manual cross-read) + 👁 (author review) — **not** ✅.

→ For the port: **re-verify any specific claim you're about to bet on** against
the current source rather than trusting "no drift" blindly. The highest-value
things to re-confirm are the ones tagged ❓/📐 elsewhere in this file (pdf.js
extraction, perf decoupling, the ORP non-drift geometry), since those were never
machine-checked even once. The ✅ items have at least one deterministic test
behind them; the doc consistency itself does not.

---

### F17 — `String.fromCodePoint` throws for code points above U+10FFFF; `Number.isFinite` does not guard the range ✅

`Number.isFinite` accepts any finite number, including values above `0x10FFFF`.
`parseInt("110000", 16)` returns `1114112`, which is finite but exceeds the Unicode
scalar-value ceiling (`0x10FFFF` = 1114111). `String.fromCodePoint(1114112)` throws
`RangeError: Invalid code point 1114112`, which propagates uncaught out of
`decodeEntities` → `stripTags` → `xhtmlToBlocks` → `parseEpub`, aborting the entire
book parse. One malformed entity anywhere in any chapter of the book was sufficient
to make the whole file unreadable.

The correct guard is `Number.isFinite(code) && code >= 0 && code <= 0x10FFFF`.
Surrogates (0xD800–0xDFFF) lie within [0, 0x10FFFF] and do NOT cause a throw; they
pass through as lone-surrogate characters (technically invalid UTF-16, but not
crash-inducing). Named entities use a separate code path and are unaffected.

*Verified:* ✅ headless check (esbuild → node):
- `decodeEntities('&#x41;')` → `"A"`, `decodeEntities('&#233;')` → `"é"` (valid entities still decode)
- `decodeEntities('before &#x110000; after')` → `"before &#x110000; after"` (no throw, raw fallback)
- `decodeEntities('&#xD800;')` → decoded char (surrogate: no throw)
- `decodeEntities('&amp;')` → `"&"` (named entity unaffected)
- Full `parseEpub` of a two-chapter EPUB containing `&#x110000;` in chapter 1 body:
  returns both chapters' text; raw entity text present in output; parse does not throw.
  Build clean. (2026-07-07, fix/epub-entity-range-guard)

### F18 — pdfjs-dist v6: `loadingTask.destroy()` is the correct cleanup; the resolved `PDFDocumentProxy` has no `.destroy()` 🧪

`pdfjs.getDocument({ data })` returns a `PDFDocumentLoadingTask`. The original
code immediately chained `.promise` on it, discarding the task reference:

```typescript
const pdf = await pdfjs.getDocument({ data }).promise; // loadingTask lost
```

This means `loadingTask.destroy()` — which terminates the worker and frees all
associated resources — was never reachable on any exit path (normal return,
scanned-PDF throw, or any intermediate `await` throw).

API confirmed from `pdfjs-dist/types/src/display/api.d.ts` (v6.0.227):
- `PDFDocumentLoadingTask.destroy(): Promise<void>` — "Abort all network
  requests and destroy the worker." This is the correct and only cleanup needed.
- `PDFDocumentProxy.cleanup(keepLoadedFonts?)` — clears internal caches but
  does NOT terminate the worker. Not needed when `loadingTask.destroy()` is
  called, because `destroy()` subsumes it.
- `PDFDocumentProxy` has no `.destroy()` method; that's on `PDFPageProxy` and
  `PDFWorker` only.

`destroy()` returns `Promise<void>` and must be awaited in the `finally` block.
Awaiting in `finally` means the return value (or throw) is held until worker
shutdown completes; the delay is negligible.

**Open question flagged for browser verification:** whether `loadingTask.destroy()`
is safe when `loadingTask.promise` was rejected before the document loaded
(e.g., corrupt/truncated PDF). The `destroyed: boolean` property on the task
and the cancellation design of pdfjs suggest it is, but this requires a browser
test to confirm (see D66 browser test procedure).

*Verified:* 🧪 Build-verified — `tsc -b` + `vite build` clean after the fix;
TypeScript confirmed that `loadingTask.destroy()` exists on `PDFDocumentLoadingTask`
and that `await` on its `Promise<void>` return is correctly typed. Behavioral
regression (normal PDF parses correctly, scanned PDF throws SCANNED_MESSAGE) is
**not headlessly verifiable** because pdfjs requires browser Worker/canvas APIs.
The leak fix itself is verified by code inspection + browser test.
(2026-07-07, fix/pdfjs-destroy-cleanup)

### F19 — Virtualizer remounts spans without imperative classes; re-apply must be driven by `items`, not React props 🧪

`@tanstack/react-virtual` maintains a windowed item set: blocks that scroll out of
the visible range are unmounted and their DOM nodes destroyed; blocks that scroll
back in are freshly mounted. Fresh spans carry no `classList` entries —
`pacer-lead` and `pacer-chunk` classes applied by the modes' imperative `apply()`
are silently lost.

The existing `useLayoutEffect` hooks in `FlowingHighlight` and `ChunkHighlight` did
not observe this remount: their deps were `[document, pacer, apply]` and
`[bionic, settings, layoutKey, pacer, apply]`. None of those change when the user
scrolls. So pause → scroll active block off-screen → scroll back produced blank
chunk highlights (entire visible highlight gone) and missing lead-word tints until
the next pacer tick re-applied them.

**Fix:** a `useLayoutEffect([items])` inside `Reader` calls an `onRangeChange`
callback immediately after any virtualizer-driven commit. The callback (passed from
each mode) reads `pacer.indexRef.current` imperatively and calls `apply()` — no
React state, no re-render, no flash. The callback is `useCallback`-stable (empty
transitive deps), so `Reader`'s `memo` is not broken. The `items` dep is only
updated on scroll events, never on pacer ticks — the per-tick invariant is
preserved.

The `pacer-overlay` div (FlowingHighlight's gliding box) is a direct child of
`reader-content`, outside the virtual item list. Its `transform`/`opacity` survive
virtualizer re-renders unchanged — not affected by this bug.
RSVP mode renders words in a fixed overlay element, not in Reader's virtual spans —
also not affected.

*What headless check proved:* `apply()`'s index-walk logic (`firstWordlikeFrom`
loops) computes the correct word set for a given start index and chunk/lead size.
Confirmed by Node.js script against a synthetic word list. ✓ build-clean after fix.

*What requires browser test:* whether the re-applied highlight is visually present
after a scroll cycle when paused. The DOM mutation is correct by construction, but
the interaction between virtualizer commit timing, `useLayoutEffect` sequencing, and
the browser's paint pipeline cannot be confirmed headlessly.
(2026-07-07, fix/highlight-reapply-on-rerender)

### F21 — `onRangeChange` firing on manual scroll fought the user (regression from F19's fix) 🧪📐

F19's fix wired `Reader`'s `useLayoutEffect([items])` to call `onRangeChange`
whenever the virtualizer's mounted item set changes — but that trigger fires on
**any** scroll of `.reader-pane`, not just pacer-driven ones. In flowing and
chunk mode, `onRangeChange` called the *same* `apply()` used by the pacer tick,
and `apply()` bundled two responsibilities: reapplying `pacer-lead`/`pacer-chunk`
classes (F19's actual fix) **and** auto-centering the scroll (D24's 40% band,
plus an off-window `scrollToWord` recovery). So a manual two-finger scroll or
scrollbar drag — which is exactly what changes the virtualizer's mounted range —
re-triggered the auto-center and snapped the pane back to `pacer.indexRef.current`.
This happened identically whether the pacer was playing, paused, or stopped:
nothing in the chain ever read `pacer.playing` (confirmed by grep — it's read in
exactly one place, the play/pause button label).

**Fix:** split `apply()`'s two responsibilities in `FlowingHighlight.tsx` and
`ChunkHighlight.tsx`. `updateLeadClasses`/`updateChunkClasses` do only the
class-list bookkeeping (no scroll calls) and are now the *entire* body of
`onRangeChange`. `apply()` keeps the scroll-centering (`scrollWordToBand`,
`scrollToWord`) but is now reached only from genuinely pacer-driven paths:
`pacer.subscribe`'s tick callback (also covers `seek`/`restart`, which route
through the same `commit()` → listener notification), the document-change
reset effect, the bionic/settings/layoutKey relayout effect, and the resize
effect. None of those fire from a scroll event, so a manual scroll can no
longer reach `scrollWordToBand` or `scrollToWord` at all — verified statically
by grep: both scroll-moving calls appear only inside `apply()`, and
`onRangeChange`'s body (in both files) calls only the class-update helper.

The overlay-position update (`FlowingHighlight`'s gliding box) was dropped from
the class-only path entirely, not just gated — per F19, the overlay is a plain
`.reader-content` child outside the virtual item list, so it's already immune
to virtualizer remounts and never needed re-positioning on `onRangeChange`.

*What headless check proved:* the index-selection logic shared between
`apply()` and the class-only helpers (`firstWordlikeFrom` walk for lead words /
chunk membership) produces identical, idempotent results across repeated calls
at the same index — run against a synthetic word list with mixed
wordlike/non-wordlike tokens and end-of-list truncation. This is the invariant
the split depends on: both callers must agree on which spans get the class.

*What requires browser testing:* whether a real two-finger scroll / scrollbar
drag no longer snaps back (playing and paused, both modes); whether the #17
behavior (lead/chunk classes surviving a scroll-away-and-back) still holds now
that the class path is decoupled from the scroll path; whether click-to-seek
and arrow-key seek still recenter once. See the browser test procedure in the
PR description / issue thread.
(2026-07-08, fix/reader-manual-scroll)

---

### F22 — Minimal HUD + space-bar pause trap (issue #38): predicate ✅, build 🧪, everything visual/interactive ❓ — first-round ❓ items confirmed broken by browser testing, fixed, see F23

**Revised after browser testing.** The first pass of this entry reported 9
predicate checks passing and listed the visual/interactive behaviors as
"genuinely unverified, not just under-tested." Browser testing then found
that four of the specific things flagged unverified below were in fact
**broken** — not edge cases, straightforward reproductions on first try. This
is worth recording plainly: the ❓ tagging methodology worked exactly as
intended (it correctly refused to claim confidence the team didn't have), and
the bugs it declined to rule out were real. See F23 for the diagnoses and
fixes. This entry is left otherwise intact as the honest record of what was
and wasn't known *before* that testing pass; F23 is the record of what was
found *by* it.

**The Space-routing predicate was ✅ unit-verified against the real shipped
code** (esbuild-bundled `src/pacer/keyboard.ts`, not a hand-copied
restatement), but the predicate itself was wrong in a way the original 9
checks didn't catch — they tested the cases the design *intended* to cover
(number/range toggle, button/select/textarea/text-input yield) without a
case for "an element that's none of the above" (a clicked word span,
`<body>`). The gap was in what the test suite *didn't* think to ask, not in
whether the tested assertions were true — a reminder that a green suite only
proves what it actually exercises. The revised predicate and its 13-check
suite (now including a bare `SPAN`, `BODY`, and a same-tag-different-attribute
case for the Play button) are described in F23.

**`npm run build` (`tsc -b` + `vite build`) was 🧪 clean** on the first pass
and remains 🧪 clean after the fixes — expected, since none of the four bugs
were type errors (a disabled-by-`atEnd` button, a CSS clipping bug, and an
overly-broad runtime predicate all typecheck fine).

**Confirmed broken by browser testing (see F23 for full diagnosis):**
- Bug #1: HUD collapse CSS clipped `.reader-toolbar-controls` (hiding
  ThemeSelector) even at rest, not just while collapsing — the "HUD collapse
  smoothness" item below undersold this; the real failure was permanent
  clipping, not just an animation quality question.
- Bug #2: Space after a click-to-seek did not toggle the pacer and the page
  scrolled instead — the "reported repro" and the general Space-routing
  design both had this exact gap and it was real.
- Bug #3: Space toggled the Presets panel / Mode dropdown instead of the
  pacer while either was focused — the "everything works except the tested
  cases" gap manifested exactly as this file predicted it might.
- Bug #4: the RSVP Play/Pause button (click **and** Space) stopped responding
  after a context-strip seek near the document's end — not a new #38
  regression; a pre-existing `atEnd`-disables-Play interaction with no visual
  disabled state, surfaced by this round of testing.

**Still ❓ — not yet observed, unaffected by this round's fixes:**
- Paused→play from a focused WPM field via Space (still expected to work per
  the predicate design; not specifically re-tested).
- No double-toggle when the Play/Pause button has focus and Space is pressed
  — now backed by a *more* precise headless check (marker-attribute match,
  not tag-name match) than the first pass had, but still not watched in a
  real browser.
- Typing a literal space into the PresetsPanel save/rename name field still
  inserts a space rather than pausing the pacer.
- HUD collapse smoothness for rows shorter than their (now larger, 40rem)
  ceiling — the tail-snap caveat from D87/D89 is more pronounced now that the
  ceilings were raised to fix bug #1; whether it reads as acceptable is still
  unconfirmed.
- The progress bar/% staying visually continuous across the play/pause
  boundary; RSVP's centered word gliding rather than jumping; flowing/chunk
  text not re-wrapping and `scrollTop` being preserved; arrow-key seek and
  click-to-seek continuing to work while the HUD is collapsed — all unchanged
  from the first pass, still inferences from code structure, not observations.
- The visible `:disabled` styling (bug #4's fix) actually being legible/
  reads-as-disabled in the browser, across all four themes.

(2026-07-09, feature/reading-hud-and-spacebar-fix)

---

### F23 — Issue #38 QA-round fixes: root causes and what's actually verified ✅🧪❓

Four bugs + two feature changes from the first browser-testing round (see
F22). Root causes were traced through the actual source before any fix was
written, per instruction — none of these are guesses.

**Bug #1 root cause (✅ code-verified by inspection, not just reasoned):** the
first-pass HUD collapse CSS added `overflow: hidden; max-height: 6rem` to
`.reader-toolbar-controls` etc. as an **unconditional base rule** — not
scoped under `.app-top.playing` — so it clipped content whenever the row's
natural height exceeded 6rem, regardless of play state. Settings (bionic
toggle + 3 chips + natural-pauses checkbox + 2 sliders) plus ThemeSelector's
chips routinely wrap past 6rem; ThemeSelector, rendered last in the flex-wrap
order, was the part that vanished. Fix: raised the resting ceilings to 40rem
(4rem for `.kbd-hint`). See D89 for the full writeup.

**Bugs #2 and #3 root cause (✅ traced through `Reader.tsx`, not assumed):**
confirmed by reading `WordSpan`/`handleClick` in `Reader.tsx` directly — the
word `<span>` has no `tabIndex`, no `.focus()` call, and `handleClick` never
calls `stopPropagation()`. A click on a non-focusable element drops browser
focus to `<body>`. The (bug-#2-causing) predicate defaulted to "yield" for
any non-`INPUT` element, including `<body>`, so the app's Space handler
returned without `preventDefault()` and the browser's native Space-scroll
fired. The same default-yield logic separately caused bug #3 by yielding for
every `BUTTON`/`SELECT`, not just Play/Pause. Fix: the predicate now defaults
to *toggle* and yields only for an enumerated set (Play/Pause button by
marker attribute, `TEXTAREA`, and text/checkbox/radio/file `INPUT`s). See D89.

**Bug #4 root cause (✅ code-verified, including confirming it predates this
branch via `git show HEAD:src/pacer/PacerControls.tsx`):** `disabled=
{pacer.atEnd && !pacer.playing}` on the Play/Pause button, combined with
`usePacer`'s `atEnd` (true whenever no word-like token remains after the
current index) and the ~150-word built-in sample document, whose short length
makes the RSVP context strip's buffered window frequently include — and make
clickable — the document's actual last word. Seeking there sets `atEnd =
true`, natively disabling the button (blocks click *and* keyboard) and making
`pacer.toggle()`'s own internal guard refuse to start playing via Space too.
Confirmed **not** a #38 regression (the `disabled` line predates this
branch). The button gave no visual indication of being disabled — `button {
color: #fff; background: var(--accent); }` is unconditional and no
`:disabled` rule existed — which is why it read as "broken" rather than
"expectedly inert at the end." Fix scope was deliberately narrow: added
visible `:disabled` styling; did **not** change the underlying "can't play
past the last word" behavior, since that's a pacer-semantics product decision
(e.g. "should Play at the end auto-restart?") that wasn't made unilaterally —
flagged as an open question in the summary handed back for review.
**Resolved 2026-07-10 — see DECISIONS.md D96: kept disabled at end-of-document,
no auto-restart; ↺ Restart is the explicit replay gesture.**

**Headless ✅ (13/13, up from 9/9 — real bundled `src/pacer/keyboard.ts`, plus
`pacerToggleButtonProps` imported from the same bundle rather than
hand-copied so the test can construct a "real" marked Play button):**
number/range inputs, every button *except* the marked Play/Pause button,
`SELECT`, a bare `SPAN`, `BODY`, and `null` → toggle; the marked Play/Pause
button, `TEXTAREA`, text/checkbox/radio/file inputs → yield. Output
reproduced in the handoff summary.

**🧪 Build:** `npm run build` (`tsc -b` + `vite build`) clean after all six
changes.

**Still ❓ — this round didn't add browser coverage, only code fixes:**
- All four bugs' *fixes* — none were watched working in an actual browser
  yet, only reasoned from corrected code + the headless predicate proof.
- Whether 40rem is *actually* large enough for `.presets-panel` with many
  user presets expanded across all four groups — raised from 32rem
  proactively but not measured against real rendered content, same class of
  error that caused bug #1 in the first place (flagged so this doesn't repeat
  silently).
- Whether the visible `:disabled` styling reads clearly across all four
  themes (light/sepia/dark/dim) — `opacity: 0.5` is theme-agnostic by
  construction but was not checked against each theme's actual contrast.
- The open product question from bug #4: should pressing Play/Space at
  `atEnd` auto-restart, or is "disabled until you seek back or hit Restart"
  the intended behavior? Left as-is pending explicit direction.
  **Resolved 2026-07-10 — see DECISIONS.md D96 (kept disabled; no auto-restart).**

(2026-07-09, feature/reading-hud-and-spacebar-fix, QA-round fixes)

---

### F24 — Markdown parser corruption (issues #41, #42): both fixes ✅ unit-verified against the real bundled parser

Found by adversarial audit (2026-07-09), not a user repro. Two independent
corruption mechanisms in `src/parsers/markdown.ts`, fixed as two separate
commits (D90, D91) and proven against the actual shipped `parseMarkdown` via
`src/parsers/headless-test.mjs` (esbuild-bundles `markdown.ts` — including its
imports from `model/tokenize.ts`/`model/types.ts` — and imports the real
output, same pattern as `pacer/headless-test.mjs`).

**#41 (token deletion):** a hard-wrapped sentence-initial number was
misread as an ordered-list marker, deleting the number and incorrectly
splitting the paragraph. Fixed by restricting paragraph-interruption to
bullets and ordered markers starting at 1 (D90).

**#42 (character mangling within a token):** intraword underscores,
whitespace-adjacent asterisks, and escape-order were all corrupted by
`stripInline`'s lack of CommonMark flanking rules and its escape-last
ordering. Fixed via per-delimiter flanking regexes and NUL-delimited
escape placeholders resolved first (D91).

*Verified:* ✅ 15/15 headless checks — 6 for #41 (the repro case, a
paragraph-initial non-1 number, genuine ordered/bullet lists, an ordered list
correctly interrupting a paragraph at 1, and a list legitimately starting at a
number other than 1) and 9 for #42 (the three original repro cases, a combined
literal-underscore + escaped-asterisk case, and regressions for `**bold**`,
`*italic*`, `_italic_`, `__bold__`, and mixed bold+italic in one sentence). 🧪
`npm run build` (`tsc -b && vite build`) clean after both commits.

*Not verified — same caveat as every other parser entry in this file (F6/F7):*
real-world Markdown files (as opposed to the synthetic repro strings above)
may still combine these constructs in ways not covered by the 15 cases, and
the fix has not been exercised against an actual `.md`/`.txt` file loaded
through the browser UI.

(2026-07-09, fix/markdown-parser-corruption)

---

### F25 — Hermes DOES support the four lookbehind regexes from #42/F24 — empirically compiled and executed against real Hermes binaries ✅

Issue #54 flagged that `stripInline`'s four lookbehind regexes
(`BOLD_UNDERSCORE`, `ITALIC_UNDERSCORE`, `BOLD_ASTERISK`, `ITALIC_ASTERISK` —
D91/F24) were added without confirming Hermes (React Native's default JS
engine) actually supports the `(?<!...)`/`(?<=...)` syntax, despite
`markdown.ts` being tagged `[PORTABLE]` in ARCHITECTURE.md. Hermes's own docs
claim ES9 lookbehind support, but that's a documentation claim, not a
verified fact for this codebase — this entry closes that gap with an actual
execution, not a lookup.

**What was tested.** The exact four patterns, copied verbatim from
`src/parsers/markdown.ts` lines 62/63/70/71:
```js
var BOLD_UNDERSCORE = /(?<!\w)__(.+?)__(?!\w)/g;
var ITALIC_UNDERSCORE = /(?<!\w)_(.+?)_(?!\w)/g;
var BOLD_ASTERISK = /\*\*(?!\s)(.+?)(?<!\s)\*\*/g;
var ITALIC_ASTERISK = /\*(?!\s)(.+?)(?<!\s)\*/g;
```
run against 6 functional checks mirroring the #42 repro cases (intraword
underscore left untouched, whitespace-flanked asterisk left untouched, plus
4 "real emphasis still strips" regression cases) — see
`/private/tmp/.../scratchpad/hermes-test/lookbehind-test.js` for the full
script (not committed to the repo; a scratch artifact of this verification).

**Two independent real Hermes binaries, not a simulation:**

1. **`hermes-engine@0.11.0`** (npm, `osx-bin/hermesc`) — Hermes release
   0.11.0, HBC bytecode version 84. This build has no linked VM (`-exec` is
   listed in `--help` but errors "`hermesc does not support -exec`"), so it
   was used in **compile-only** mode:
   ```
   $ node_modules/hermes-engine/osx-bin/hermesc -emit-binary -out lookbehind-test.hbc lookbehind-test.js
   $ echo "EXIT_CODE:$?"
   EXIT_CODE:0
   $ file lookbehind-test.hbc
   lookbehind-test.hbc: Hermes JavaScript bytecode, version 84
   ```
   No SyntaxError; valid HBC bytecode emitted. This directly answers the
   issue's core risk ("would throw a SyntaxError at regex compile time").

2. **`facebook/hermes` GitHub release `v0.13.0` (tag `rn/0.75-stable`,
   asset `hermes-cli-darwin.tar.gz`)** — internally reports release 0.12.0,
   HBC bytecode version 96, "Unicode RegExp Property Escapes" feature flag.
   This release ships a real `hermes` VM binary (not just `hermesc`), so the
   script was **actually executed**, not just compiled:
   ```
   $ hermes-cli-v013/hermes lookbehind-test.js
   PASS intraword underscore untouched: "snake_case_name"
   PASS whitespace-flanked asterisk untouched: "3 * 4 * 5"
   PASS real italic underscore strips: "italic"
   PASS real bold underscore strips: "bold"
   PASS real bold asterisk strips: "bold"
   PASS real italic asterisk strips: "italic"
   ALL_CHECKS_PASSED
   $ echo "EXIT_CODE:$?"
   EXIT_CODE:0
   ```
   All 6 checks passed with output identical to the Node/V8 behavior
   documented in F24 — i.e. not just "didn't crash," but **matching
   semantics**.

**Negative control (methodology check).** To rule out the compiler silently
swallowing errors, a deliberately invalid script (`var x = 1 +;`) was run
through both binaries and correctly rejected:
```
$ hermes-cli-v013/hermes negative-control.js
negative-control.js:1:12: error: invalid expression
var x = 1 +;
           ^
EXIT_CODE:2
```
Confirms the clean exit codes above reflect real parsing success, not a
no-op.

**Conclusion:** lookbehind assertions are supported by Hermes at both the
parse/compile stage and the runtime/execution stage, across two independently
sourced real binaries spanning HBC bytecode versions 84–96. `markdown.ts`
(D91's four regexes) requires **no rewrite**; the `[PORTABLE]` tag in
ARCHITECTURE.md stands as-is. `src/parsers/markdown.ts` was not modified by
this investigation.

**What remains open, honestly:** neither binary tested is *guaranteed* to be
the exact Hermes version that ships when issue #7 (Android port) actually
happens — issue #7 has no RN version pinned yet, and `hermes-engine` on npm
is itself deprecated (superseded by Hermes bundling directly inside
`react-native`). What this *does* establish is that lookbehind has been
supported across a real span of released Hermes versions (bytecode 84 → 96,
i.e. not a one-version fluke), which is strong evidence but not a substitute
for a real device/Metro-bundler smoke test once issue #7's RN version is
chosen. That real-device check remains an explicit pre-port dependency, same
as the other engine-specific ❓ items already in this file (F6 pdf.js, F7
EPUB variety).

(2026-07-10, fix/54-hermes-lookbehind-verification)

---

### F26 — Resume drift-detection → percent fallback: pure mapping ✅ unit-verified; UI/pacer path ❓ unwatched

Issue #48 (adversarial-audit finding, not a user repro): `BookRecord.wordCount`
was captured on save but never compared to the live `words.length` on restore.
The fix (`handleResume` in `App.tsx`, D92) now branches on that comparison —
non-drift resumes at the saved `wordIndex` unchanged; on drift it recomputes
`round(percent · (words.length − 1))`, then clamps to `[0, words.length − 1]`
on both paths.

**What was actually run, not just reasoned about:** 4 new Node.js checks
(#11–14) appended to the existing `src/storage/headless-test.mjs` (which
already covers the reading-position persistence invariants — see F20; the
suite is now 14 checks total, run via `node src/storage/headless-test.mjs`).
The pure mapping was **inlined into the test file** the same way the rest of
that file already inlines `readingPosition.ts`'s logic (per that file's own
header comment: a `.mjs` script can't import the `.ts` source without a build
step) — `resolveResumeTarget(recordWordCount, snapshot, currentWordCount)`
mirrors `handleResume`'s branch-and-clamp logic verbatim:

11. **No drift** (`recordWordCount === currentWordCount`) → target is the raw
    `snapshot.wordIndex`, unchanged (byte-for-byte parity with pre-#48
    behavior, per the task's own constraint).
12. **Drift** (`recordWordCount !== currentWordCount`) → target is
    `round(percent · (len − 1))`, and is asserted **not equal** to the stale
    raw `wordIndex` in the test case (a 10,000-word save re-parsed to 8,000
    words at 42 % lands at word 3360, not the stale 4200).
13. **Clamp, low end** — a drifted record with `percent: 0` resolves to `0`.
14. **Clamp, high end, both paths** — a drifted record with `percent: 1`
    resolves to `len - 1`; separately, a deliberately corrupted snapshot
    (`percent: 1.5`, `wordIndex: 99999` — values that should never occur from
    real `saveReadingPosition` output, but guard against a hand-edited or
    future-format localStorage record) is clamped to `len - 1` on **both** the
    drift and non-drift branches, confirming the final
    `Math.max(0, Math.min(target, len - 1))` clamp is unconditional and not
    accidentally skipped on the non-drift path.

*Verified:* ✅ 14/14 headless (10 pre-existing + 4 new). 🧪 `npm run build`
(`tsc -b && vite build`) clean after the `App.tsx`/`ResumePrompt.tsx` changes
(the `onResume` callback signature changed from a bare `wordIndex: number` to
the full `PositionSnapshot`, since the drift branch needs `percent`, which a
bare index can't carry).

**Not verified — same class of gap as F20's own list:** whether a real
tokenization drift (e.g. reloading a book after one of the D90/D91 markdown
fixes actually shipped) triggers the resume-prompt UI and lands the pacer at
the expected word in a live browser; whether the `console.info` dev log
actually fires and reads sensibly in a real console; whether `pacer.seek()`
correctly applies the recomputed index across all three modes. These require
the same browser pass F20 already flagged as outstanding for the rest of the
reading-position feature — this fix rides on that same unverified surface,
it doesn't add a new one.

(2026-07-10, fix/resume-wordcount-drift)

---

### F27 — EPUB attr() name-boundary fix: repro + manifest-miss warning 🧪 headless-verified

Issue #43 (adversarial-audit finding, not a user repro): `attr(tag, name)`'s
regex matched `name` as a bare substring with no boundary check, so a decoy
attribute sharing a suffix with the real one (`data-id` vs `id`) silently
resolved to the wrong value — `manifest.get(idref)` then missed and the
`itemref` entry was dropped by a bare `continue` with zero warning, a whole
chapter vanishing from an otherwise well-formed OPF. See D93 for the fix
(non-capturing `(?:^|[\s"'])` boundary prefix + a `console.warn` on the
manifest-miss branch, mirroring D63's message shape).

**What was actually run, not just reasoned about:** a 5-check Node.js script
(esbuild-bundles the real `src/parsers/epubStructure.ts` — which has no
project-internal imports, so it bundles standalone — and imports the actual
compiled `parseOpfSpine`, not a hand-copied restatement; same pattern as
`src/parsers/headless-test.mjs` for #41/#42, run temporarily from inside the
repo so Node resolves `esbuild` from `node_modules`, then deleted — not
committed):

1. **#43 repro** — an OPF with `<item data-id="wrong" id="ch1"
   href="c1.xhtml">` plus a matching `<itemref idref="ch1">` resolves to
   `["OEBPS/c1.xhtml"]` (previously would have resolved to `[]`, the
   manifest keyed under the wrong id).
2. **Regression** — a normal two-chapter manifest with no decoy attributes
   still resolves both hrefs in spine order.
3. **Single-quoted attributes** — the same decoy-shadowing repro with
   single-quoted attribute values resolves correctly, confirming the added
   non-capturing boundary group didn't shift `m[2]`/`m[3]` extraction.
4. **Manifest-miss, resolvable entries preserved** — a spine with one valid
   `idref` and one `idref` absent from the manifest still returns the valid
   chapter's href.
5. **Manifest-miss, warning fires** — `console.warn` (temporarily spied) is
   called exactly once with `[epub] manifest item not found for idref:
   "missing-chapter" — chapter skipped`, matching the D63-mirrored format.

All 5 passed. 🧪 `npm run build` (`tsc -b && vite build`) clean after the fix
— 71 modules transformed, no type errors.

**Not verified — same class of gap as F7 (EPUB parsing generally):** this
confirms the fix against synthetic OPF strings covering the issue's exact
repro shape; it has not been exercised against a real-world EPUB file loaded
through the browser UI, and the broader EPUB-variety caveat in F7 (only
`h1–h6`/`p`/`li`/`blockquote` captured, DRM unsupported, malformed markup may
still misparse in other ways) is unchanged by this fix.

(2026-07-10, fix/epub-attr-name-boundary)

---

### F28 — EPUB container.xml full-path decode gap: same D62/#11 root cause recurring at a second call site ✅ headless-verified

Issue #47 (adversarial-audit finding, not a user repro): D62's fix for #11
applied `safeDecodeHref` to spine item hrefs in `parseOpfSpine`
(`epubStructure.ts:99`), but `parseContainerOpfPath` (`epubStructure.ts:68-71`)
— which extracts `container.xml`'s `full-path` attribute pointing at the OPF
itself — returned the raw, still-percent-encoded attribute value. That value
flows straight into `epub.ts:29-32`'s `zip.file(opfPath)` lookup with no
decode step in between, so a percent-encoded `full-path` (e.g.
`full-path="OEBPS%2Fcontent.opf"`, or one containing `%20`) failed the zip
lookup and threw `"Not a valid EPUB — could not locate the package
document."` — the exact URI-decoding mismatch D62 fixed, just one call site
earlier in the pipeline (before the OPF is even read, rather than while
reading its manifest). Unlike #11, this fails loudly with a clear error
rather than silently dropping a chapter, which is why it was filed as a
lower-severity issue.

**Fix:** `parseContainerOpfPath` now wraps the extracted `full-path` attribute
in the existing `safeDecodeHref` before returning it — no changes to
`safeDecodeHref` itself or to `parseOpfSpine`'s existing decode call.

**What was actually run, not just reasoned about:** a temporary Node script
(esbuild-bundles the real `src/parsers/epub.ts` — which pulls in
`epubStructure.ts` and `model/tokenize.ts` — and imports the actual compiled
`parseEpub`, not a hand-copied restatement; run temporarily from inside the
repo at `src/parsers/.tmp-verify-47.mjs` so Node resolves `esbuild`/`jszip`
from `node_modules`, then deleted — not committed, same pattern F27 used).
Unlike F27 (which called `parseOpfSpine` directly), this test builds a real
in-memory EPUB via `JSZip` and drives `parseEpub()` end-to-end, so it
exercises the actual `zip.file(opfPath)` call site named in the issue, not
just the pure-function return value:

1. **`%2F`-encoded full-path** (`full-path="OEBPS%2Fcontent.opf"`, OPF stored
   in the zip at the literal decoded path `OEBPS/content.opf`) — `parseEpub`
   resolves the OPF and returns the expected single-paragraph document
   (previously would have thrown "could not locate the package document").
2. **`%20`-encoded (space) full-path** (`full-path="OEBPS/My%20Book.opf"`,
   stored at `OEBPS/My Book.opf`) — resolves correctly.
3. **Regression** — a plain, non-encoded `full-path` still resolves.

All 3 passed. 🧪 `npm run build` (`tsc -b && vite build`) clean after the fix —
71 modules transformed, no type errors.

**Not verified — same caveat as F27/F7 (EPUB parsing generally):** this
confirms the fix against synthetic container.xml/OPF strings covering the
issue's exact repro shape; it has not been exercised against a real-world
EPUB file loaded through the browser UI, and the broader EPUB-variety caveat
in F7 (only `h1–h6`/`p`/`li`/`blockquote` captured, DRM unsupported, malformed
markup may still misparse in other ways) is unchanged by this fix.

(2026-07-10, fix/epub-container-opf-decode)

---

### F29 — EPUB unclosed `<p>` yields zero text silently: strict-pass regex needs a matching close tag; additive fallback recovers 🧪 headless-verified

Issue #14 (HIGH; flagged independently by two audit passes, not a user repro):
`xhtmlToBlocks`'s block regex is backreferenced —
`/<(h[1-6]|p|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi` — so it matches only a
block tag that has a **matching closing tag**. Valid-HTML/invalid-XHTML
chapters that omit `</p>` (browsers accept this; EPUB technically requires
well-formed XHTML but real-world files violate it) match **zero** blocks, and
the chapter's entire text is silently dropped — or the whole book's, if every
chapter is affected. Reproduced headlessly before the fix: a body of 5
unclosed `<p>` paragraphs → **0 blocks** (matching the issue's proven "4000
paragraphs → 0").

**Root cause:** the backreference `<\/\1>` is load-bearing for the strict
pass's nested-child de-duplication (an outer `<li>` consuming an inner `<p>` so
a paragraph isn't emitted twice), but it also makes a closing tag mandatory —
there's no partial match for an opener with no closer.

**Fix (additive, strict pass unchanged):** after the strict pass, if it
produced **0** blocks and `body.trim()` is non-empty, run a second
`xhtmlToBlocksFallback` pass that splits on block-level *opening* tags
(`/<(h[1-6]|p|li|blockquote)\b[^>]*>/gi`) and takes the text from each opener up
to the next opener (or end of body) as that block's content, stripped via the
same `stripTags`. If the fallback also yields 0 (e.g. content with no block
tags at all), current behavior is kept — no third pass. When the fallback
recovers a chapter it emits `console.warn('[epub] chapter "<href>" used
unclosed-tag fallback, recovered N block(s)')`, matching the existing `[epub]
…` warning style (D63/D93), so partial recovery is visible in logs instead of
throwing. This required threading the chapter `href` into `xhtmlToBlocks` as an
**optional** second parameter (`xhtmlToBlocks(html, href?)`) purely to name the
chapter in the warning — backward-compatible, and `epub.ts`'s single call site
now passes `href`. `reindexWords`/`Block.id` assignment in `epub.ts` is
untouched; this only changes how `RawBlock[]` is produced per chapter.

**Known gap, deliberately NOT fixed here (follow-up):** the fallback fires only
when the strict pass yields a **whole-chapter zero**. A body mixing at least one
properly-closed block tag with several unclosed ones keeps the strict pass's
`>0` result, so the fallback never runs and the unclosed tails are still
silently lost — same bug class, smaller (mid-chapter, partial) scope. This pass
is scoped to the issue's whole-chapter repro as written; partial mid-chapter
loss is left as a documented follow-up, not silently implied to be fixed. The
headless suite asserts this behavior is **unchanged** (a closed-then-unclosed
body still recovers only the closed block) so the gap is on record.

*Verified:* 🧪 12/12 headless checks in
`src/parsers/epubStructure-headless-test.mjs` (esbuild-bundles the real
`epubStructure.ts` and calls the actual `xhtmlToBlocks`, same pattern as the
markdown suite / F27): the #14 repro (5 unclosed `<p>` → 5 correct blocks, was
0; warning fires once), unclosed heading+paragraphs recovering with
type/level, the known-gap partial-loss case asserted unchanged (fallback does
not fire, no warning), empty/whitespace and no-block-tag bodies → 0 with no
warning, and a well-formed-XHTML regression (strict pass unchanged, nested
`li>p` not double-counted, fallback never triggered). 🧪 `npm run build`
(`tsc -b && vite build`) clean — 71 modules transformed, no type errors.

**Not verified — same caveat as F7/F27/F28 (EPUB parsing generally):** confirmed
against synthetic XHTML strings covering the repro shape; not exercised against
a real-world unclosed-tag EPUB loaded through the browser UI. The broader
EPUB-variety caveats in F7 are unchanged by this fix.

(2026-07-10, fix/epub-unclosed-tag-fallback)

---

### F30 — Chunk mode `atEnd` never flipped at end-of-document; `play()`/`toggle()` independently recomputed the same non-chunk-aware check 📐 **Reasoned through code trace, not test-verified**

Issue #18 (adversarial-audit finding, not a user repro): `atEnd` is the single
piece of state `PacerControls`'s `disabled={pacer.atEnd && !pacer.playing}` and
the App-level spacebar handler (via `pacer.toggle()`) both rely on to refuse
"play past the end." Before this fix, `atEnd` was flipped in exactly one place
— `commit(next)`, via `ended = firstWordlikeFrom(wordsRef.current, next + 1) ===
-1`. But `tick()` reaches genuine end-of-document through a **second, separate
branch** that never calls `commit()`: when the chunk-stepping loop's final
`firstWordlikeFrom(w, last + 1)` returns `-1` (no word-like token after the
current chunk), `tick()` just zeroes the accumulator and calls
`setPlaying(false)` — `atEnd`/`atEndRef` are untouched.

**Why this only manifests for `chunkSize` ≥ 2, matching the issue title
exactly:** `indexRef.current` (the value `commit()` last wrote) is the *first*
word of the displayed chunk, not the last. For a single-word final chunk
(`chunkSize` 1, i.e. flowing/RSVP, or a chunk mode where the document length
happens to leave exactly one word for the last step), that first word *is* the
last word of the document, so the **previous** `commit()` call already computed
`ended = true` correctly — `tick()`'s `next === -1` branch is reached afterward
but is a no-op replay of an already-correct state. For a final chunk holding
≥2 words, `indexRef.current` sits at the chunk's *start* — e.g. document has 10
word-like tokens (indices 0–9), `chunkSize = 2`, final committed index is 8
(chunk displays words 8–9). At that commit, `ended = firstWordlikeFrom(w, 8 + 1
= 9) === -1` evaluates to **false**, because word 9 exists and is word-like —
it's simply already part of the currently-displayed chunk, not literally "next."
So `atEnd` stays false through that commit, and the subsequent tick that
detects the *true* end (nothing after word 9) is exactly the branch that never
touched `atEnd` at all. Net effect: `atEnd` never becomes `true` for any
document whose final chunk has ≥2 words, matching the issue's proven repro.

**Second, related gap found while implementing the fix (not in the original
issue body, surfaced during review before editing):** `play()` and `toggle()`
each independently recomputed "is there something after the current index" via
`firstWordlikeFrom(wordsRef.current, indexRef.current + 1) !== -1` — the exact
same start-of-chunk-vs-end-of-chunk conflation described above, evaluated fresh
rather than read from the (now-fixed) `atEnd` state. Even after fixing `tick()`
alone, calling `toggle()` directly — which is what the spacebar handler does,
bypassing `PacerControls`'s `disabled` attribute on the Play/Pause button
entirely — would still have returned "not at end" for `indexRef.current = 8`
in the example above (word 9 exists and is word-like), permitting one more
silent dwell via the keyboard path even though the on-screen button was
correctly disabled.

**Fix (`src/pacer/usePacer.ts`):**
1. `tick()`'s `next === -1` branch now mirrors `commit()`'s guarded flip
   pattern: `if (!atEndRef.current) { atEndRef.current = true; setAtEnd(true);
   }`, placed alongside the existing `setPlaying(false)`. Guarded, not
   unconditional, so it costs nothing on repeated ticks once already flipped —
   preserves the "no re-render except on an actual boolean flip" hot-path rule.
2. `play()` and `toggle()` were changed to read `atEndRef.current` directly
   instead of recomputing `firstWordlikeFrom(...)` themselves — `play()`:
   `if (atEndRef.current) return;`; `toggle()`'s play-transition arm:
   `return !atEndRef.current;`. This makes `atEndRef` the single source of
   truth for "can playback proceed," which both the UI disabled-state and the
   keyboard path now agree with by construction, rather than by two
   independently-maintained checks that could (and did) drift apart.

**Why this doesn't regress `chunkSize = 1` (flowing/RSVP), traced explicitly:**
for size 1, `tick()`'s chunk-stepping loop (`for (let k = 1; k < size; k++)`)
never executes (`1 < 1` is false), so `last = indexRef.current` unchanged from
before this fix — identical behavior to pre-fix code on every step that isn't
the final one. On the step that reaches the document's actual last word,
`commit(next)` **is** called (that word is both `last` and the committed
`next`), and `commit()`'s own `ended` calculation already correctly evaluates
to `true` at that point (nothing exists after the last word) — so `atEndRef`
is already `true` by the time any later tick could reach the new
`next === -1` branch. The new code's guard (`if (!atEndRef.current)`) is then
a no-op there, not a double-fire — consistent with the task's constraint not
to touch `commit()`'s own (correct, for size 1) calculation. Since `play()`/
`toggle()` now read the same `atEndRef` that was already accurate for size 1
before this change (it was always kept in sync via `commit()` for that case),
their behavior for flowing/RSVP is unchanged, just cheaper (a ref read instead
of a recomputed loop).

*What was actually done, not just reasoned about:* `npm run build` (`tsc -b &&
vite build`) run and confirmed clean — 71 modules transformed, no type errors.
**No automated test was run or written** — this repo has no test runner
(no vitest/jest in `devDependencies`), and `usePacer` is a React hook (uses
`useState`/`useRef`/`useEffect`), unlike the pure-function modules the rest of
this file's esbuild-bundle-and-import pattern (F20/F24/F26/F27/F28/F29) targets
— that pattern doesn't extend to a hook without a React renderer + DOM (no
`react-test-renderer`/jsdom in this repo either). The chunk-stepping and
end-detection analysis above is a **manual trace through the actual edited
source** (line numbers and computed values as they'd execute for a concrete
10-word/`chunkSize=2` scenario), not a machine-executed check — tagged 📐, not
✅, per this file's own legend.

**Not verified — needs browser confirmation:** whether the Play/Pause button
visually disables at the correct moment for a real chunk-mode document with a
≥2-word final chunk; whether pressing spacebar at that point is now correctly
a no-op; whether Restart correctly re-enables Play afterward (expected —
`restart()` calls `commit()`, which recomputes `ended` from the restarted
position — but not watched in a browser).

(2026-07-10, fix/chunk-atend-issue-18)

---

### F31 — Single-word-like-token document permanently disables Play; `atEnd` alone can't distinguish "never started" from "reached the end" 📐 **Reasoned through code trace, not test-verified**

Issue #49 (adversarial-audit finding, proven via headless guard-logic check per
the issue body, not a user repro): `play()`/`toggle()` refuse to start whenever
`atEndRef.current` is `true`. `atEnd` is computed **purely from position** in
`commit()`: `ended = firstWordlikeFrom(wordsRef.current, next + 1) === -1` —
"is there a word-like token after this one." The word-list-change reset effect
calls `commit(Math.max(0, firstWordlikeFrom(words, 0)))` on mount, before Play
has ever been pressed. For a document with **exactly one** word-like token,
that initial `commit(0)` evaluates `firstWordlikeFrom(words, 1)` against a
1-length array — no token exists at or after index 1, so `ended = true`
immediately. `atEndRef.current` is `true` before the reader has done anything,
and `play()`'s `if (atEndRef.current) return;` guard (old code) then refuses to
start playback forever — a permanently greyed-out Play button with no way to
ever engage it, not the already-known, deliberately-unresolved "should Play at
the end auto-restart?" question tracked in F23/D89 (that question is about
*resuming* play after having already played through to the end; this is about
never being able to start at all).
**That question is no longer open: resolved 2026-07-10 by DECISIONS.md D96
(kept disabled at end-of-document; no auto-restart). This F31 fix is
unaffected either way — it's orthogonal (fixes never-started, not
resumed-after-end).**

**Why `atEnd` alone can't carry both meanings:** the single boolean is
overloaded to mean "no word-like token follows the current index," which is
true in two different situations that need different button behavior —
(a) the document is exhausted *after having been played*, where disabling Play
is correct (F23/D89's intended behavior, e.g. after seeking to the last word),
and (b) the document's *initial* position already satisfies that same
positional test, which happens whenever there is only one word-like token
total, where disabling Play is wrong — the reader hasn't had a chance to
engage it yet.

**Fix (`src/pacer/usePacer.ts`):** added a second ref, `startedRef`, tracking
"has Play actually been engaged since mount/word-list-change/restart" —
independent of position. Set to `false` in the word-list-change reset effect
and in `restart()`; left deliberately untouched by `seek()` (seeking to the
document's last word must still disable Play afterward, preserving F23/D89).
`play()`'s guard becomes `if (atEndRef.current && startedRef.current) return;`
— i.e. refuse only if the document is *both* at its end *and* has already been
started once; otherwise proceed and set `startedRef.current = true`.
`toggle()`'s play-transition arm mirrors this: `canStart = !atEndRef.current ||
!startedRef.current`. Net effect: a fresh single-word document's first Play
press always succeeds (`startedRef.current` is `false`, so the `&&`/`||`
conditions pass regardless of `atEndRef`); every subsequent Play/toggle call
after that first engagement is governed by `atEndRef` exactly as before this
fix, so the multi-word, already-established F23/D89 behavior (Play disabled
after reaching the end, until `restart()`) is unchanged. `commit()`'s `atEnd`
computation, `tick()`, and `seek()` are untouched — no change to the per-tick
hot path or the flat-word-index invariant.

**What was actually done, not just reasoned about:** `npm run build` (`tsc -b
&& vite build`) run and confirmed clean — 71 modules transformed, no type
errors. **No automated test was run or written** — same constraint as F30:
this repo has no test runner (no vitest/jest in `devDependencies`) and no
`react-test-renderer`/jsdom, and `usePacer` is a stateful hook
(`useState`/`useRef`/`useEffect`), so the esbuild-bundle-and-import pattern
used elsewhere in this file for pure-function modules (F20/F24/F26–F29) does
not apply without a React renderer + DOM. The analysis above is a **manual
trace through the actual edited source** for the concrete 1-word-like-token
scenario (computing `firstWordlikeFrom` against a length-1 array, and walking
both the pre-fix and post-fix `play()`/`toggle()` bodies against it), plus a
walk of the multi-word case to confirm `startedRef` doesn't loosen F23/D89's
existing end-of-document disabling once a session has actually started —
tagged 📐, not ✅, per this file's own legend.

**Not verified — needs browser confirmation:** whether a real single-word
document (e.g. a one-word Markdown file) actually renders an enabled,
clickable Play button and whether pressing it visibly starts and then
immediately re-disables playback; whether `restart()` on such a document
correctly re-enables Play a second time; whether the spacebar path (which
calls `toggle()`) exhibits the same fix as the on-screen button (expected,
since both now read the same `startedRef`/`atEndRef` pair, but not watched in
a browser).

(2026-07-10, fix/single-word-play-atend)

---

### F32 — PDF paragraph collapse (issue #9): repro confirmed, break-detection fix + hard-split net both ✅ headless-verified against the real bundled pdfText.ts

Issue #9 (CRITICAL, adversarial-audit finding, not a user repro). Before
fixing anything, the collapse was reproduced against the **unmodified**
`linesToParagraphs`: a synthetic 2-page document with 4 paragraphs, each
starting with an indented first line (`x=90` vs. a `x=72` body margin) and
tight leading (no vertical gaps anywhere, including across the page break),
produced **1 paragraph** — confirming the issue's own "2-page indented doc →
1 block instead of 4+" claim exactly, and confirming the root causes named in
the issue (`PdfLine.x` populated but unread; `itemsToLines` resets
`prevRowY` per page so every page-top line already has `gapBefore: false`).

**What was actually run, not just reasoned about:** a new sibling headless
test file, `src/parsers/pdfText-headless-test.mjs` (mirrors the existing
esbuild-bundle-the-real-module pattern used by `headless-test.mjs`
(markdown) and `epubStructure-headless-test.mjs` — bundles the actual
`src/parsers/pdfText.ts`, imports the real compiled `linesToParagraphs`/
`splitOversizedParagraphs`, not a hand-copied restatement). 14/14 checks
passed (`node src/parsers/pdfText-headless-test.mjs`):

1. **#9 repro, post-fix:** the exact 2-page/4-paragraph/no-gap construction
   above now produces exactly 4 paragraphs with content preserved intact
   (was 1).
2. **Indent break alone, no gap** — a single-page, 2-paragraph body with an
   indented second-paragraph opener and zero `gapBefore` anywhere splits
   correctly. This is the core previously-missed case named in the issue.
3. **False-positive guard** — a paragraph whose *opening* line is indented
   but whose *continuation* lines all sit at the page's body margin does
   **not** spuriously split mid-paragraph (confirms the per-page body-margin
   mode computation, not a fixed/global threshold, is what makes indent
   detection line up with each page's actual layout).
4. **Page boundary alone** — two pages, identical x on every line, no
   `gapBefore` anywhere, still force a break at the page seam.
5. **Empty middle page (`sawContent` flag)** — a 3-page document where the
   middle page contributes zero surviving lines (a bare page number, dropped
   before annotation) sandwiched between two content pages produces exactly
   2 paragraphs — one per content page — with no phantom paragraph for the
   dropped page, and the real page-boundary break on page 3 still fires
   (tracked via `sawContent`, not a raw page index, so an intervening empty
   page can't suppress or duplicate the break on the next real content page).
6. **Regression** — a same-page `gapBefore: true` line still breaks exactly
   as before this change (D98 adds two new cues; doesn't touch the existing
   one).
7. **`splitOversizedParagraphs`** — a synthetic 1000-word paragraph at the
   default 300-word cap: chunk count is exactly 4 (300×3 + 100); every chunk
   `.split(' ').length <= 300`; `chunks.join(' ')` reproduces the original
   1000-word string **exactly**, character-for-character. Plus: a
   below-cap paragraph passes through unchanged (no spurious split at the
   boundary), and a mixed short+long input splits only the paragraph that
   actually exceeds the cap, in order.

**Regression check on the pre-existing suites:** `headless-test.mjs`
(markdown, 15/15), `epubStructure-headless-test.mjs` (12/12), and
`src/storage/headless-test.mjs` (14/14) were all re-run after this change
and remain green — this fix touches only `pdfText.ts`/`pdf.ts`, but since
`pdf.ts` also imports `model/tokenize.ts` (unchanged) the invariant
`Word.id === flat index` (D13, CLAUDE.md §4) was worth reconfirming wasn't
implicitly disturbed; `reindexWords` still runs exactly once, last, over the
`splitOversizedParagraphs`-processed paragraph list, per D99.

**🧪 Build:** `npm run build` (`tsc -b && vite build`) clean after all
changes — 71 modules transformed, no type errors.

**Not verified — same caveat as every other parser entry in this file
(F6/F7/F24 etc.):** this confirms the fix against synthetic `PdfLine[][]`
constructions covering the issue's exact repro shape (indent-only, page-
boundary-only, false-positive guard, oversized-paragraph split) plus the
existing header/footer/hyphenation regression paths. It has **not** been
exercised against a real-world PDF loaded through the actual browser UI —
real PDFs may combine indentation, gaps, and page breaks in ways the 14
synthetic cases don't cover (e.g. a body margin that legitimately varies
line-to-line due to justified-text kerning noise wider than the 5pt
threshold, or a genuine mid-sentence page break that now gets an extra
paragraph-dwell pause per D98's accepted trade-off). The pdf.js extraction
path itself (`itemsToLines`, F6) remains ❓ unverified in a browser, as
before — this fix only changes what `linesToParagraphs`/`pdf.ts` do with the
`PdfLine[][]` `itemsToLines` already produces, not extraction itself.

(2026-07-10, fix/pdf-paragraph-collapse)

---

### F33 — PDF glyph sort comparator intransitivity (issue #13): comparator proof ✅, forced Array.sort corruption on realistic input ❓ — searched extensively, not found

Issue #13 (HIGH, adversarial-audit finding, not a user repro): `itemsToLines`'
pre-sort comparator (`src/parsers/pdf.ts:47`) picked its comparison axis
**per pair**, based on that pair's own `|Δy|` vs. `medianH * 0.5` — not a
fixed, global rule. This is not a valid total order (see D100 for the full
root-cause writeup and the rejected quantized-bucket alternative).

**What was actually proven, not just reasoned about (✅):**
- A constructed 3-point triple, `A(x0,y0)`, `B(x10,y3)`, `C(x20,y5.5)` with
  `medianH=10`: the old comparator gives `A<B` and `B<C` (both pairs under
  the 5-unit branch threshold, so both use the x-branch) but `C<A` for the
  direct comparison (`|Δy|=5.5>5`, so it uses the y-branch instead) — a
  genuine cycle, run and observed via `node src/parsers/pdf-headless-test.mjs`
  calling the comparator function directly, not inferred.
- The same triple under the new comparator (`(a,b) => b.y-a.y || a.x-b.x`)
  is transitively consistent (`C<B<A`, no cycle) — also run directly.
- A broader sweep — 40 pseudo-randomly generated points, all 64,000 ordered
  triples checked for a transitivity violation (`a<b && b<c` implies `a<c`)
  — found zero violations for the new comparator, i.e. it behaves as a valid
  strict total order well beyond the one hand-picked counterexample.
- `itemsToLines` end-to-end reading-order checks (realistic small-jitter
  single line, and two adjacent jittering lines) pass against the real
  shipped comparator: 14/14 checks in `pdf-headless-test.mjs`.

**What was searched for but NOT found, reported honestly rather than
omitted:** before writing the final test, a ~400-seed randomized +
parametric search (sine and uniform-random y-jitter, multiple amplitudes,
frequencies, and line lengths ≥10 — enough to leave V8's small-array
insertion-sort path, which the issue itself flags as a place a bad
comparator can "look sorted" by luck) was run directly against the *old*,
unfixed comparator's `Array.sort()` output, specifically trying to
reproduce the issue's own illustrative "ABCDEF → BADCFE" scrambling via the
actual `itemsToLines` pipeline (not just the bare comparator). **No
realistic-jitter input was found where the old comparator's output visibly
diverges from the new comparator's.** Root cause: `flush()` already
re-sorts every clustered row by x (`row.sort((a,b) => a.x-b.x)`,
unchanged by this fix) *after* row-clustering, which self-heals
within-row reordering regardless of what order the pre-sort produced — so
the only way the bug can corrupt final output is by fooling the *separate*
sequential row-clustering sweep (the `medianH * 0.6` proximity-to-a-fixed-
reference threshold) into mis-clustering, and V8's adaptive sort did not
appear to exercise the specific inconsistent comparisons needed to do that
on any of the ~3,600 parameter combinations tried within the "row-clustering
-safe" jitter envelope (jitter small enough that a *correct* sort wouldn't
itself trigger a spurious row split).

Only at **unrealistically large** single-line jitter (amplitude comparable
to the row-clustering threshold itself, e.g. ~3.5 against a 6-unit threshold
for `medianH=10`) did the old comparator produce visibly broken output — a
16-letter line fragmenting into 4–7 spurious lines. But at that same
amplitude, the **new**, fixed comparator *also* fragments the line — because
that magnitude of jitter independently exceeds the row-clustering sweep's
own fixed-reference-threshold design, a separate, pre-existing limitation
(consistent with F6's existing note that line-grouping is a y-position
heuristic vulnerable to unusual layouts) that this fix does not touch and
was explicitly out of scope for this task. That parameter region therefore
does not demonstrate "this fix resolves the corruption" and was excluded
from the committed test.

**Conclusion / what this means for confidence in the fix:** the comparator
was **provably** not a valid total order (deterministic proof, independent
of any JS engine's particular sort algorithm) and its correctness on any
given real-world input was therefore an unspecified-behavior accident per
ECMA-262 — worth fixing regardless of whether this specific Node/V8 version
happens to render it harmless today, since a different engine, a different
V8 version, or a different comparison sequence for a differently-shaped
input could expose it at any time. The `pdf-headless-test.mjs` integration
checks (single/two-line drifting-baseline reading order) are **regression
guards** confirming the fix doesn't change correct behavior on realistic
input — they are *not* evidence that the fix resolves a previously-observed,
reproducible instance of user-visible text scrambling, since no such
instance was found despite a substantial search. The comparator-transitivity
proof is the actual evidence for both the bug and the fix.

🧪 `npm run build` (`tsc -b && vite build`) clean after the fix — 71 modules
transformed, no type errors. All four pre-existing headless suites
(markdown 15/15, EPUB structure 12/12, pdfText 14/14, storage 14/14)
re-run and still green — this fix touches only `pdf.ts`'s pre-sort, upstream
of `pdfText.ts`/tokenization, so no interaction with those was expected, but
was reconfirmed rather than assumed.

**Not verified — same caveat as F6 (PDF extraction generally):** the
`pdfjs-dist` extraction path itself (`itemsToLines`'s input, i.e. real
`TextItem[]` from a real PDF via the pdf.js worker) remains ❓ unverified in
a browser. This fix and its tests operate entirely on synthetic
`TextItem`-shaped objects constructed by hand; a real scanned/OCR'd or
inline-math PDF loaded through the actual browser UI has not been used to
confirm the fix reads correctly on genuine drifting-baseline text.

(2026-07-10, fix/pdf-glyph-sort-intransitive)

---

### F34 — Spine integrity: three independent silent text-loss/leak bugs (issues #72, #73, #74), all ✅ headless-verified against the real bundled parsers

An adversarial audit found each of the three parsers silently mutating the
reading spine in a way `Word.id === flat index` (CLAUDE.md §4, D13) can't
protect against — the invariant guarantees ids stay contiguous, but says
nothing about whether the *content* is complete or clean. All three are
independently proven fixed via a new shared suite,
`src/parsers/spine-integrity-headless-test.mjs` (26/26), which esbuild-bundles
the real `markdown.ts`, `pdfText.ts`, `epubStructure.ts`, and
`model/tokenize.ts`, and — for the PDF/EPUB cases — wires `tokenize`/
`reindexWords` exactly the way the real `pdf.ts`/`epub.ts` wrappers do, so the
contiguity checks below exercise the true end-to-end pipeline, not just the
pure text layer.

**#72 (markdown, token deletion):** `blockify`'s list-continuation loop
(`markdown.ts`, previously lines 161–167) called the unrestricted
`matchListItem` on every following line while inside an already-open list, so
a hard-wrapped line like "1945. Everyone celebrated." — appearing right after
a list item, no blank line between — was misread as a new ordered-list marker
and "1945." was deleted outright. The existing D90 guard
(`Number(ordered[1]) === 1`) only protected the *paragraph-interruption* path,
not this loop — a different door onto the same corruption class as #41.

Fix has two coupled parts (see D101 for the full design reasoning): (1) the
continuation loop now only treats a following line as a genuine continuation
if it's a bullet (unrestricted, per D90) or an ordered marker that's a
*plausible* continuation — starts at 1, or is exactly one more than the
previous item's number (so a list starting at 5 can continue 6, 7, 8…, not
just lists starting at 1). (2) A line rejected by that check is marked via a
`forcedParagraphAt` index so the *top-level* list dispatch — deliberately left
unrestricted by D90 for the legitimate "a fresh list may start at any number"
case — doesn't immediately re-swallow the very same rejected line as a
brand-new one-item list on the next loop iteration (which, traced through by
hand before writing the fix, is exactly what happens without part 2: the
number gets stripped a second time, by a different code path than the one
that rejected it).

**#73 (PDF, token deletion):** `isBarePageNumber`'s roman-numeral branch
(`/^[ivxlcdm]{1,8}$/i`) was applied to every surviving line on a page, not
just page edges — so ordinary words spelled only from roman-numeral letters
("did", "Civil", "I", "mild", "livid") were silently dropped wherever they
appeared, not just at a genuine folio position. Fix: `isBarePageNumber` takes
a second `isEdge` parameter (default `false`, so any caller that omits it gets
the *safe* behavior — no roman-numeral matches at all — rather than the old
unsafe one); the roman-numeral branch alone is gated on it
(`isEdge && /^[ivxlcdm]{1,8}$/i.test(t)`). The plain-digit, dashed, and
"Page N" branches were left ungated as scoped — they weren't found to share
the anywhere-on-the-page false-positive risk (a bare "12" or "Page 12"
appearing as ordinary prose mid-page is a materially rarer collision than a
common short English word matching `ivxlcdm`). The call site
(`linesToParagraphs`) already computed an equivalent `isEdge` for the
repeated-header/footer check one line below; it was hoisted above the
`isBarePageNumber` call and reused for both, no duplicate logic.

**Residual, accepted risk (not a new bug, inherent to any position-based
heuristic):** a real word that happens to *be* the literal first or last line
of a page (e.g. a poem fragment or a page break mid-word) and is coincidentally
spelled only from `ivxlcdm` letters would still be dropped — same class of
false positive the pre-existing repeated-header/footer detection already
accepts by construction (also `isEdge`-gated). The issue's own proposed fix
("restrict to genuine folio positions") is exactly this trade-off, not a gap
introduced by this pass.

**#74 (EPUB, token injection):** `stripTags` (`epubStructure.ts`) only ever
stripped `<...>` brackets themselves, so the *contents* of `<script>`/
`<style>` elements (CSS/JS text) and everything after a comment's first
literal `>` survived as reading tokens — garbage injected into the spine, the
inverse failure mode of #72/#73's deletions. Fix: three new `.replace()` calls
— comments (`/<!--[\s\S]*?-->/g`), then `<script>…</script>`, then
`<style>…</style>`, all removed *whole* (tag + contents) — run before the
existing generic `<[^>]+>` bracket-stripping pass, so by the time that pass
runs there's no non-prose content left for it to accidentally leave behind.
Comments are stripped first specifically so a comment containing something
that looks like a `<script>`/`<style>` open tag can't confuse the later
passes (not exercised by a specific test — a defensive ordering choice, not a
proven-necessary one).

**What was actually run, not just reasoned about:** 26 checks in the new
suite — 7 for #72 (the exact repro; a non-sequential ordered marker
mid-established-list, proving the fix isn't bullet-list-only; a sequential
non-1-start regression proving D90's existing "list starting at 5" behavior
survives; a plain bullet-list regression), 12 for #73 (7 direct
`isBarePageNumber(s, isEdge)` contract checks covering every branch's
edge-gating status, plus 5 full-pipeline `linesToParagraphs` checks: "did" and
"Civil" mid-page survive, genuine roman folios at both page-start and
page-end edges are still dropped), and 7 for #74 (4 direct `stripTags` checks
—style, comment-with-internal-`>`, script, and an entity/ordinary-tag
regression — plus 2 full-pipeline `xhtmlToBlocks` checks reproducing the
issue's exact repro strings, plus 1 contiguity check on the resulting
document). Interleaved with those: 4 explicit `Word.id === flat index`
contiguity checks (one for the #72 repro, one for the #72 non-sequential
case, one for the #73 "did" repro, one for the #74 style repro), each
built through the *real* `tokenize`/`reindexWords` wiring mirroring
`pdf.ts`/`epub.ts`, not asserted by inspection.

All three pre-existing suites (markdown 15/15, pdfText 14/14, epubStructure
12/12) plus the storage suite (14/14) were re-run after all three fixes and
remain green — none of the new guards changed any previously-correct output.
🧪 `npm run build` (`tsc -b && vite build`) clean — 71 modules transformed, no
type errors.

**Not verified — same caveat as every other parser entry in this file
(F6/F7/F32/F33):** these fixes are proven against synthetic inputs covering
the issues' exact repro shapes plus targeted regressions; none has been
exercised against a real-world Markdown/PDF/EPUB file loaded through the
actual browser UI. The pdf.js extraction path and real-world EPUB markup
variety remain ❓ as documented elsewhere in this file — unaffected by this
fix either way, since all three changes operate purely on already-extracted
text/positioned-line data, not on extraction itself.

(2026-07-14, fix/spine-integrity)

---

### F35 — Pacer identity churn fixed across all consumers (issues #44, #45, #75): D56's destructuring pattern generalized from one consumer to ten effect sites in four files 📐 traced + 🧪 build-verified

**Root cause (confirmed by reading `usePacer.ts` directly, not assumed):**
`usePacer`'s returned object is `useMemo`'d with deps `[playing, atEnd, play,
pause, toggle, restart, seek, subscribe]` (D56) — so every play/pause toggle
(which flips `playing`, and `atEnd` on reaching the end) produces a **new**
object identity, even though the individual members (`indexRef`, `subscribe`,
etc.) are themselves stable across renders. `RsvpContextStrip.tsx` already
avoided this by destructuring `{ subscribe, indexRef, seek }` from `pacer` and
depending on those instead of the whole object (D56) — but every *other*
pacer consumer still listed the whole `pacer` object in its effect deps, so a
bare play/pause re-ran their effects for no functional reason. This single
root cause produced three distinct symptoms tracked as separate issues: **#44**
(App.tsx's 30s position-save `setInterval` torn down and recreated on every
play/pause, narrowing the crash-loss safety margin issue #6 exists to
provide — a user who toggles play/pause more often than every 30s never gets
a periodic save), **#45** (Rsvp.tsx's pause-tick depletion animation
restarted mid-dwell on pause), and **#75** (FlowingHighlight/ChunkHighlight's
relayout effects re-ran `apply()` → `scrollWordToBand`, snapping the pane
back to the active word on play/pause even after a deliberate manual scroll —
the exact D85/F21 "scroll-centering only on real position change" contract
this project already fixed once for a different trigger).

**What was checked, per effect, before changing anything:** every effect in
the four affected files that listed `pacer` in its dependency array — 10
total (1 in `App.tsx`, 4 each in `FlowingHighlight.tsx`/`ChunkHighlight.tsx`,
2 in `Rsvp.tsx`) — was read in full and confirmed to reference only
`pacer.indexRef.current` and/or `pacer.subscribe(...)` in its body, never
`pacer.playing`/`pacer.atEnd`/anything else. All 10 qualified for the same
fix: swap `pacer` in the deps array for the specific stable member(s) the
body actually uses, leaving the body itself untouched (mirrors how this same
task's instructions described the App.tsx case as "a direct swap"). `indexRef`
is a `useRef` created once inside `usePacer` (stable for the component's
lifetime); `subscribe` is a `useCallback` with an empty dependency array
(also stable) — so depending on either instead of the whole memoized object
means the effect re-runs only on its real triggers (document change,
bionic/typography change, window resize, initial subscription), never on a
bare play/pause. `apply()`'s own definition in each mode file was confirmed
unchanged and was already pacer-independent (`FlowingHighlight`/
`ChunkHighlight`: deps `[updateLeadClasses]`/`[updateChunkClasses]`; `Rsvp`:
empty deps) — none of these fixes touch it. One effect was deliberately left
alone: `App.tsx`'s keyboard-shortcut handler (deps `[phase, pacer, words]`)
re-attaches a `keydown` listener on every play/pause, which is a cheap,
side-effect-free churn (a listener re-attach, nothing torn down that matters)
— out of scope per the task and not one of the three tracked issues.

**What was actually run (✅/🧪), not just reasoned about:**
- `npm run build` (`tsc -b && vite build`): clean, 71 modules transformed, no
  type errors, across all four edited files.
- `node src/pacer/headless-test.mjs`: 13/13 passed, unchanged. **Caveat,
  stated plainly rather than implied:** this suite tests `spaceTogglesFrom`
  (`src/pacer/keyboard.ts`), the Space-key routing predicate — it does not
  exercise `usePacer.ts`'s clock or any of the four edited components. It was
  re-run only to confirm this fix left that unrelated module's behavior
  unchanged (it did — no file in its import graph was touched), not as
  evidence the identity-churn fix itself works.

**What was traced by eye, not run (📐), and why nothing stronger exists here:**
this repo has no test runner (no vitest/jest in `devDependencies`) and no
`react-test-renderer`/jsdom, so the esbuild-bundle-and-import pattern this
file uses elsewhere for pure-function modules (F20/F24/F26–F29/F32/F34)
doesn't apply — none of the ten fixed call sites are pure functions; they're
`useEffect`/`useLayoutEffect` bodies inside stateful React components, which
need an actual renderer to execute. Each of the 10 dependency-array edits was
verified by hand against the real body it governs (see above). This is the
same evidentiary tier as F30/F31 (📐, not ✅ or 👁) — a correctness argument
from reading the actual edited source, not an execution.

**Not verified — needs browser confirmation, same class of gap as F22/F23's
still-open interactive half:** whether a real play/pause cycle actually
leaves the 30s save timer's interval untouched (#44); whether pausing
mid-dwell in RSVP visibly no longer resets the pause-tick width (#45);
whether a manual scroll away from the active word in flowing/chunk mode now
survives a play/pause tap (#75). None of these three user-facing behaviors
has been watched in an actual browser session.

(2026-07-14, fix/pacer-identity-churn)

---

## Bug-fix — RSVP mishandles em/en-dash tokens (issue #25)

### F38 — Dash-split + dwell-rollup fixes proven against the real bundled `tokenize`/`buildDwellMultipliers`; the visual/felt RSVP behavior is unverified ✅🧪❓

Issue #25 (adversarial-audit finding, not a user repro): `tokenize()` split
only on whitespace, so an attached em/en dash (`"going—but"`) fused two words
into one RSVP flash, and a spaced dash (`"going — but"`) tokenized to a
standalone non-word-like token the pacer's `firstWordlikeFrom` always skips —
RSVP never renders it, and its dwell entry in `buildDwellMultipliers` was
dead. See D106–D109 for the full design reasoning (dash-run split rule,
`spaceBefore` field, dwell roll-up, and what was deliberately left unfixed).

**What was actually run, not just reasoned about (✅):** two new headless
suites, both esbuild-bundling and importing the real shipped module (same
pattern as F24/F26–F29/F32/F34/F37 — not a hand-copied restatement):

- `src/model/headless-test.mjs` (new), against the real
  `src/model/tokenize.ts`'s `tokenize`: **17/17 passed** — `"word—word"` and
  `"word–word"` split into two tokens with the dash on the left piece and
  `spaceBefore: false` on the continuation; `"word — word"` stays three
  tokens, the dash `isWordlike: false`, all three `spaceBefore: true`;
  `"well-known"` and `"1914–1918"` are each left as one unchanged token
  (hyphen-minus and numeric-range guards); a leading dash (`"—word"`),
  trailing dash (`"word—"`), and bare dash (`"—"`) are each left as one
  token; a multi-dash run (`"word——word"`) splits as a single unit into two
  tokens; and ids stay sequential from a non-zero `startIndex` across split
  pieces within a mixed sentence.
- `src/pacer/dwell-headless-test.mjs` (new), against the real
  `src/pacer/dwell.ts`'s `buildDwellMultipliers` (documents constructed
  directly as flat-indexed `Word[]`, bypassing the tokenizer, so each case
  controls `isWordlike`/`text` precisely): **5/5 passed** — `"word — word"`'s
  first word rolls up to the skipped dash's 1.75×; `"end. — word"` keeps the
  first word's sentence-end 2.5× rather than being downgraded by the
  dash's 1.75× (proves the MAX rule, not overwrite); a plain word with no
  skipped run after it stays at the unmodified 1×; the last word-like token
  of a block still gets the unconditional paragraph 3×; and a post-split
  attached-dash token (`"word—"`) gets 1.75× from its own existing
  `trailingDwell`, with no new dwell special-case required — confirming
  D106's "free win" claim empirically, not just algebraically.

**Regression check (✅):** all 9 pre-existing headless suites
(`parsers/headless-test.mjs` 15/15, `parsers/spine-integrity-headless-
test.mjs` 26/26, `parsers/epubStructure-headless-test.mjs` 12/12,
`parsers/pdfText-headless-test.mjs` 14/14, `parsers/pdf-headless-test.mjs`
14/14, `pacer/headless-test.mjs` 13/13, `pacer/orp-headless-test.mjs` 5/5,
`presets/headless-test.mjs` 12/12, `storage/headless-test.mjs` 15/15) were
re-run after adding the required `Word.spaceBefore` field and remain green —
meaningful here because all three parsers (markdown/PDF/EPUB) route through
the same `tokenize()` that changed, and `reindexWords`'s `{ ...word, id }`
spread was confirmed (by these suites still passing, not just by reading the
spread) to carry `spaceBefore` through re-indexing untouched.

**🧪 Build:** `npm run build` (`tsc -b && vite build`) clean — 71 modules
transformed, no type errors — confirming `tokenize()` is still the only
`Word`-literal construction site (adding a required field would have been a
type error at any missed site) and that `Reader.tsx`/`RsvpContextStrip.tsx`'s
one-line `spaceBefore` guards typecheck.

**Not verified — explicitly flagged, not claimed (❓):** none of this was
watched in a browser. Specifically unverified: RSVP actually flashing
`"going—"` then `"but"` as two legible flashes rather than the old fused
token; the ORP anchor (`orp.ts`, untouched by this fix) landing correctly on
each shorter piece rather than the old combined length; whether the rolled-up
1.75×/2.5× pause on a spaced dash is *perceptible* at real WPM speeds in RSVP;
whether `Reader.tsx`'s flowing/chunk rendering of a dash-split token
(`"going—"` immediately followed by `"but"` with no space, per
`spaceBefore: false`) reads correctly on screen — text-content correctness was
confirmed by the headless tests, but the actual glued-together rendering
(`"going—but"` with no space, as intended, versus some unintended visual
artifact) was not seen. This matches the file's established practice
(F22/F23/F30/F31/F35) of tagging felt/visual behavior ❓ rather than
inferring it from passing unit tests.

(2026-07-16, fix/rsvp-dash-tokens)

---

## Change log
- Created at the M7 documentation audit (2026-06-26). Keep current with
  ARCHITECTURE.md / DECISIONS.md.
- Note on ordering: F11 sits *after* F12–F16 in file order because it was written
  into the "Documentation integrity" section, which physically follows the
  "Post-V1 techniques" block (F12–F16). IDs are assigned chronologically, not by
  file position; check the highest existing number before adding one so an
  F12-style collision doesn't recur.
- **F22** added (2026-07-09, issue #38): Space-routing predicate ✅, build 🧪,
  HUD collapse/RSVP-glide/no-re-wrap/no-double-toggle ❓ pending browser test.
  Revised same day after browser testing confirmed four of the ❓ items were
  real bugs (F22 updated in place; see F23).
- **F24** added (2026-07-09, issues #41/#42): Markdown parser token-deletion
  and character-mangling bugs, both fixed and 15/15 headless-verified.
- **F23** added (2026-07-09, issue #38 QA round): root-caused and fixed the
  four bugs F22 flagged as possible; predicate rewritten (13/13 headless),
  HUD ceilings corrected, disabled-button styling added. Fixes themselves
  still ❓ pending browser re-test.
- **F25** added (2026-07-10, issue #54): confirmed the four D91/F24 lookbehind
  regexes compile and execute correctly against two real Hermes binaries
  (bytecode v84 and v96) — empirical, not a docs lookup. `markdown.ts`
  unchanged; still `[PORTABLE]`.
- **F26** added (2026-07-10, issue #48): resume drift-detection → percent
  fallback pure mapping, 4 new headless checks (14/14 total in
  `src/storage/headless-test.mjs`). UI/pacer path still ❓, same as the rest
  of F20's outstanding browser-test list.
- **F27** added (2026-07-10, issue #43): EPUB `attr()` name-boundary fix —
  decoy-attribute repro + manifest-miss warning, 5/5 headless-verified
  against the real bundled `epubStructure.ts`. Real-world EPUB variety still
  unverified, same caveat as F7.
- **F28** added (2026-07-10, issue #47): EPUB `container.xml` full-path decode
  gap — same D62/#11 root cause recurring at `parseContainerOpfPath`, a
  second call site; 3/3 headless-verified end-to-end via the real bundled
  `parseEpub`. Real-world EPUB variety still unverified, same caveat as
  F7/F27.
- **F29** added (2026-07-10, issue #14): EPUB unclosed `<p>` yielded zero text
  silently (strict backreferenced regex needs a matching close tag); additive
  fallback splits on opening tags when the strict pass yields a whole-chapter
  zero. 12/12 headless-verified against the real bundled `xhtmlToBlocks`.
  Partial mid-chapter loss (any closed tag keeps the strict pass) left as a
  documented follow-up. Real-world EPUB variety still unverified, same caveat
  as F7/F27/F28.
- **F30** added (2026-07-10, issue #18): chunk mode's `atEnd` never flipped at
  end-of-document when the final chunk held ≥2 words (`tick()`'s `next === -1`
  branch never called `commit()`, the only place `atEnd` was updated); also
  found `play()`/`toggle()` independently recomputed the same non-chunk-aware
  check, so the keyboard path could still bypass a correctly-disabled button.
  Both fixed by making `atEndRef` the single source of truth. 📐 reasoned
  through a manual trace of the edited source (no test runner in this repo,
  and `usePacer` is a hook — the esbuild-bundle-import pattern used by
  F20/F24/F26–F29 doesn't apply without a React renderer/DOM). 🧪 build clean.
  Browser confirmation of the actual disabled-button/spacebar behavior still
  outstanding.
- **F31** added (2026-07-10, issue #49): a single-word-like-token document
  permanently disabled Play (`commit(0)` on mount already satisfied `atEnd`'s
  purely-positional "nothing after this index" test, before Play was ever
  pressed). Fixed with a new `startedRef` tracking whether Play has actually
  been engaged since mount/word-list-change/restart, independent of position;
  `seek()` deliberately left untouched so it keeps disabling Play afterward
  (preserves F23/D89). 📐 reasoned through a manual trace (same test-runner/
  hook limitation as F30). 🧪 build clean. Browser confirmation outstanding.
- **2026-07-10 (issue #64):** the end-of-document Play/Space auto-restart
  question — open since F23/D89 (2026-07-09), reaffirmed still-unresolved by
  F30/F31 above — was decided by the product owner: keep it disabled, no
  auto-restart. See DECISIONS.md D96. Docs-only; no source changed (`play()`/
  `toggle()` in `src/pacer/usePacer.ts` already implemented this). The F23
  (line ~579) and F31 (line ~1086) tails were annotated in place pointing at
  D96, per this file's append-only discipline.
- **F32** added (2026-07-10, issue #9, CRITICAL): PDF paragraph collapse —
  `linesToParagraphs` ignored the `x` indent cue and never broke at page
  boundaries, so a tightly-leaded indented novel could collapse into one
  giant Block, reopening the ~57k-node perf cliff D19/D20 exist to prevent.
  Fixed with a per-page body-margin indent cue + unconditional page-boundary
  breaks (D98), plus an independent `splitOversizedParagraphs` hard-split
  safety net wired pre-tokenize (D99). 14/14 new headless checks against the
  real bundled `pdfText.ts`; all pre-existing suites (markdown 15/15, EPUB
  structure 12/12, storage 14/14) re-run and still green. 🧪 build clean.
  Real-world PDF-through-browser-UI verification still outstanding, same
  caveat as F6/F7.
- **F33** added (2026-07-10, issue #13, HIGH): PDF glyph pre-sort comparator
  was intransitive (picked its comparison axis per-pair rather than by a
  fixed rule), proven by direct construction (a 3-point cycle) and a
  64,000-triple randomized sweep confirming the new `(-y, x)` total-order
  comparator has no such violation. A ~400-seed search for realistic input
  where the old comparator visibly corrupts `Array.sort()` output (beyond
  what the separate, out-of-scope row-clustering threshold breaks in *both*
  old and fixed code) found none — reported honestly rather than omitted;
  the 14/14 `pdf-headless-test.mjs` integration checks are regression
  guards, not confirmation this fix resolves previously-observed scrambling.
  🧪 build clean; all four pre-existing suites re-run and still green.
- **F34** added (2026-07-14, issues #72/#73/#74): three independent spine
  corruption bugs fixed together — markdown's list-continuation loop deleted
  a hard-wrapped numeric line following a list item (#72, fixed by requiring
  a plausible continuation — starts at 1 or sequential — plus a
  `forcedParagraphAt` guard so the top-level list dispatch can't re-swallow
  the rejected line, see D101); PDF's `isBarePageNumber` dropped ordinary
  roman-numeral-letter words ("did", "Civil") anywhere on a page instead of
  only at genuine folio edges (#73, fixed with an `isEdge` parameter gating
  only the roman-numeral branch); EPUB's `stripTags` leaked `<script>`/
  `<style>` bodies and comment contents into the reading spine (#74, fixed
  by stripping them whole before the generic tag pass). New shared suite
  `src/parsers/spine-integrity-headless-test.mjs`, 26/26, including four
  `Word.id === flat index` contiguity checks built through the real
  `tokenize`/`reindexWords` wiring. All four pre-existing suites (markdown
  15/15, pdfText 14/14, epubStructure 12/12, storage 14/14) re-run and still
  green. 🧪 build clean. Real-world file-through-browser-UI verification
  still outstanding, same caveat as F6/F7/F32/F33.
- **F35** added (2026-07-14, issues #44/#45/#75): pacer identity churn — the
  D56 destructuring pattern (depend on `pacer.indexRef`/`pacer.subscribe`,
  not the whole memoized `pacer` object) was applied to one consumer
  (`RsvpContextStrip.tsx`) but not the other four; every OTHER effect
  depending on the whole object re-ran on every play/pause, producing three
  symptoms fixed together: App.tsx's 30s save timer resetting (#44), RSVP's
  pause-tick animation restarting mid-dwell (#45), and flowing/chunk panes
  snap-recentering over a manual scroll (#75, a D85/F21 contract violation).
  10 effect sites across 4 files audited and fixed (1 in App.tsx, 4 each in
  FlowingHighlight.tsx/ChunkHighlight.tsx, 2 in Rsvp.tsx). 🧪 build clean;
  the existing `pacer/headless-test.mjs` (13/13, unchanged) covers the
  Space-key predicate only, not this fix. No test runner exists for React
  effect behavior in this repo, so the fix itself is 📐 traced by hand
  against each effect's real body, not ✅ run — browser confirmation of all
  three user-facing symptoms is still outstanding.
- **F-PRESETS-5** added (2026-07-14, issue #78): the six non-RSVP built-in
  presets silently inherited `rsvp.showContext: true` from `DEFAULT_BUNDLE`,
  contradicting D81's stated rejection of exactly that state — fixed by
  giving each an explicit `showContext: false` override (D103). 12/12
  headless (up from 11/11), 🧪 build clean.
- **F36** added (2026-07-14, issue #76): `BookRecord.wordCount` being
  record-level (overwritten on every save) meant a `history` entry's own
  drift could be masked once a later save happened to re-converge the
  record's wordCount to some other value — fixed by giving each
  `PositionSnapshot` its own `wordCount`, with `??` fallback to the
  record-level value for pre-fix (legacy) snapshots. Also converted
  `storage/headless-test.mjs`'s tests 1-4/10 to exercise the real
  `saveReadingPosition`/`loadBookRecord` via a small in-memory `localStorage`
  stub (attempted per the task's optional suggestion, kept — small and
  self-contained; see DECISIONS.md). 15/15 headless (up from 14/14),
  including a new test that concretely contrasts the old buggy resolution
  against the fixed one on the same reconstructed input. 🧪 build clean.
- **F37** added (2026-07-14, issue #77): `splitOrp` split NFD (decomposed)
  text by raw code point, which could anchor the RSVP focal letter on a bare
  combining mark or leak one into `pre`/`post`, detached from its base
  character — fixed with one `text.normalize('NFC')` call before splitting.
  Judged sufficient over `Intl.Segmenter` grapheme-cluster splitting for the
  realistic case (precomposable Latin/Cyrillic/Greek accents); a residual gap
  for non-precomposable combining sequences is explicitly flagged, not
  silently left implied-fixed — see DECISIONS.md. New
  `src/pacer/orp-headless-test.mjs`, 5/5 headless against the real bundled
  `orp.ts`, including a direct repro of the pre-fix bug via an
  old-logic mirror. 🧪 build clean; `pacer/headless-test.mjs` (unrelated,
  13/13) re-run unchanged as a regression check.
- **F38** added (2026-07-16, issue #25): RSVP mishandled em/en-dash tokens —
  an attached dash (`"going—but"`) fused two words into one token, and a
  spaced dash (`"going — but"`) tokenized to a standalone non-word-like token
  the pacer always skips, silently dropping both the dash and its dwell.
  Fixed with a dash-run split in `tokenize()` (dash stays on the left piece,
  guarded against leading/trailing/bare dashes and numeric ranges — D106), a
  new `Word.spaceBefore` field so split continuation pieces render flush with
  no re-inserted space (D107), and a dwell roll-up in
  `buildDwellMultipliers` so a skipped punctuation run's pause survives via
  MAX onto the preceding word (D108). New `src/model/headless-test.mjs`
  (17/17) and `src/pacer/dwell-headless-test.mjs` (5/5) against the real
  bundled modules; all 9 pre-existing suites re-run and still green. 🧪 build
  clean. Real-browser RSVP rendering/felt-pause verification still
  outstanding, same class of gap as F22/F23/F30/F31/F35.

### F20 — Reading-position persistence: headless-verified invariants ✅

Ten Node.js checks in `src/storage/headless-test.mjs` (run `node src/storage/headless-test.mjs`) confirmed all of the following. (The same file later grew 4 more checks for the resume drift-detection fix — see F26.)

1. **History caps at 5, oldest dropped.** The `[snapshot, ...history].slice(0, 5)` pattern enforces the cap exactly.
2. **>2 % gate suppresses redundant history entries.** A save at wordIndex 1 (0.01 % into a 10 000-word book) does not append a new history entry when the last history percent is 0 %.
3. **`latest` is always updated regardless of the gate.** Moving 0.5 % (under gate) updates `latest.wordIndex` but does not grow `history`. The invariant that `latest` is never stale is enforced structurally, not by convention.
4. **Position round-trips through JSON serialisation.** `wordIndex`, `percent`, `savedAt`, `fingerprint`, `wordCount` all survive `JSON.stringify` → `JSON.parse` with exact equality.
5. **Useful-history filter (>5 % from latest).** Of four history entries at offsets 6 %, 2 %, 40 %, 60 % from `latest`, exactly three pass the UI filter.
6. **Same content → same fingerprint (deterministic)** — checked with both small (<96 KB) and large (200 KB, sampled) inputs.
7. **Different content → different fingerprint.**
8. **Large-file sampling is deterministic** — a 200 KB buffer with a non-trivial pattern produces the same hex twice.
9. **Large files differing only in the middle region produce different fingerprints** — the mid-sample captures the change.
10. **History is stored newest-first** — `history[0].savedAt > history[1].savedAt` after three saves >2 % apart.

What requires browser testing:
- `computeFingerprint()` on a real `File` object (`crypto.subtle` is a browser API; the Node test reimplements the hash with `node:crypto` same algorithm).
- The resume-prompt interstitial rendering, "Resume" and "Start from beginning" button behavior.
- `pacer.seek(wordIndex)` restoring the correct position across all three modes (flowing/RSVP/chunk).
- The 30-second periodic save, `visibilitychange → hidden` save, and `pagehide` save actually firing.
- Rename/move-file recognition: loading a file, renaming it on disk, reloading — same fingerprint → resume prompt appears.

(2026-07-07, feature/reading-position-persistence)

---

## Presets system (issue #3)

### F-PRESETS-1 — "context on" is inert in chunk mode ✅ **Unit-verified + derived**

The RSVP context strip (`RsvpContextStrip.tsx`) is rendered only when `mode === 'rsvp'`
in `App.tsx`. In chunk mode, `rsvp.showContext` has no visual or functional effect.
Confirmed by code inspection: no code path reads `rsvp.showContext` outside the RSVP
branch. Implication for the port team: a preset's `rsvp.showContext` value is preserved
in the bundle regardless of the active mode — it only activates when the user is in RSVP.

### F-PRESETS-2 — React 18 batches all applyPreset setters into one render ❓ **Assumed**

`applyPreset` fires nine `setState` calls sequentially inside a single event handler.
React 18's automatic batching coalesces them into one synchronous render pass, so there
is no intermediate state where, e.g., the mode has changed but WPM has not. Not
independently measured with a render counter; follows from React 18 automatic-batching
docs. The port team should verify this in their React Native version (RN ≥ 0.71 uses
the same React 18 batch scheduler).

### F-PRESETS-3 — `bundlesEqual` field list is exhaustive ✅ **Unit-verified**

The headless test (test 9) varies every one of the 13 fields individually and asserts
`bundlesEqual` returns `false` for each — confirming no field is silently omitted from
the comparison. Adding a new setting to `PresetBundle` requires adding a corresponding
line to `bundlesEqual`; omitting it would cause `isModified` to stay `false` when that
field changes.

### F-PRESETS-4 — Headless test results (2026-07-08) ✅ **Unit-verified**

11 checks: 11 passed, 0 failed.

Checks covered: built-ins always present (9 presets); all bundles have valid setting
values; all four groups covered; createUserPreset JSON round-trip; save + load
round-trip; upsert (no duplicate); deleteUserPreset correctness; bundlesEqual true for
identical bundles; bundlesEqual false for each of 13 field diffs; applyPreset yields
exact bundle; group inferred from mode.

What requires browser testing:
- Applying each built-in: all 13 settings + mode switch renders correct mode view.
- Modified badge appears after any setting tweak post-apply.
- "Save current…" creates a persistent user preset that survives reload.
- User preset rename and delete work in UI.
- Preset state (activePresetId, userPresets) does NOT reset when loading a new file
  (only reading position changes on load).

(2026-07-08, feature/presets)

### F-PRESETS-5 — D81/code contradiction (issue #78) fixed and verified against the real values ✅ **Unit-verified**

D81 said non-RSVP built-ins shouldn't carry `rsvp.showContext: true`, but
none of the six non-RSVP built-ins ever overrode `rsvp` in their bundle, so
all six silently inherited `true` from `DEFAULT_RSVP` via `DEFAULT_BUNDLE`
(see D103 for the full writeup). Fixed by adding an explicit
`rsvp: { ...DEFAULT_RSVP, showContext: false }` to each of the six.

*Verified:* ✅ a new 12th check in `src/presets/headless-test.mjs`
(`non-RSVP built-ins explicitly set rsvp.showContext:false`) asserts, for
all six preset ids, `bundle.mode !== 'rsvp'` and `bundle.rsvp.showContext
=== false`. 12/12 checks pass (up from 11/11 — the pre-existing 11 are
unchanged, confirming this fix didn't alter any other bundled field: the
`bundlesEqual`-diff check (#9) and the valid-value-range check (#2) both
still pass against the updated inline bundle data). 🧪 `npm run build`
(`tsc -b && vite build`) clean, 71 modules, no type errors.

**Caveat, same as every other entry in this suite:** `headless-test.mjs`
hand-copies the preset definitions rather than importing the real
`src/presets/presets.ts` (unlike the newer esbuild-bundle-the-real-module
pattern used by F24/F26–F29/F32/F34) — the inline copy was updated by hand
to match the real file's new `rsvp` overrides for this fix, and the two were
diffed by eye to confirm they match, but there's no automated guard against
the inline copy drifting from the real source on a future change to either
file. Not exercised in a browser — same outstanding items as F-PRESETS-4.

(2026-07-14, fix/preset-showcontext-contradiction)

---

## Bug-fix — Resume history-snapshot wordCount drift (issue #76)

### F36 — Per-snapshot wordCount closes the residual #48 drift gap; real `saveReadingPosition`/`loadBookRecord` now exercised directly (localStorage stub) ✅ headless-verified

Issue #76 (adversarial-audit finding, not a user repro): the #48 fix (D92,
F26) compared `BookRecord.wordCount` (record-level, overwritten on every
save) against the live word count to detect tokenization drift — correct for
resuming `latest` (which is always the most recent save, so its basis and
`record.wordCount` are the same number by construction), but not for a
`history` entry, whose own basis can differ from whatever the record's
wordCount happens to be by the time the user picks it to resume. Concretely:
save under tokenization A (wordCount 10,000) creates a history entry;
tokenization changes to B (8,000 words), a later save updates
`record.wordCount` to 8,000; tokenization later happens to reconverge to A's
count (10,000) for an unrelated reason, and a third save updates
`record.wordCount` back to 10,000. If the user now resumes the *first*
history entry (the one actually saved under A), the record-level comparison
sees `record.wordCount(10000) === len(10000)` and wrongly reports "no
drift" — but that's irrelevant to whether *that specific entry* drifted; it
happens to be correct here only because the entry itself was also saved
under A. Swap in the *middle* entry (the one saved under B, 8,000) instead,
and the same record-level comparison still says "no drift" against a live
count of 10,000 — silently wrong, reusing a raw `wordIndex` computed against
an 8,000-word tokenization on a 10,000-word document.

**Fix:** `PositionSnapshot` (`src/storage/readingPosition.ts`) gained an
optional `wordCount?: number`, populated on every `saveReadingPosition` call
from the same `wordCount` parameter already used to compute `percent` — so
each snapshot now carries its own basis, independent of whatever the
record's top-level `wordCount` says later. `handleResume` (`src/App.tsx`)
now resolves `savedWordCount = snapshot.wordCount ?? resumeRecord?.wordCount`
and drift-checks against *that*, falling back to the record-level value only
for snapshots persisted before this fix shipped (`wordCount` absent —
existing localStorage data, backward compatible, no migration needed since
`??` handles the missing field transparently). The `??` fallback is
important, not decorative: without it, an already-in-the-wild pre-fix
snapshot's `undefined` wordCount would either need special-casing or would
incorrectly compare `undefined !== len` (always true, forcing every legacy
snapshot onto the percent-fallback path even when its raw index would have
been fine).

**What was actually run, not just reasoned about — and a scope note on
methodology:** unlike F26 (which hand-mirrored `saveReadingPosition`'s
logic, per that file's own header explaining `.mjs` scripts can't import
`.ts` directly without a build step), this fix's tests exercise the REAL
`src/storage/readingPosition.ts` via the same esbuild-bundle-and-import
pattern already used by the parser suites (F24/F26–F29/F32/F34). This
required a small addition: a Map-backed in-memory `localStorage` stub
(`getItem`/`setItem`/`removeItem`/`clear`, ~15 lines) assigned to
`globalThis.localStorage` before the bundled module is imported — Node has
no such global, and `storage.ts` (readingPosition.ts's only dependency)
calls `localStorage` exclusively inside function bodies, never at
module-load time, so there's no import-order hazard. This was flagged as
optional in the task ("only if it's clean and doesn't risk destabilizing the
suite's other tests"); it was attempted and kept because it stayed small and
self-contained — see DECISIONS.md for the write-up. Two things remain
mirrored rather than imported, each for a concrete, still-valid reason
(unchanged from F26): `fingerprintFromBytes` (the real `computeFingerprint`
needs `crypto.subtle`, a browser-only API operating on a `File`) and
`resolveResumeTarget` (mirrors `handleResume`, a React component method
closing over component state — not an exported pure function, nothing to
import).

`src/storage/headless-test.mjs`: **15/15 passed** (was 14/14 — 1 new check).
Tests 1, 2, 3, 4, and 10 were converted from the old hand-mirrored
`applyPositionSave` helper to real `saveReadingPosition`/`loadBookRecord`
calls against the stubbed storage — same assertions, now proving the actual
shipped persistence code rather than a restatement of it. Test 4 additionally
asserts the round-tripped snapshot carries its own `wordCount`. Test 15 (new)
constructs the three-save reconverging-wordCount sequence above end-to-end
through the real `saveReadingPosition`, confirms the middle history entry
survives (no eviction, cap is 5), and then demonstrates **both** sides of the
fix concretely: a `resolveResumeTargetOldBuggy` mirror of the pre-#76
record-only comparison is shown to reuse the stale raw `wordIndex` on this
exact input (the bug), while `resolveResumeTarget` (the #76-fixed logic)
detects the drift via the snapshot's own `wordCount` and falls back to
percent, landing on a different, correct index. Tests 11–14 (the #48 clamp/
drift suite) were extended with explicit snapshot `wordCount` fields — test
14 in particular now separately exercises the own-wordCount-drift path and
the legacy-no-own-wordCount fallback path, where the original only exercised
one undifferentiated "drift" case.

🧪 `npm run build` (`tsc -b && vite build`) clean after both source changes
(`readingPosition.ts`, `App.tsx`) — 71 modules transformed, no type errors.

**Not verified — same class of gap as F20/F26's own outstanding lists:**
whether a real tokenization drift sequence (three actual app sessions across
a real parser change and revert) reproduces this exact storage shape in a
live browser; whether the resume-prompt UI correctly surfaces and resolves a
history entry under this scenario end-to-end (`ResumePrompt.tsx`'s history
buttons were not exercised, only the pure resolution logic they'd feed into).

(2026-07-14, fix/resume-drift-and-orp-nfd)

---

## Bug-fix — RSVP anchors on a bare combining mark for NFD text (issue #77)

### F37 — NFC normalization before code-point splitting fixes the common case; exotic non-precomposable combining sequences remain a known, flagged gap ✅ headless-verified

Issue #77 (adversarial-audit finding, not a user repro): `splitOrp`
(`src/pacer/orp.ts`) split a word into pre/anchor/post by raw code point
(`[...text]`). In NFD (canonically decomposed) text — common from
macOS-authored files and some extraction paths, per the issue — a base
character and its combining diacritic are two separate code points, so the
split could land the ORP anchor index on a bare combining mark, or leave one
dangling at the start of `pre`/`post`, detached from the base letter it
belongs to. Concretely, NFD "naïve" (6 code points: n, a, i, combining
diaeresis, v, e) splits differently than its NFC form (5 code points: n, a,
ï, v, e) — `orpIndex(6) = 2` lands the anchor on the base `i`, but the very
next code point, the bare diaeresis, leaks into `post` as a detached mark
(reproduced directly, see below) — and for other word shapes the anchor
index itself can land squarely on the mark.

**Fix:** `splitOrp` now calls `text.normalize('NFC')` before splitting into
code points (one line, `src/pacer/orp.ts`). NFC composes any canonically
decomposable sequence into its precomposed form wherever one exists — which
covers essentially all standard Latin accented letters (the common
real-world case named in the issue). `orpIndex`'s length-bucket thresholds
are untouched; only what gets split changed.

**NFC vs. `Intl.Segmenter` (grapheme-cluster splitting) — the judgment call
the task asked to be made explicit either way:** NFC was chosen as the
right-sized fix. It resolves the issue's own repro and the entire realistic
case (any base+mark sequence with a Unicode-assigned precomposed
codepoint — which includes all commonly-typed accented Latin, Cyrillic, and
Greek letters). It does **not** resolve combining sequences with no
precomposed NFC form at all — e.g. some stacked-diacritic combinations, or
marks Unicode's composition-exclusion table deliberately excludes from NFC —
where a bare combining mark can still detach. `Intl.Segmenter` (true
grapheme-cluster splitting) would close that residual gap, but is a
materially bigger change: it changes what "one character" means throughout
`splitOrp`'s consumers (the ORP anchor is currently reasoned about as "one
code point"; a grapheme cluster can be multiple code points glued together,
which ripples into rendering — the anchor letter is pinned to a fixed
monospace column, D29/F3 — and into `orpIndex`'s length semantics, which
currently counts code points). Given the task's explicit sizing guidance
("only reach for `Intl.Segmenter` if NFC leaves a real, likely-to-matter
gap"), and that the residual gap is a narrow, uncommon case relative to the
common NFD-from-macOS scenario the issue names, NFC alone was judged
sufficient — see DECISIONS.md for the full write-up, including the rejected
alternative.

**What was actually run:** a new `src/pacer/orp-headless-test.mjs`,
esbuild-bundling and importing the real `src/pacer/orp.ts` (same pattern as
`spine-integrity-headless-test.mjs`), **5/5 passed**:
1. NFD "naïve" and its NFC form produce byte-identical `{pre, anchor, post}`,
   and the composed anchor is confirmed not a bare combining mark
   (`\p{M}` Unicode-property check).
2. **Pre-fix bug reproduced directly**, not just asserted fixed: a
   `splitOrpOldBuggy` mirror of the exact pre-fix logic (code-point split,
   no NFC step) is run against NFD "naïve" and shown to produce a `post`
   starting with a bare combining mark — the concrete "post '̈ve'" symptom
   the issue itself describes — while the real, fixed `splitOrp` on the same
   input does not.
3. A systematic sweep across every `orpIndex` bucket boundary (lengths 1, 5,
   6, 9, 10, 13, 14, 20) using NFD words built entirely from
   precomposable accented Latin vowels (á/é/í/ó/ú via base vowel + U+0301
   COMBINING ACUTE ACCENT, decomposed) — for every length, the reconstructed
   split equals the NFC-composed word exactly, and the anchor/pre/post never
   contain a bare combining mark.
4. Ordinary ASCII words are unaffected (`splitOrp('extraordinary')` etc.
   reconstructs and anchors identically to before this change).
5. Empty string still returns `{ pre: '', anchor: '', post: '' }`.

🧪 `npm run build` (`tsc -b && vite build`) clean — 71 modules transformed,
no type errors. `node src/pacer/headless-test.mjs` (the unrelated Space-key
predicate suite, sharing the `src/pacer/` directory but no import
relationship with `orp.ts`) re-run as a regression check: **13/13 unchanged**.

**Not verified — flagged, not silently assumed fine:** the residual
non-precomposable-combining-sequence gap described above is real and
untested here (deliberately — there is nothing to headlessly verify about a
gap the fix doesn't claim to close); real-world documents containing such
sequences would still show a detached mark in RSVP. `Rsvp.tsx` (the only
caller of `splitOrp`) was not exercised in a browser — this confirms the
pure function's output, not the rendered word's on-screen appearance.

(2026-07-14, fix/resume-drift-and-orp-nfd)
