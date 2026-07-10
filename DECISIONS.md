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
  - *Correction (2026-07-08):* the deferral above was accurate as of M5.
    Document-position persistence was subsequently implemented in issue #6
    (see D67–D76), using a content fingerprint for book identity. Settings
    auto-persistence (WPM/bionic/theme across reloads) remains deferred. Original
    entry left intact per append-only discipline.
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
  callback passed by each mode; the callback is stable across pacer ticks, so
  this fires only on scroll, never per-tick. Cleared before re-adding so
  virtualization can't leak stale classes. The current-word overlay and RSVP
  anchor are separate non-React-styled elements and are unaffected by
  virtualizer remounts. **Superseded in part by D85** — `onRangeChange` no
  longer calls the pacer's full `apply()`; it calls a class-only helper that
  never touches scroll, because "scroll" here includes the user's own manual
  scroll, not just pacer-driven ones.

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

  ## Bug-fix — manual scroll snapped back to the pacer position (issue #17 regression)

- **D85 · Split `apply()` into a class-only path and a scroll-owning path;
  `onRangeChange` may only call the former.** D25's fix for #17 wired
  `onRangeChange` (fires on any virtualizer mounted-item-set change, including
  a manual scroll) directly to each mode's `apply()` — which, besides
  reapplying `pacer-lead`/`pacer-chunk` classes, also owned the D24 40%-band
  auto-scroll and an off-window `scrollToWord` recovery. Because a manual
  two-finger scroll or scrollbar drag is itself what changes the virtualizer's
  mounted range, it re-triggered `apply()`'s auto-center, which forced the
  pane back to `pacer.indexRef.current` — fighting the user identically
  whether the pacer was playing, paused, or stopped (nothing in the chain
  ever checked `pacer.playing`).

  Fix: `FlowingHighlight.tsx` and `ChunkHighlight.tsx` each split the class
  bookkeeping into its own helper (`updateLeadClasses` / `updateChunkClasses`)
  with zero scroll calls. `onRangeChange` now calls only that helper.
  `apply()` keeps `scrollWordToBand`/`scrollToWord` but is reached only from
  pacer-driven paths: the `pacer.subscribe` tick callback (which also covers
  `seek`/`restart`, since both route through `commit()` → listener
  notification), the document-change reset effect, the bionic/settings/
  layoutKey relayout effect, and the resize effect — none of which fire from
  a scroll event. Alternative rejected: gating the existing auto-scroll on
  `pacer.playing`. That would still re-center on every manual scroll while
  playing (the more common case) and wouldn't explain or fix why a paused
  seek should still recenter once — the real distinction is "did the pacer's
  position change" (tick/seek/restart/document-change), not "is it currently
  playing."

  The overlay-position update in `FlowingHighlight` was dropped from the
  class-only path rather than gated: per F19, the overlay is a plain
  `.reader-content` child outside the virtual item list, so it already
  survives virtualizer remounts untouched and never needed repositioning on
  `onRangeChange`.
  Fixes #17-regression. See FINDINGS.md F21.

## Feature/bug-fix — Minimal HUD during playback + space-bar pause trap (issue #38)

