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
  and after any Reader re-render (via a layout effect, no flash), cleared before
  re-adding so virtualization can't leak stale classes. The current-word overlay
  and RSVP anchor are separate non-React-styled elements, so those are fully
  robust.

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

---

## Corrections
- **2026-06-29:** D33 was originally appended at the end of the file (after M7's
  D39–D41) under a trailing "Documentation discipline" heading, leaving M6
  reading D32 → D34. No decision was missing — D33 was merely out of sequence. It
  has been moved to its correct chronological position (the 2026-06-26
  documentation-discipline section, which was established before M6) so the log is
  monotonic D1→D41. This is the one sanctioned reorder; the log remains
  append-only otherwise.
