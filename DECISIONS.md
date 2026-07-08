# Decision Log

> Append-only record of judgment calls and resolved forks. Newest at the bottom
> of each milestone section. Each entry: **what** was decided, **why**, and the
> alternative rejected. Companion to [ARCHITECTURE.md](ARCHITECTURE.md).
>
> **Working agreement:** updating this log, ARCHITECTURE.md, and
> PROJECT_CONTEXT.md is part of "done" for every milestone. A milestone is not
> complete until the docs reflect it.

---

## Milestone 1 — Scaffold + model

- **D1 · TypeScript (not plain JS).** *User fork.* The Document/Block/Word model
  is the spine; static types give compile-time safety for indexing/seeking and a
  cleaner contract for the future React Native port. The spec's examples were
  already typed.
- **D2 · Persistence: settings-only, deferred.** *User fork.* When localStorage
  lands, persist global settings (bionic, WPM, mode, theme) but **not** document
  position (no stable doc identity yet). Not implemented through M5 — flagged for
  a later milestone.
- **D3 · Hand-built Vite scaffold.** Avoided `npm create vite` boilerplate; built
  the minimal shell directly to keep M1 tightly scoped to project + model +
  tokenizer.

## Milestone 2 — Markdown parser + Reader

- **D4 · Custom Markdown tokenizer, no `marked`.** We only need block + inline
  *text*, not HTML. A small dependency-free tokenizer keeps the dep surface at
  zero. Parsing quality is allowed to vary in v1 (the format dropdown is the
  user's escape hatch to a cleaner source).
- **D5 · Lists/blockquotes collapse to `paragraph`.** The v1 model has only
  `heading | paragraph`. List items → one paragraph each; blockquote lines →
  merged paragraph. Preserves reading flow without new block types.
- **D6 · Strip inline markup to plain text.** Bionic owns all styling; carrying
  source bold/italic would fight it.
- **D7 · Per-word `<span data-word-id>` from the start.** Even before any pacer,
  the Reader emits per-word spans carrying the flat id — the exact hook bionic
  and the pacer later attach to, so no rewrite. (Later refined; see D19/D21.)

## Milestone 3 — Bionic + themes

- **D8 · Three-slot bionic split (`lead`/`head`/`tail`).** Spec showed two slots
  (`<b>{head}</b>{tail}`), but tokens with *leading* punctuation (`"Hello`,
  `(e.g.`) need an unbolded lead to honor "punctuation is never bolded." For the
  common case `lead` is empty and output is identical to the spec.
- **D9 · `L` counts letters only.** Digits/symbols don't inflate the bold length;
  a bare number gets no bold, `x=1;` bolds only `x`.
- **D10 · Bionic default ON, Medium.** It's the headline aid — defaulting on
  showcases it; trivially toggled.
- **D11 · Component named `BionicText.tsx`, logic in `bionic.ts`.** macOS's
  case-insensitive FS collides `bionic.ts`/`Bionic.tsx`. Distinct names also
  avoid a class of cross-platform bugs (Metro is case-sensitive).
- **D12 · Themes expanded to four, `data-theme` swap, Light default.** *User
  request (scope change from M1's "light/dark").* Light / Sepia / Dark / Dim as
  CSS-variable sets toggled by one attribute on `<html>`; explicit selection
  supersedes the OS `prefers-color-scheme`. Light is default because bionic bold
  reads with more contrast on light.

## Milestone 4 — Pacer core + Flowing Highlight

- **D13 · `word.id` IS the flat index.** `reindexWords` makes ids contiguous, so
  active-word checks are numeric compares and word→DOM lookup needs no map.
- **D14 · rAF + time accumulator (not `setInterval`).** `msPerWord` recomputed
  per frame ⇒ live WPM changes apply immediately; smoother and self-correcting.
- **D15 · Translucent highlight.** So bionic bold stays legible when both run —
  combining them is a core v1 goal.
- **D16 · Seek snaps to nearest word-like token.** Clicking punctuation or
  scrubbing onto a `—` still lands on a real word.
- **D17 · Default WPM 300, lead 1.** Lead 1 demonstrates the pull-forward feel.

## Perf hardening pass (within/before M5)

- **D18 · `@tanstack/react-virtual`.** *User fork.* Add the small, focused
  virtualization dep rather than hand-roll dynamic measurement + scroll-to-index
  (~150 fiddly lines). First runtime dep beyond React; pdf.js/JSZip already
  planned.
- **D19 · Decouple highlight from React via `indexRef` + `subscribe`.** The root
  cause of lag was re-rendering ~57k word components per tick. The pacer now
  broadcasts the index imperatively; the Reader is memoized and never reconciles
  during playback. Verified: zero `setState` on a normal tick.
- **D20 · Block-level virtualization (not word-level).** Words wrap (variable
  size); blocks are measurable boxes. Cuts mounted nodes from ~57k to ~5–15.
- **D21 · Single gliding overlay element (not per-word background).** One
  absolutely-positioned box transitions to each word's rect → smooth glide
  instead of a blink; also removes per-word class churn.
- **D22 · Fixed-height reader pane (not window scroll).** *User fork.* The pane
  is the one shared scroll container for virtualizer + overlay coords + the 40%
  auto-scroll band, so all measurements agree. Responsive `100dvh` (not a fixed
  box; `dvh` for mobile/Android chrome).
- **D23 · Clamp to ≤1 word/frame (not accumulator catch-up).** *User fork.*
  Guarantee every word is painted even under a jank frame; caps max throughput at
  refresh rate (~thousands of WPM, far above usable). The clock slows rather than
  skips.
- **D24 · Auto-scroll on line change only, 40% band.** Avoids per-word vertical
  jitter; keeps the active line in a fixed reading band.
- **D25 · Imperative `classList` for lead/chunk tints.** Re-applied every step
  and whenever the virtualizer's mounted span set changes (scroll). The trigger
  is a `useLayoutEffect([items])` inside `Reader` that calls an `onRangeChange`
  callback passed by each mode; the callback reads `pacer.indexRef.current`
  imperatively and calls `apply()` — no React state, no re-render, no flash.
  Both callback and the effect dep (`items`) are stable across pacer ticks, so
  this fires only on scroll, never per-tick. Cleared before re-adding so
  virtualization can't leak stale classes. The current-word overlay and RSVP
  anchor are separate non-React-styled elements and are unaffected by
  virtualizer remounts.

## Refinement A — Punctuation-aware pacing

- **D26 · Dwell at the clock level (not per-mode).** *User direction.* Lives in
  `usePacer`/`dwell.ts` so flowing, RSVP, and chunk all inherit it. Multipliers
  1.75× / 2.5× / 3×; composes with the ≤1/frame clamp and live WPM.
- **D27 · "Natural pauses" toggle, default ON.** Off ⇒ pure metronomic pacing.

## Milestone 5 — RSVP + Chunk + ModeSettings

- **D28 · ORP focal point left-of-centre (~40%).** *User fork.* More authentic
  ORP placement than dead-centre; implemented via asymmetric grid `2fr auto 3fr`.
- **D29 · Monospace RSVP word.** *User fork.* Constant glyph width makes the
  anchor column a constant width, so the anchor's centre is an exact fixed x for
  every word — non-drift by construction, not by tuning.
- **D30 · Single-word RSVP (chunk size fixed at 1).** *User fork.* Keeps the ORP
  anchor meaningful per flash; multi-word grouping lives in Chunk mode.
- **D31 · RSVP pause cue = depleting tick under the anchor.** *User direction.*
  Chosen over dimming/shrinking the word because the tick is an absolutely
  positioned sibling of the anchor letter — it makes the dwell perceptible
  without ever moving the anchor. Scaled by the dwell multiplier; gated on
  Natural pauses.
- **D32 · Chunk stepping in the pacer (`chunkSize`).** Advance N word-like tokens
  per step with `threshold ×= N`, keeping effective WPM consistent; dwell taken
  from the chunk's final word. Flowing/RSVP use size 1.

## Post-V1 — RSVP context strip (issue #1)

- **D42 · Additive strip, off the per-tick render path.** The context strip is a
  new independent pacer subscriber; it moves the highlight imperatively within a
  paragraph and **re-renders only on block boundaries** (per paragraph, not per
  word). No change to the pacer clock/timing. Reuses the chunk/lead imperative
  pattern.
- **D43 · Positioned so the RSVP anchor is untouched.** The strip is a separate
  element below the word; it cannot shift the `.rsvp-word` grid or the ORP
  anchor's fixed x.
  **(Positioning mechanism superseded by D49 — it was absolutely positioned at
  `top:68%`, now it's a flex-column sibling. The "anchor untouched" guarantee
  still holds: the word grid is unchanged either way.)**
- **D44 · Plain dim text, no bionic.** *User fork.* Rendered muted/small in the
  body font (not the monospace flash, no bionic bolding) so it stays peripheral —
  you notice position without starting to *read* it, which would reintroduce
  exactly what RSVP removes.
- **D45 · Clamp to ~2–3 lines + soft fade, default ON.** *User fork.* Keeps the
  strip compact/glanceable; the active line is centered by scrolling on line
  change only (never per word). Toggle "Show context" in RSVP settings, default
  on; RSVP-only by construction.
  **(Scroll model superseded by D47 — the clamp + per-line `scrollTop` jump read
  as a page-flip; default-on toggle and RSVP-only still hold.)**
- **D46 · Shared pure `blockIndexForWord` in `model/`.** Extracted the
  word→block binary search as a portable helper (Reader keeps its inline copy for
  now to avoid touching the hot path; the ~10-line duplication is acknowledged).
  **(Rationale reversed — fix/reader-use-shared-blocks.)** The audit (issue #16)
  showed `scrollToWord` is called on seek events, not per tick, so the "hot path"
  concern didn't apply. Reader's inline copy also used the stale `MAX_SAFE_INTEGER`
  sentinel (bug D55 records as fixed). Reader now imports `buildBlockStarts` /
  `blockIndexForWord` from `model/blocks.ts`; the inline copy is deleted.
- **D47 · Continuous pinned-line scroll (supersedes D45's page-flip).** *User
  direction.* The active word's line is pinned to the box center line and the
  paragraph text scrolls under it via a CSS-transitioned `translateY` on the
  inner content — lines rise one at a time. **Why:** a 3-line clamp with a
  block-swap forces the reader to re-orient at each boundary, which breaks the
  fixed-fixation benefit RSVP exists to provide; pinning the line and flowing the
  text under it keeps the fixation point stationary (the RSVP principle applied
  to the strip). A **buffered window** of blocks is rendered so context spans
  paragraph boundaries; React re-renders only when the active block nears a window
  edge (verified: ~7 re-renders across 180 words at 5 lines), and the recenter on
  a shift is instant/imperceptible. Text stays sharp — the edge fade is an alpha
  mask, not a blur. *(The `translateY` is now snapped to the line grid — D52.)*
- **D48 · "Context lines" is a live 3/5/7 setting (default 5).** *User fork.* Odd
  values guarantee a centered line with equal context above/below. Stored as
  `contextLines` in `RsvpSettings` (spread on update); the box height and
  buffered window adapt live. Shown only when "Show context" is on.
  **(Range/default superseded by D50 — now 3/5, default 3.)**

### Bug-fix pass (2026-07-02) — vertical crowding + line rendering

- **D49 · Vertical stack via a centered flex column (supersedes D43's absolute
  `top:68%`).** *User direction.* The stage is a `flex-direction: column`,
  centered, with **word → `1.8em` gap → strip**. **Why:** a fixed percentage
  `top` is decoupled from both the word's rendered height and the pause tick's
  reach (`top: calc(100% + 0.95em)`), which **both scale in word-`em`** — so at
  large font / many lines the tick grew down into the strip (overlap) and the
  strip read as *attached* to the word. Expressing the separation as an `em` gap
  on the flex column makes it scale in lockstep with the tick it must clear
  (clear space `= (1.8 − ~1.1)·F = ~0.7·F > 0` at every font size), so
  non-overlap is guaranteed *by layout*, not by hand-tuned numbers, and the strip
  reads as peripheral. Walked through both line counts × min/max font: no overlap.
- **D50 · Context lines reduced to 3/5, default 3 (supersedes D48's 3/5/7,
  default 5).** *User fork.* 7 was the main case that collided (too tall) and is
  dropped; the user finds 3 cleanest, so it's the default.
- **D51 · Context font tracks the anchor.** *User direction.* The strip's
  `font-size` is `max(0.6rem, 0.32em)` — proportional to the word (the slider
  sizes the whole stage), floored so it stays legible at the smallest anchor. A
  bigger anchor gives proportionally bigger context, so the two feel like one
  unit rather than two independent widgets.
- **D52 · Uniform line grid: length line-height + line-snapped translate +
  zero-height paragraph separator.** *User direction (fix "inconsistent line
  heights" + "paragraph break must not steal a text row").* Three coupled moves:
  (1) line-height is set as a **length** (`--rc-line`, inherited as a fixed px
  value) instead of a unitless number, so every descendant line box is identical
  and can't re-resolve per element; (2) the scroll `translateY` is **snapped to
  whole `--rc-line` multiples** so visible lines are always full line boxes (the
  ideal offset is already an integer multiple, so the active line stays
  dead-centre) — this fixes the half-clipped line that read as "smaller"; (3) the
  paragraph break is a faint **zero-height** hairline (absolutely positioned
  `::before`) so it marks the boundary **without** adding a line box, preserving
  the "N full lines of text" count and the uniform grid. Active-word emphasis is
  color-only (no bold) so it can't re-wrap the centered line.
  **(Gotcha: the zero-height `::before` needs `.rsvp-context-para` to be
  `position: relative`, which made the paragraph the spans' `offsetParent` and
  broke the offsetTop-based centering — see D53. The separator stays; the
  measurement was made offsetParent-independent.)**

### Bug-fix pass 2 (2026-07-02) — strip sync regression + latent hardening

- **D53 · Rect-based, offsetParent-independent centering (supersedes D52's
  offsetTop measurement).** *Fix a desync regression.* Adding `position:
  relative` to the paragraph (for D52's separator) silently changed the word
  spans' `offsetParent` from the scroll container to their `<p>`, so
  `el.offsetTop` collapsed to a within-paragraph value and `center()` scrolled to
  the wrong place — the strip showed an unrelated earlier paragraph (word early
  in its block) or went blank (word deep in a long block), with the highlight
  off-screen. **Why rects:** `getBoundingClientRect()` of the active span vs. the
  scroll container measures the real on-screen delta regardless of offsetParent;
  the live `translateY` is read from the computed matrix (`DOMMatrixReadOnly.m42`)
  rather than a tracked target, so a re-center *mid-transition* retargets from the
  actual position (no jitter at fast WPM). The D52 line-snap is unchanged, now fed
  a correct offset. Still zero React renders per word.
- **D54 · Visible, reflow-free active-word marker.** *Fix "no highlight
  color".* The active word uses `color: var(--accent)` **plus an underline**
  (`text-decoration`), not `font-weight` — weight would change glyph widths and
  re-wrap the centered line, while color + underline are painted and cost no
  layout. (D52's color-only `var(--text)` was too subtle and, under the D53
  regression, usually scrolled out of view.)
- **D55 · Monotonic `buildBlockStarts` (supersedes the MAX_SAFE_INTEGER
  sentinel).** *Fix a latent second desync path.* A word-less block (possible
  from PDF/EPUB) was given `MAX_SAFE_INTEGER`, which broke the sorted precondition
  of the block-lookup binary search — one mid-document empty block corrupted every
  lookup after it. Now an empty block carries the **next** word's id (the running
  count), so the array stays non-decreasing and an empty block never wins the
  search (its start ties with the following real block; ties resolve later).
  Verified headlessly (empty blocks mid/leading/trailing; old sentinel shown to
  misfire where the fix is correct).
  **(Completed — fix/reader-use-shared-blocks.)** Reader.tsx previously kept a
  separate inline copy of this logic (acknowledged in D46) still using the old
  sentinel. That copy is now deleted; Reader imports `buildBlockStarts` /
  `blockIndexForWord` directly, closing the latent drift.
- **D56 · Memoized pacer object + stable strip effect deps.** *Fix
  re-subscription churn.* `usePacer` now returns a `useMemo`'d object (identity
  changes only when `playing`/`atEnd` flip), and the strip depends on the stable
  `subscribe`/`indexRef` (destructured) rather than the whole `pacer` object — so
  it subscribes **once**, not on every parent render (WPM, settings, …).

### Post-V1 additions (2026-07-02) — strip interactions + mode-aware controls

- **D57 · Context-strip words are click-to-seek, via delegation.** *User
  direction.* One `onClick` on the strip container walks to the nearest
  `[data-word-id]` and calls `pacer.seek(Number(id))` — parity with the main
  reader, and no per-word handlers (stays off the per-tick render path; `seek`
  snaps to the nearest word-like token, so clicking punctuation is fine). The
  strip's `pointer-events` flips from `none` to `auto`; words show a pointer
  cursor + hover tint. **A11y note:** the strip stays `aria-hidden` (it's a
  peripheral visual echo of the reader), so this is a mouse convenience — the
  accessible seek paths remain the main reader's click and the keyboard transport.
- **D58 · Hide the bionic controls in RSVP (don't disable, don't reset).** *User
  direction.* RSVP flashes one ORP-anchored word; bionic bolding doesn't apply,
  so the toggle + intensity chips are a `showBionic` gate in `Settings`
  (`mode !== 'rsvp'`). They're **not rendered** in RSVP but their state is
  untouched, so they return exactly as left when switching back to flowing/chunk.
  (Line width stays visible in RSVP — it drives the word grid's max-width and the
  strip width; only Text size is RSVP-irrelevant, handled by D59.)
- **D59 · Hide the global Text size slider in RSVP.** *User fork (chose "hide"
  over unifying / disabling).* In RSVP the global `--reader-font-size` does
  nothing (RSVP sizes its stage from its own Font size control), so the slider is
  a `showTextSize` gate in `Settings` (`mode !== 'rsvp'`) — same pattern as D58.
  **Why hide, not unify:** body size and RSVP-word size have different ranges and
  purposes and are worth keeping independent (a comfortable body size *and* a big
  RSVP word); unifying would merge `ReaderDisplay.fontSize` with
  `RsvpSettings.fontSize` and lose that. **Line width stays** in RSVP (it sizes
  the word grid + strip). State is untouched; the slider returns on mode switch.

## Documentation discipline (2026-06-26, established before M6)

- **D33 · ARCHITECTURE.md + DECISIONS.md + living PROJECT_CONTEXT.md, maintained
  every milestone.** *User direction.* The codebase is headed to React Native, so
  docs are load-bearing. ARCHITECTURE.md separates portable logic from the web
  layer; this log is append-only; PROJECT_CONTEXT scope stays current. Docs are
  part of "done" for each milestone. (FINDINGS.md was later added to this set in
  the M7 audit.)
  *(Relocated 2026-06-29 from the end of the file to restore sequence — see
  Corrections.)*

## Milestone 6 — PDF + EPUB parsers

- **D34 · Cleanup heuristics kept pure and separate.** PDF cleanup
  (`pdfText.ts`) and EPUB structure (`epubStructure.ts`) are DOM/lib-free, so
  they're unit-testable and portable; only the thin `pdf.ts`/`epub.ts` wrappers
  touch `pdfjs-dist`/`JSZip`. Verified headlessly (synthetic PDF lines; a
  constructed EPUB parsed end-to-end).
- **D35 · EPUB parsed by targeted string scanning, not DOMParser.** Keeps the
  parser dependency-free, testable in Node, and portable to React Native (where
  DOMParser may be absent). EPUB XHTML is well-formed enough for v1; quality is
  allowed to vary. A backreferenced block-tag regex makes an outer block consume
  nested children so paragraphs aren't double-counted.
- **D36 · Dynamic-import code-split for PDF/EPUB.** `parse()` lazy-loads the
  format modules, so pdf.js (~470 kB) and JSZip (~100 kB) never burden a
  Markdown-only session. Main bundle stayed ~190 kB (61 kB gz).
- **D37 · Scanned-PDF detection by extracted-text volume.** If total visible
  characters fall below a small per-page floor, treat as image-only and throw a
  clear "convert to Markdown/EPUB" message (spec §7.4). Heuristic, not OCR.
- **D38 · File-format auto-detect by extension, dropdown as override.** The
  format dropdown is the explicit selector (spec), but a recognized extension
  auto-selects it; the dropdown disambiguates otherwise (e.g. `.txt` → Markdown).

## Milestone 7 — Polish (final V1)

- **D39 · Reader typography via CSS variables + `layoutKey`.** Font size and line
  width are CSS custom properties on the app shell (one place, no prop threading
  to every word); the in-place modes get a derived `layoutKey` so the
  overlay/highlight reposition when typography changes the layout. RSVP keeps its
  own independent font-size setting.
- **D40 · Keyboard transport, but yield to focused controls.** Space/←/→/Home
  drive the pacer globally, except when an input/select/textarea/**button** is
  focused — otherwise Space would double-fire (native button click + toggle) and
  arrows would hijack sliders.
- **D41 · Empty document is an error, not a blank reader.** A parse that yields
  zero blocks (e.g. an empty/whitespace file) is rejected with a clear message
  rather than showing an empty pane.

## Bug-fix — PDF em/en-dash corruption (issue #10)

- **D60 · Split `ENDS_HYPHEN` into `ENDS_SOFT_HYPHEN` + `ENDS_DASH` with distinct
  join behaviours.** The original `ENDS_HYPHEN` ranged over U+2010–U+2015, which
  included em/en dashes; a line ending in `—` followed by a lowercase line had the
  dash silently deleted ("going—" + "but" → "goingbut"). Fix: `ENDS_SOFT_HYPHEN`
  covers only true word-continuation hyphens (ASCII `-`, U+00AD soft hyphen,
  U+2010 hyphen) and de-hyphenates as before; `ENDS_DASH` covers U+2013/U+2014 and
  keeps the dash with no space. A sub-check inside the `ENDS_DASH` branch mirrors a
  leading space when present ("going —" + "but" → "going — but") so space-padded
  dashes stay symmetric. Verified headlessly: 8 input/output pairs including the
  repro case, the spaced-dash case, soft-hyphen stripping, and the paragraph-boundary
  guarantee (gapBefore fires before the join branch, so a dash-ended paragraph-final
  line can never glue to the next paragraph). Build clean.
- **D61 · No sentence-boundary heuristic for em-dash + uppercase.** When an em-dash
  line is followed by an uppercase word ("going—" + "But"), the join produces
  "going—But" with no space. An uppercase letter is not a reliable signal of a new
  sentence — it could be a proper noun mid-clause. Guessing here would add a fragile
  heuristic; the dash is punctuation that should stay attached. Alternative rejected:
  treat uppercase-after-dash as a sentence break and insert a space.

## Bug-fix — EPUB percent-encoded hrefs silently skip chapters (issue #11)

- **D62 · Decode OPF manifest hrefs before `resolvePath` + zip lookup.**
  OPF `href` attributes are URI-encoded (e.g. `"My%20Chapter.xhtml"`), but JSZip
  stores entries under their decoded names (`"My Chapter.xhtml"`), so a raw
  `zip.file(href)` misses. Fix: `safeDecodeHref` wraps `decodeURIComponent` in a
  try/catch (a bare `%` in a filename would throw; the fallback leaves the string
  unchanged so malformed sequences fail gracefully). Decoding is applied in
  `parseOpfSpine` before calling `resolvePath` — the right layer because (1) OPF
  attribute interpretation belongs in the pure structure parser, not the zip I/O
  wrapper, and (2) `resolvePath` splits on `/` and strips `#`/`?` on the decoded
  string, so `%2F`/`%23` sequences are never misread as path separators or fragment
  delimiters. Verified headlessly: %-encoded href resolves correctly; normal href
  unchanged; malformed `%` falls back without throw; genuinely-missing entry
  warns + skips. Build clean.
- **D63 · Replace silent `continue` with `console.warn` for missing spine entries.**
  After the D62 fix, a skipped entry means a genuinely malformed EPUB (the zip
  is missing a file the OPF references). The bare `continue` gave no signal; the
  warn logs `[epub] spine entry not found in zip: "…" — chapter skipped` so
  developers can diagnose without a user needing to report "missing chapters."
- **D64 · User-visible skipped-chapter surfacing deferred to follow-up (issue #26).**
  Threading a `warnings: string[]` through `parseEpub` and wiring it to a UI
  toast/banner is the correct next step, but was deliberately excluded from the
  #11 fix to keep the change minimal and focused. Filed as issue #26. The
  `console.warn` is the interim signal. Alternative rejected now: surfacing warnings
  in-UI here would expand scope and touch the React layer without a design decision
  on where/how to show them.

## Bug-fix — EPUB malformed numeric entity (issue #12)

- **D65 · Guard `decodeEntities` numeric-entity path against code points above U+10FFFF.**
  Added `code >= 0 && code <= 0x10FFFF` to the `Number.isFinite` check on line 43 of
  `epubStructure.ts`. `Number.isFinite` only rejects `NaN`/`Infinity`; it passes
  `0x110000` (1114112), which is finite but one above the Unicode scalar-value ceiling,
  causing `String.fromCodePoint` to throw `RangeError` and abort the entire parse.
  Fallback for out-of-range: return `whole` (the raw entity text, e.g. `&#x110000;`).
  Rationale: consistent with the existing fallback for unrecognized named entities and
  `parseInt → NaN`; nothing is silently lost; a reader can search the output to locate
  the malformed content. Alternatives rejected: drop silently (loses data), emit U+FFFD
  (mutates content the parser didn't understand). The `code >= 0` guard is redundant
  given the regex can't produce a negative, but included for defensive symmetry.
  Named entities take a separate `else` branch and are unaffected. Surrogates
  (0xD800–0xDFFF) are within [0, 0x10FFFF]; `String.fromCodePoint` does not throw for
  them — they pass through as before. Fixes #12.

## Bug-fix — pdf.js worker leak (issue #15)

- **D66 · `try/finally` with `await loadingTask.destroy()` covers all exit paths.**
  `pdfjs.getDocument({ data })` returns a `PDFDocumentLoadingTask` whose worker
  persists until `loadingTask.destroy()` is called. The original code chained
  `.promise` directly and discarded the task reference, so `destroy()` was
  unreachable on every exit path (normal return, scanned-PDF throw, intermediate
  `await` throw). Fix: store the task in `loadingTask`, wrap the body in
  `try/finally`, and `await loadingTask.destroy()` in the `finally` block.
  `destroy()` returns `Promise<void>`; awaiting in `finally` ensures the worker
  shuts down before the call stack unwinds — the delay is negligible.
  The fix is contained entirely inside `parsePdf`; no call sites, no types, no
  other files change. `pdf.cleanup()` is NOT additionally needed: `loadingTask.destroy()`
  subsumes it. Alternative rejected: calling `pdf.destroy()` — `PDFDocumentProxy`
  has no `.destroy()` method in v6; only `PDFDocumentLoadingTask` does.
  Fixes #15.

## Corrections
- **2026-06-29:** D33 was originally appended at the end of the file (after M7's
  D39–D41) under a trailing "Documentation discipline" heading, leaving M6
  reading D32 → D34. No decision was missing — D33 was merely out of sequence. It
  has been moved to its correct chronological position (the 2026-06-26
  documentation-discipline section, which was established before M6) so the log is
  monotonic D1→D41. This is the one sanctioned reorder; the log remains
  append-only otherwise. Note: "monotonic D1→D41" describes numeric **assignment**
  order, not file reading order — the latter now differs because the later Post-V1
  sections (D42–D59) were inserted *before* the Documentation-discipline/M6/M7
  sections in the file (parallel to the D33 situation), so a reader hits D42 before
  D33–D41.

## Feature — Reading-position persistence (issue #6)

- **D67 · Sampled SHA-256 fingerprint for book identity, not filename.**
  Content hash means the same book is recognised after renaming, moving, or
  re-downloading. Filename + path was rejected (breaks on any file move).
  Full-file SHA-256 was rejected for large PDFs (~100–300 ms on 50 MB);
  the sampled strategy hashes the first 32 KB + middle 32 KB + last 32 KB
  + 8-byte big-endian file size (total input: 96 KB + 8 B), giving
  imperceptible latency (~2–5 ms via `crypto.subtle`) with negligible
  collision risk for real books. Threshold between full/sampled: 96 KB.

- **D68 · `readingaid_v1:` localStorage key prefix, not `rat:` or bare keys.**
  The version marker (`_v1`) lets us detect and migrate old schema in a future
  version without guessing what format unknown keys contain. `rat:` was
  rejected as terse and unreadable in DevTools. Issue #3 (presets) will
  build on the same `storage.ts` wrapper and inherit this prefix.

- **D69 · Two-layer position model: `latest` (always updated) + `history` (gated).**
  `latest` is the resume bookmark — it must reflect the current position on
  every save trigger so it is never stale. `history` is a rolling recovery log
  (max 5 entries, newest first), with a new snapshot appended only when the
  position has moved >2 % from the previous history entry. The gate applies
  exclusively to `history`; `latest` is unconditional. Storing `latest`
  separately from `history` makes the semantics unambiguous.

- **D70 · Pre-reader interstitial screen, not a modal or in-reader banner.**
  The resume prompt replaces the file-input screen while the user decides.
  A modal was rejected (blocks/obscures the reader, which is not yet shown).
  An in-reader banner was rejected because it would momentarily show the
  reader at position 0 before the seek (a flash of wrong content). The
  interstitial sidesteps both problems and requires no z-index stacking.

- **D71 · App phase state machine ('idle' | 'resume-prompt' | 'reading').**
  Replacing the old `!doc` / `doc` boolean with an explicit phase enum makes
  the three distinct states legible and prevents the reader from rendering
  during the resume-prompt phase. Alternative (show reader behind a modal)
  was rejected per D70.

- **D72 · `pacer.seek()` called directly in `handleResume`; no deferred ref needed.**
  The `usePacer` effect resets the index to 0 when `words` changes. `words`
  changes when `doc` is set (in `handleLoad`), which happens before the
  resume-prompt screen is shown. By the time the user can click "Resume",
  the pacer is already at 0, so a direct `pacer.seek(savedWordIndex)` in
  the click handler is sufficient. A deferred ref (proposed approach in
  planning) was found unnecessary and was eliminated.

- **D73 · Save on 30 s interval + `visibilitychange` → hidden + `pagehide`.**
  The interval caps data loss from a crash to ~30 s. `visibilitychange` covers
  tab-switching and app backgrounding. `pagehide` is preferred over
  `beforeunload` because it fires more reliably in modern browsers (especially
  on iOS). The "← Load another" button also saves before navigating back.

- **D74 · Do not save position 0; wait until the user has moved past word 0.**
  Saving a 0 position immediately on document load would produce a pointless
  "Resume at 0%?" prompt on the next load. The save guard `wordIndex === 0 →
  skip` prevents this while still saving after "Start from beginning" once
  the user has actually read past the first word. The `latest.wordIndex > 0`
  check in `handleLoad` mirrors this: a record where latest is still at 0 is
  treated as unrecognised (no prompt shown).

- **D75 · History entries filtered by >5 % from `latest` for the "Earlier
  positions" UI; >2 % threshold governs history append.**
  Two separate thresholds serve two different purposes: the 2 % append gate
  prevents redundant history snapshots from rapid periodic saves, while the
  5 % UI filter removes entries that are so close to the resume point that
  they offer no meaningful recovery value. The "Earlier positions" section
  is hidden entirely when no useful history exists.

- **D76 · Built-in sample gets a fixed fingerprint `__builtin_sample__`.**
  `parseMarkdown(SAMPLE_MARKDOWN)` produces no `File` object, so there is
  nothing to hash. A fixed sentinel string gives the sample persistent
  position tracking across sessions (a nice-to-have) without special-casing
  it in storage logic. Alternative (no persistence for the sample) rejected
  as inconsistent.

## Feature — Presets system (issue #3)

- **D77 · Built-ins defined in code; user presets in localStorage.**
  Built-in presets are a constant array (`BUILTIN_PRESETS`) — always available,
  zero storage cost, no migration risk. User presets live in localStorage under
  `readingaid_v1:presets` (`{ version: 1, userPresets: UserPreset[] }`) using
  the existing `storage.ts` wrapper. Alternative (all presets in localStorage)
  rejected: built-ins would require a seeding step and could be accidentally
  deleted by the user.

- **D78 · Preset captures the full settings bundle in one atomic object.**
  `PresetBundle` holds all 13 settings fields. Applying a preset fires all
  nine `setState` calls in a single event handler — React 18 batches them into
  one render pass. Alternative (diff and apply only changed fields) rejected:
  more complex, and a preset is by definition a complete named state, not a
  partial patch.

- **D79 · `isModified` derived by shallow-comparing `currentBundle` to a
  `lastAppliedBundle` ref; no extra setter threading.**
  When `applyPreset` fires it writes `lastAppliedBundle.current = bundle`.
  `isModified` is computed each render by comparing all 13 fields via
  `bundlesEqual`. This means no "mark modified" callback needs to be threaded
  through every existing change handler. Alternative (per-setter modified
  flag) rejected as brittle — a new setting would require a new flag.

- **D80 · "Save as" never auto-overwrites; always creates a new user preset.**
  Overwriting would silently destroy the original; the name-input flow makes
  the save explicit and reversible (the user can still delete later). The new
  preset is immediately marked as the active preset, clearing the Modified
  badge.

- **D81 · "context on" dropped from Ironclad.**
  *User direction.* The RSVP context strip only operates in RSVP mode; in
  chunk mode it is inert. Shipping a preset that implies a feature it cannot
  deliver is dishonest. Ironclad's comprehension value comes from slow pace +
  chunk 3 + high bionic — the description was updated to reflect that.
  Alternative (store rsvp.showContext:true in the bundle anyway) rejected:
  adds invisible state that would activate unexpectedly if the user later
  switches the preset to RSVP mode.

- **D82 · "monospace ORP" and "reduced-motion-friendly" are descriptions, not
  settings.**
  RSVP always uses the ORP monospace grid (no toggle); chunk mode is
  inherently lower-motion than flowing (no glide animation). Neither requires
  a new setting. The corresponding copy is flavor only; the valid values
  (`mode: 'rsvp'` / `mode: 'chunk'`) deliver the effect automatically.

- **D83 · Preset groups inferred from `bundle.mode` for user presets.**
  User presets get their `group` set at creation time from `bundle.mode`
  (flowing → `'flowing'`, rsvp → `'rsvp'`, chunk → `'chunk'`). The
  cross-cutting group (`'cross'`) is reserved for built-ins; user presets
  always land in a mode group. Alternative (let users choose the group)
  rejected as unnecessary complexity for v1.

- **D84 · PresetsPanel renders as a block in `app-top`, between toolbar and
  PacerControls.**
  The panel button and expandable body are co-located in one component.
  Alternative (button in `reader-toolbar-controls`, panel as a sibling via
  absolute positioning) rejected: requires overflow management and z-index;
  the inline block approach is robust, keeps the DOM flat, and reads
  naturally in the vertical toolbar stack.