- **D86 · Space is routed separately from the blanket control-yield guard;
  only BUTTON/SELECT/TEXTAREA/text-`INPUT` yield Space (annotates/narrows
  D40).** **Superseded by D89** — browser testing found this yield-set both
  too broad (yielded for *every* BUTTON/SELECT, not just Play/Pause — issue
  #38 bug #3) and, via its `if (tag !== 'INPUT') return false` default, too
  eager to yield for elements that were never form controls at all (a clicked
  word `<span>`, or `<body>` after a click drops focus there — bug #2). D89
  has the corrected design. Left intact below per append-only discipline;
  read D89 for what actually shipped. *Real bug, user repro (original report).*
  D40's keydown handler bailed out of Space
  (and arrows/Home) for **any** focused `INPUT`/`SELECT`/`TEXTAREA`/`BUTTON`.
  That's correct for arrows (don't hijack a slider/select) and correct for
  Space-on-a-BUTTON (native click already toggles the pacer; re-handling would
  double-fire), but it also meant Space was swallowed by a focused **WPM
  number**, **Word number**, or **scrubber range** field — the user adjusts
  WPM mid-read, presses Space to pause, and nothing happens because focus is
  still in the number input. Fix: a pure predicate,
  `spaceTogglesFrom(el)` (`src/pacer/keyboard.ts`), returns `true` (pacer
  should toggle) for `INPUT[type=number]` and `INPUT[type=range]` — Space is
  inert text in both, so claiming it costs nothing — and `false` (yield to
  native behavior) for `BUTTON`, `SELECT`, `TEXTAREA`, and text-type `INPUT`s
  (notably the PresetsPanel save/rename name field, where a literal space must
  still be typeable). The App.tsx keydown handler checks this predicate
  **before** the existing blanket tag-based guard, which remains unchanged and
  still governs arrows/Home. **The BUTTON path is untouched** — the predicate
  returns `false` for it exactly as the old blanket guard did — so the D40
  double-fire guard (native click + a second toggle from the handler) cannot
  reappear. Verified headlessly against the real bundled predicate (esbuild →
  Node): number/range → `true`; button/select/textarea/text-input/checkbox/
  radio → `false`; `null` target → `true`. See FINDINGS.md F22.
  Alternatives considered and rejected: blurring the WPM field on commit (the
  field commits live on every keystroke via `onChange`, so there's no natural
  "commit" moment to hang a blur off, and it wouldn't cover the Word field or
  scrubber); relying on Part A's HUD collapse alone to remove the trap fields
  (D87) — that only helps while *playing*; the equally-real paused→play flow
  (focus the WPM field while paused, press Space to start) is untouched by
  hiding fields only during playback, so a fix that only works one direction
  isn't a fix.

- **D87 · HUD collapse changes `.app-top`'s height only, never `.reader-pane`'s
  width; implemented as a CSS `max-height`/opacity transition on existing row
  classes, not conditional unmount.** **Ceiling values corrected by D89** —
  the 6rem/6rem/32rem/2rem figures below clipped real content even at rest
  (issue #38 bug #1: the theme selector disappeared); D89 raises them. The
  height-only/never-width mechanism and the RSVP-glide/no-re-wrap reasoning
  below are unchanged and still accurate. *User direction (issue #38 Part A).*
  While `pacer.playing`, `.app-top` gets a `.playing` class; four existing
  row classes (`.reader-toolbar-controls`, `.mode-settings`, `.presets-panel`,
  `.kbd-hint`) collapse via `max-height: 0; opacity: 0; margin-top: 0` under
  `.app-top.playing`, each with its own already-generous ceiling as the
  un-collapsed value. Because `.app-shell` is a fixed-height flex column with
  `.app-top` as `flex: none` and `.reader-pane`/`.rsvp-stage` as `flex: 1`,
  shrinking `.app-top`'s rendered height only grows the *sibling* — pane
  **width** (and therefore reading-column wrap) never changes, so flowing/
  chunk text never re-wraps mid-transition and `scrollTop` is preserved by
  construction (nothing about word positions relative to `.reader-content`
  moves). RSVP's `.rsvp-stage` is `flex: 1; justify-content: center`, so as
  `.app-top` shrinks each transition frame, the flexed remaining space grows
  and the centered word glides down in lockstep — guaranteed by flexbox
  layout, not by any JS repositioning. **Known caveat, flagged rather than
  hidden:** the `max-height` transition technique animates the *ceiling*
  value, not the actual content height; a row shorter than its ceiling (e.g.
  a collapsed PresetsPanel under its 32rem ceiling) will visually snap in the
  tail portion of the transition rather than shrinking proportionally
  throughout. Documented as a browser-verification item (FINDINGS F22) rather
  than silently switching to the fade-then-unmount fallback the plan allowed —
  that fallback is the documented next step if this reads janky in the browser.
  Rejected alternative: plain conditional unmount of the collapsible rows —
  produces an instant `.app-top` height snap (the exact "reader jump" #38
  forbids, most visible as an RSVP word jump rather than a glide).

- **D88 · `PacerControls` stays mounted across the HUD switch; `compact` is a
  prop, not a remount; the progress-bar/% elements are hoisted to a shared
  JSX position; WPM keeps a live compact slider (number field dropped); the
  scrubber and Word field are dropped entirely during playback (not just
  visually hidden).** **WPM control choice reversed by D89** (issue #38 item
  5) — compact mode now shows the number box, not the slider; the
  stays-mounted/hoisted-`pctRef`/scrubber-and-Word-field-dropped decisions
  below are unchanged. *User direction, resolving the plan's open questions.*
  `PacerControls` already owns an imperative `pacer.subscribe` writing into
  `fillRef`/`pctRef` — swapping to a *separate* HUD component would tear that
  subscription down and re-init it across every play/pause, causing a visible
  progress-bar flash/reset at exactly the transition boundary. Instead
  `compact={pacer.playing}` is passed straight into the existing component,
  which conditionally renders only the surrounding fields. The `pctRef` span
  previously lived inside the (now-conditional) Word-field `<label>`; it's
  hoisted to an unconditional position immediately after the transport buttons
  so it renders at the same JSX slot regardless of `compact`, and the
  subscription's `if (pctRef.current)` write is never aimed at a torn-down
  node. **WPM:** the range slider is common to both layouts (same JSX
  position, `pacer-wpm-compact` class only changes its width) so WPM stays
  live-adjustable while playing; the number field is dropped in compact mode
  since (a) it's one of the #38 trap fields and (b) removing the number entry
  while keeping the slider satisfies "get out of the way" without losing live
  control. Rejected alternative: a read-only WPM readout — considered in the
  original plan, but the user chose to keep it live-adjustable; a range input
  is Space-safe per D86, so it introduces no new trap. **Scrubber + Word
  field:** dropped entirely while playing (not CSS-hidden-but-present) — the
  HUD shows only the read-only progress bar/%; seeking during playback stays
  available via arrow-key transport and click-to-seek on a reader word
  (unaffected, delegated handlers). Rejected alternative: keep the scrubber
  visible but disabled — out of scope per the user's explicit "dropped"
  instruction, and a disabled range control still occupies HUD space the
  minimalism goal is trying to reclaim.

## Bug-fix pass — issue #38 browser-testing QA round (corrects D86–D88)

Browser testing of the uncommitted #38 branch surfaced four real bugs and
requested two feature changes. Corrections are made directly in D86–D88 above
(nothing here was ever committed/shared, so there's no history to preserve by
leaving the bugs in place) — this entry is the record of *what was wrong and
why*, for anyone reading the superseded text.

- **D89 · Space predicate redesigned to default-to-toggle with a narrow,
  enumerated yield set; HUD collapse ceilings raised to stop clipping at
  rest; disabled buttons made visually legible; compact WPM reverted to a
  number box; WPM floor lowered 100 → 50.**

  **Bug #2 (Space after word-click seeks scrolls the page instead of
  toggling) and bug #3 (Space toggles the Presets panel / Mode dropdown
  instead of the pacer) shared one root cause.** D86's predicate was
  `if (tag !== 'INPUT') return false` — i.e. it **defaulted to yield** for
  anything that wasn't literally an `<input>`, and separately yielded for
  *every* `BUTTON`/`SELECT` unconditionally. Diagnosis of bug #2 (traced
  through `Reader.tsx`'s `handleClick`, not assumed): the word `<span>` has no
  `tabIndex` and no `.focus()` call, and `handleClick` never calls
  `stopPropagation()` — so clicking a word does not focus the span; the
  browser drops focus to `<body>` (a non-`INPUT` element) instead. The old
  predicate yielded for `<body>` too, so the handler returned without calling
  `preventDefault()`, and the browser's native Space-scroll fired. Bug #3 was
  the same default, hitting `BUTTON` (Presets toggle, any preset card) and
  `SELECT` (Mode dropdown) instead of only the Play/Pause button the yield was
  ever meant to protect.

  **Fix:** the predicate (`src/pacer/keyboard.ts`) now defaults to **toggle**
  and yields only for a narrow, enumerated set: `TEXTAREA`; the Play/Pause
  button *specifically*, identified by a marker attribute
  (`pacerToggleButtonProps`, spread onto that one `<button>` in
  `PacerControls.tsx`) rather than by tag name — every other `BUTTON`
  (Presets toggle, Restart, Load another, a preset card, …) now toggles the
  pacer; `SELECT` (the Mode dropdown's native "open on Space" is deliberately
  overridden) now toggles; and `INPUT` types with a genuine native Space
  action of their own — `text` (covers the preset-name/rename fields without
  a special case), `checkbox`, `radio`, `file` — still yield. `checkbox`/
  `radio` weren't explicitly named in the bug report, but were added
  proactively: a focused checkbox (Bionic reading, Natural pauses) has a real
  native "toggle checked" action on Space, exactly the kind of collision D40
  was written to prevent for buttons — leaving it out of the yield set would
  have meant pressing Space to check a settings box also paused/played the
  pacer as an unrequested side effect. **The Play/Pause button path is now
  *more* precisely exempted than before** (matched by attribute rather than
  by tag), so D40's double-fire guard cannot reappear — confirmed by the
  headless test asserting the marker-attribute button yields while every
  other button toggles. Verified headlessly (13 checks, real bundled
  predicate): number/range/other-buttons/SELECT/word-span/`<body>`/null →
  toggle; the marked Play button/TEXTAREA/text/checkbox/radio/file → yield.

  **Bug #1 (theme selector hidden behind the Presets row).** Root cause:
  D87's collapse CSS applied `max-height`/`overflow: hidden` to
  `.reader-toolbar-controls` etc. **unconditionally** — not scoped to only
  the `.playing` state — with a 6rem ceiling. Settings (bionic toggle + 3
  chips + natural-pauses checkbox + 2 sliders) plus ThemeSelector's chips
  wrap well past 6rem in ordinary use, so `overflow: hidden` silently clipped
  whatever didn't fit even while the pacer wasn't playing — and ThemeSelector,
  rendered last in the flex-wrap flow, was the part clipped away. This was a
  sizing error, not a design error: the *mechanism* (D87 — collapse via
  `max-height`, height-only/never-width) is correct and unchanged; the
  *numbers* were guessed without rendering the real content. Fix: raised the
  resting-state ceilings for `.reader-toolbar-controls`/`.mode-settings`/
  `.presets-panel` to 40rem (`.kbd-hint`, a single short line, to 4rem) —
  large enough that `min(natural-content-height, ceiling)` equals the natural
  height for any realistic content, so the resting state is visually
  unclipped, identical to having no `max-height` at all. This makes the
  already-documented D87 tail-snap caveat (the transition is proportional to
  the ceiling, not the actual content height) somewhat more pronounced for
  short rows — a deliberate tradeoff: a bug that silently deletes UI is worse
  than an imperfect animation curve, and the caveat was already flagged as a
  browser-verification item (FINDINGS F22), not a guarantee.

  **Bug #4 (RSVP: Play/Pause stops responding — to click, not just Space —
  after a context-strip seek), diagnosed before any fix was written, per
  instruction.** Traced to `PacerControls.tsx`'s pre-existing (confirmed via
  `git show HEAD:src/pacer/PacerControls.tsx` — present before any #38 work)
  `disabled={pacer.atEnd && !pacer.playing}` on the Play/Pause button, and
  `usePacer.ts`'s `commit()`, which sets `atEnd = true` whenever
  `firstWordlikeFrom(words, next + 1) === -1` — i.e. whenever the current
  position has no word-like token after it. The built-in sample document is
  ~150 words; the RSVP context strip's buffered window
  (`pad = Math.max(3, contextLines)` blocks either side) surfaces enough of a
  short document that its last block — and therefore its last word — is
  frequently visible and clickable. Seeking there via the strip's
  `onSeekClick` → `pacer.seek()` → `commit()` sets `atEnd = true`, which (a)
  makes the button natively `disabled` — blocking **both** click and keyboard
  activation, matching "not just Space, the click itself is broken" exactly —
  and (b) makes `pacer.toggle()`'s own internal guard
  (`firstWordlikeFrom(...) !== -1`) refuse to start playing even via the
  global Space handler, which doesn't check `disabled` at all. **This is not
  a regression from the #38 HUD/predicate work** — the disabling logic
  predates this branch — and it is not unique to RSVP; seeking to the last
  word via the main reader's click-to-seek in flowing/chunk mode would trip
  the same guard. It reads as "broken" rather than "expected" because the
  button has **no visual difference when disabled** — `button { color: #fff;
  background: var(--accent); }` is set unconditionally and no `:disabled`
  rule existed, so the browser's default disabled dimming was overridden and
  the button looked fully active while silently doing nothing. **Fix scope,
  deliberately narrow:** added `button:disabled { opacity: 0.5; cursor:
  not-allowed; }` (and excluded `:disabled` from the hover brightness filter)
  so the state is legible. The underlying behavior — you cannot press Play
  past the last word — is left intact; changing *that* (e.g. auto-restart
  from the beginning when Play/Space is pressed at the end) is a product
  decision about pacer semantics, not a bug fix, and wasn't made unilaterally.
  Flagged as an open question below, not decided silently.

  **Item 5 (compact WPM control reverted from slider to number box).** *User
  direction, reversing D88's choice.* `PacerControls.tsx`'s compact layout now
  renders the same `<input type="number">` used in the full/paused view
  (dropping only the slider) instead of a `pacer-wpm-compact`-styled range
  input; the now-unused CSS class was removed. Space-safety is unaffected —
  number inputs were already in the toggle set under both the old and new
  predicate — confirmed by the existing "number input -> toggles" headless
  check, which covers this box unchanged.

  **Item 6 (WPM floor lowered 100 → 50).** *User direction; specific value is
  this pass's judgment call, flagged per the user's own "your call, but flag
  what you chose" instruction.* `WPM_MIN` in `PacerControls.tsx` changed from
  100 to 50. Not left uncapped downward: `usePacer`'s clock computes
  `msPerWord = 60000 / WPM`, which diverges to `Infinity` as `WPM → 0` — an
  allowed `WPM = 0` would make the pacer never cross its advance threshold,
  effectively freezing it silently (not a crash, but a confusing "Play does
  nothing" state indistinguishable from bug #4 to an unsuspecting user). 50
  was chosen over some other positive floor because it's a clean multiple of
  the existing `step={10}` granularity, sits meaningfully below the old 100
  floor for very deliberate/accessibility-driven reading, and was the value
  the user suggested as a starting point. `WPM_MAX` (1000) is untouched.

## Bug-fix — Markdown parser corruption (issues #41, #42)

- **D90 · Ordered-list markers only interrupt an in-progress paragraph when
  the start number is 1 (CommonMark rule); bullets still interrupt
  unconditionally (issue #41).** *Adversarial-audit finding, not a user
  repro.* The original `LIST_ITEM` regex (`/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/`)
  treated any line starting with digits + `.`/`)` as a list-item marker, both
  at the top-level block dispatch and inside the paragraph-merge loop's break
  condition. A hard-wrapped sentence-initial number (e.g. a Project
  Gutenberg-style `.txt` wrapping "...ended in\n1945. Everyone celebrated...")
  was silently misread as a new ordered list starting at 1945: the paragraph
  was incorrectly split, and the captured-group extraction (keeping only the
  text after the marker) deleted "1945." outright, since a real list item's
  marker text is supposed to be discarded. Fix: split the single regex into
  `BULLET_ITEM` (unchanged — `[-*+]` always interrupts, matching prior
  behavior) and `ORDERED_ITEM` (`\d+[.)]`, capturing the number), plus a new
  `interruptsParagraph(line)` predicate used only by the paragraph-merge
  loop's break condition — true for any bullet, but for an ordered marker
  only when `Number(match[1]) === 1`. The top-level dispatch
  (`isListItem`/`matchListItem`) is deliberately left unrestricted (any
  ordered number can start a fresh list when not interrupting a paragraph,
  e.g. a list that legitimately begins at 5), since it's only reached once
  the paragraph-merge loop has already declined to absorb the line. The
  existing list-continuation loop (once inside a list) is also unrestricted —
  continuing items don't need to start at 1, only *starting* one by
  interrupting a paragraph does.
  Alternative rejected: requiring a blank line before any list. Simpler, but
  contradicts existing behavior where a bullet list can interrupt a paragraph
  with no blank line — correct before this fix and preserved by it.
- **D91 · `stripInline` resolves backslash-escapes first via NUL-delimited
  placeholders, and applies CommonMark's emphasis-flanking rules split by
  delimiter type, instead of one shared lazy-capture regex for both `*` and
  `_` with escapes unescaped last (issue #42).** *Adversarial-audit finding.*
  Three corruptions shared one root cause — the bold/italic regexes
  (`/(\*\*|__)(.*?)\1/g`, `/(\*|_)(.*?)\1/g`) had no flanking restrictions,
  and escapes were unescaped in the last `.replace()` of the chain, after
  emphasis had already run:
  (a) *Intraword underscores* (`snake_case_name` → `snakecasename`): the
  italic regex matched `_case_` with no check on what surrounds the
  delimiters. Fix: underscore emphasis (`_x_` and `__x__`) now requires
  `(?<!\w)` immediately before the opening delimiter and `(?!\w)` immediately
  after the closing one — CommonMark's no-intraword-underscore-emphasis rule.
  A word letter on both outer sides disqualifies every underscore in the
  string as an opener, so `snake_case_name` is left untouched.
  (b) *Whitespace-adjacent asterisks* (`"3 * 4 * 5"` → `"3 4 5"`): same root
  cause. Fix: asterisk emphasis (`*x*` and `**x**`) now requires the
  character immediately after the opening delimiter and immediately before
  the closing delimiter to be non-whitespace (`(?!\s)`/`(?<!\s)`) —
  CommonMark's flanking-delimiter-run rule. Every `*` in `"3 * 4 * 5"` is
  space-padded on both sides, so none qualifies as an opener or closer.
  (c) *Escape order* (`\*not emphasis\*` → `\not emphasis\`): escapes were
  unescaped last, after the italic regex had already consumed the literal
  `\*` pair as if it were real markup, stripped the delimiters, and left the
  orphaned backslashes. Fix: escapes are resolved first, replacing each `\X`
  with a `NUL + index + NUL` placeholder (`NUL = String.fromCharCode(0)`)
  before any other regex runs, so an escaped character is structurally
  invisible to every subsequent regex (images, links, code, bold, italic,
  strikethrough) — not just emphasis. Placeholders are restored to their
  literal characters in one final pass after `.trim()`.
  A bare space-digit-space placeholder (no NUL) was tried first and rejected
  mid-implementation: issue #42b's own repro text, `"3 * 4 * 5"`, contains
  standalone digits surrounded by spaces, which such a placeholder scheme
  would have falsely matched and corrupted during restoration. U+0000 cannot
  occur in real Markdown source, so it can't collide with real prose.
  Alternative rejected for (a)/(b): one shared flanking rule for both
  delimiter families — CommonMark itself distinguishes intraword-forbidden
  (`_`) from whitespace-flanking (`*`); collapsing them would either allow
  `snake*case*name`-style false positives or forbid legitimate mid-word `*`
  emphasis that `_` correctly permits elsewhere in the spec.

## Bug-fix — Resume-position drift not validated against saved wordCount (issue #48)

- **D92 · Silent percent-fallback on `wordCount` drift, not a warning or a
  visible note.** *Adversarial-audit finding (issue #48), decision made
  explicitly rather than left to implementation default.* `BookRecord.wordCount`
  was captured at save time (issue #6) but never compared against the current
  parse's word count on restore — the only guard was `wordIndex <
  words.length`. If a parser change re-tokenizes the same file bytes (any of
  the markdown/EPUB fixes in D90/D91/D65/D62 would do this for an
  already-saved book), the content fingerprint still matches, so the resume
  prompt still offers to resume — but the saved raw `wordIndex` now points at
  an arbitrary, likely-wrong word under the new tokenization, while `percent`
  (stored per `PositionSnapshot`, already the number the `ResumePrompt` UI
  shows the user, e.g. "Resume at 42%?") is unaffected by re-tokenization,
  since it's a ratio over word count rather than an absolute position. Fix:
  `handleResume` (`App.tsx`) now compares `resumeRecord.wordCount` against the
  live `words.length`; on a mismatch it recomputes the seek target as
  `round(percent · (words.length − 1))` instead of using the stored
  `wordIndex` directly. The final `Math.max(0, Math.min(target, len - 1))`
  clamp generalizes the old high-side-only guard to cover both ends,
  including a corrupted or out-of-range stored `percent`.
  **Why silent, not a warning:** the two alternatives raised in the original
  issue — surface a warning, or discard the position — are both worse than
  landing at the percent. A warning has nothing new to tell the user: the
  percent is *already* the number displayed on the resume screen ("Resume at
  42%?"), so honoring it is fulfilling the promise already made, not a
  degraded fallback the user needs to be alerted to. Discarding the position
  outright throws away a perfectly good approximate bookmark for no benefit.
  The only thing that would actually be a regression is silently keeping the
  **stale raw index** and calling it fine — which is exactly the bug this
  fixes. A `console.info` (dev-only, not user-visible) logs old vs. new
  wordCount and the recomputed index so the path is verifiable in testing
  without adding UI surface for something that isn't an error condition.
  **Threading change:** `handleResume` previously took a bare `wordIndex:
  number`; it now takes the full `PositionSnapshot` (it needs `percent`, which
  a bare index can't carry), so `ResumePrompt`'s two call sites (the primary
  "Resume at N%" button and each history-entry button) now pass the snapshot
  object (`latest`, `snap`) instead of `.wordIndex`. Non-drift behavior is
  unchanged — `target = snapshot.wordIndex` — so this is a threading change,
  not a behavior change, for every book whose tokenization hasn't shifted.

## Bug-fix — EPUB attr() missing name boundary causes silent chapter loss (issue #43)

- **D93 · `attr()` requires a boundary before the attribute name; manifest-miss
  now warns, mirroring D63's format.** *Adversarial-audit finding (issue #43),
  upgrading the previously-logged #22 attr() suffix quirk from cosmetic to a
  silent chapter-loss path.* `attr(tag, name)`'s regex
  (`` `${name}\\s*=\\s*(...)` ``) matched `name` as a bare substring anywhere in
  the tag, with no check for what preceded it. On
  `<item data-id="wrong" id="ch1" href="c1.xhtml">`, `attr(tag, 'id')` matched
  the `id` inside `data-id="wrong"` — the first substring occurrence — and
  returned `"wrong"` instead of the real `id="ch1"`. `parseOpfSpine`'s
  `manifest.get(idref)` then missed (the manifest was keyed under `"wrong"`,
  never `"ch1"`), and the `itemref` entry was dropped by a bare `continue`
  with no signal — a whole chapter silently vanished from the spine on an
  otherwise well-formed OPF. Fix: prefixed the regex with a non-capturing
  boundary, `(?:^|[\s"'])`, requiring the attribute name to start at the tag's
  beginning or be preceded by whitespace or a quote character (the latter
  covers a malformed-but-real-world tag like `id="x"href="y"` with no space
  between attributes). The boundary group is non-capturing, so the existing
  capture-group indices (`m[2]` double-quoted value, `m[3]` single-quoted
  value) are unchanged — verified by hand-tracing the repro (`-` precedes the
  decoy `id` in `data-id`, which fails the boundary and is skipped; the real
  `id` is preceded by whitespace and matches) and by a single-quoted-attribute
  regression check confirming group extraction still resolves correctly.
  Separately, the manifest-miss branch (`if (!item) continue;`, line 90) now
  logs `` console.warn(`[epub] manifest item not found for idref: "${idref}" —
  chapter skipped`) `` before continuing, mirroring D63's exact message shape
  for the sibling zip-lookup-miss warning in `epub.ts`, so this feeds the same
  eventual user-facing surfacing work tracked in issue #26. The already-
  intentional idref-absent path (`if (!idref) continue;`, line 88 — the
  `itemref` tag simply has no `idref` attribute at all, a different and
  already-silent-by-design case) was left untouched, as scoped.
  Alternative rejected: anchoring on `[\s]` only (no quote character in the
  boundary set) — narrower, and would miss the same silent-shadowing bug for
  a tag with no space between adjacent attributes (`id="x"href="y"`), which is
  invalid but not rare in hand-edited or poorly-generated EPUBs; the wider
  `[\s"']` set costs nothing since `"`/`'` can never legitimately precede an
  attribute name in well-formed markup either. Fixes #43.

## Bug-fix — EPUB unclosed `<p>` drops chapter text silently (issue #14)

- **D94 · Additive opening-tag fallback gated on a whole-chapter zero, not a
  rewrite of the strict pass; `href` threaded as an optional param only for the
  warning.** *Adversarial-audit finding (issue #14, HIGH, flagged by two
  passes).* `xhtmlToBlocks`'s strict regex is backreferenced
  (`<(h[1-6]|p|li|blockquote)…</\1>`), so a block tag with no matching close
  tag matches nothing and the chapter's text vanishes silently — proven at
  4000 unclosed `<p>` → 0 blocks. The backreference is kept as-is (it's
  load-bearing for the strict pass's nested-child de-dup, e.g. `<li><p>…`);
  instead, when the strict pass yields **0** blocks and the trimmed body is
  non-empty, a second pass splits on block-level *opening* tags and takes each
  opener's text up to the next opener (or end of body). If the fallback also
  yields 0, current behavior is kept — no invented third pass. The fallback
  emits a `console.warn` in the existing `[epub] …` style (mirrors D63/D93) so
  a partial-recovery chapter is visible in logs rather than throwing; this
  required an **optional** `href` second parameter on `xhtmlToBlocks` purely to
  name the chapter (backward-compatible, `epub.ts`'s one call site now passes
  it — no signature change forced on anything else). `reindexWords`/`Block.id`
  untouched.
  **Scope decision (flagged, not silently narrowed):** the fallback fires only
  on a whole-chapter zero. A body mixing one closed block tag with several
  unclosed ones keeps the strict pass's `>0` result, so the fallback never
  runs and the unclosed tails are still lost — same bug class, mid-chapter/
  partial scope. Fixing that would mean a per-tag recovery merge (detect which
  specific openers lack closers and splice them into the strict output), which
  risks double-emitting text the strict pass already captured and needs its
  own de-dup design. Deferred as a documented follow-up (FINDINGS F29) rather
  than bundled in; the headless suite asserts the partial-loss case is
  *unchanged* so the gap is on record, not implied fixed. Alternative rejected:
  dropping the backreference so the strict pass tolerates unclosed tags — it
  would reintroduce the nested-`li>p` double-count the backreference exists to
  prevent, a regression on well-formed EPUBs (the common case) to fix the
  malformed one. Fixes #14.

## Android port scope

- **D95 · EPUB is included in the first Android port cut (issue #7), not
  deferred to a later release.** *Product decision.* The original v1 scope
  (PROJECT_CONTEXT.md §4) left the Android port as a future item with no
  stated format scope, and a pre-port audit flagged this as an open question
  with no prior decision on record. Resolved: the first Android cut ships
  with EPUB support alongside Markdown/PDF, not Markdown-only-with-EPUB-later.
  This is tractable as a first-cut feature rather than a stretch goal because
  EPUB parsing was already architected as portable — `epubStructure.ts`'s
  container/OPF/spine parsing and XHTML-to-blocks logic is pure TS with no
  DOM dependency (D35), and the heavy platform-specific piece (`JSZip` +
  `ArrayBuffer` I/O) is isolated to the thin `epub.ts` wrapper, which is the
  only part requiring an RN-side replacement (D36; see ARCHITECTURE.md
  Porting notes). This does not resolve or touch the separate, still-open
  question of whether the pacer should auto-restart at end-of-document
  (F23/D89) — that remains undecided and is tracked as its own issue.
  **(Resolved by D96 — kept disabled, no auto-restart.)**

## Product decision — Play/Space auto-restart at end-of-document (issue #64)

- **D96 · Play/Space stays disabled at end-of-document; no auto-restart.**
  *Product decision, closing the open question first flagged in D89/F23
  (2026-07-09) and reaffirmed still-unresolved by F30/F31 (2026-07-10).*
  Resolves issue #64 by choosing **option 1** of the two the issue laid out:
  Play/Space remains inert (button `disabled`) once `atEnd` is true, and the
  always-visible **↺ Restart** button is the explicit gesture to replay from
  the beginning — not auto-restart-on-Play/Space. This is documentation of
  already-shipped behavior: `play()`/`toggle()` in `src/pacer/usePacer.ts`
  already implement exactly this (guard `if (atEndRef.current &&
  startedRef.current) return;` in `play()`, and the mirrored `canStart =
  !atEndRef.current || !startedRef.current` in `toggle()`), and
  `PacerControls.tsx` already renders `↺ Restart` unconditionally alongside a
  `disabled={pacer.atEnd && !pacer.playing}` Play/Pause button. **No source
  file changes accompany this entry** — the F30 (issue #18) and F31 (issue
  #49) fixes had already independently preserved this exact behavior while
  explicitly declining to decide it; this entry is the decision that confirms
  what they preserved was correct, not a new implementation.

  **Rationale:**
  (a) **Play means "start/resume from here" everywhere else in this app** —
  seeking, resuming a persisted position (issue #6), and pressing Play after
  a pause all continue from the current index. Auto-restart-on-Play would be
  the one place Play silently means "start over," inverting user expectation
  built up by every other interaction with the button.
  (b) **Unsafe on long/EPUB documents (D95).** A stray Space press at the end
  of a book-length document would discard the reader's place with no
  confirmation — exactly what the issue #6 reading-position persistence
  system (D67–D76) exists to protect against. Auto-restart would silently
  fight a feature already shipped for the opposite purpose.
  (c) **Retention re-reading is already served by the explicit Restart
  button.** A reader who wants to re-read from the top has a one-click,
  unambiguous affordance (↺ Restart); nothing is gained by overloading Play
  with the same action implicitly.
  (d) **The original "looks broken" defect was a styling gap, not a behavior
  gap** — F23/D89 traced bug #4 (issue #38 QA round) to the Play/Pause button
  having no visible `:disabled` styling, so an inert-but-correct button read
  as broken. That was fixed in the same pass (`button:disabled { opacity:
  0.5; cursor: not-allowed; }`); the disabling behavior itself was never the
  problem.

  Alternative rejected: auto-restart Play/Space at end-of-document (option 2
  in issue #64) — rejected for the reasons above, primarily (a) and (b).

## Appendix — Log meta

Bookkeeping about this log's own structure, kept out of the chronological
entries above so it doesn't interrupt the decision flow.

- **File order ≠ numeric order.** IDs are assigned chronologically, but the file
  is grouped by milestone/feature, so later-numbered sections (Post-V1 D42–D59,
  Reading-position D67–D76, Presets D77–D85) can appear before or after
  lower-numbered milestone sections. Navigate by section heading, not by scrolling
  for ascending IDs.
- **D33 relocation (2026-06-29).** D33 was originally appended at the end of the
  file (after M7's D39–D41) and was moved once to its chronological home in the
  2026-06-26 documentation-discipline section. This is the single sanctioned
  reorder; the log is otherwise append-only.
- **D25 reference correction (2026-07-08).** D25's supersession annotation
  originally cited "D77"; corrected to **D85**. D77 is the unrelated presets
  decision — the mechanism D25 describes (`onRangeChange` no longer calling the
  full `apply()`) is D85's scroll-ownership split.
