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
