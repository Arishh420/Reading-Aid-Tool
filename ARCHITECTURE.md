# Architecture

> System design for the Reading Aid Tool. Read alongside [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)
> (the spec / scope), [DECISIONS.md](DECISIONS.md) (the decision log), and
> [FINDINGS.md](FINDINGS.md) (empirical learnings + verification levels).
>
> **This codebase is destined for a React Native port (Android first, then
> iOS).** Documentation is therefore load-bearing. The single most important
> structural idea here is the split between **portable logic** (pure TS: model,
> tokenizer, ORP math, dwell, pacer timing) and the **web layer** (DOM,
> `@tanstack/react-virtual`, CSS). See [Porting notes](#porting-notes).

---

## 1. Pipeline overview

```
RawFile (pdf | md | epub)
        │
        ▼
  Format Parser  ──►  normalizes to ──►  Document  ──►  flattenWords() ──► Word[]
                                            │                                  │
                                            ▼                                  ▼
                                     Reader (layout)                    usePacer (clock)
                                            │                                  │
                              Bionic ◄──────┤                                  │ index (ref + pub/sub)
                                            ▼                                  ▼
                                   Mode view (flowing / RSVP / chunk) ◄────────┘
```

Every input format normalizes into ONE internal `Document`. Nothing downstream
of the parser knows or cares which format the file came from. The pacer walks a
single flattened `Word[]`; the current position is one integer index into it.

---

## 2. Internal model — `src/model/types.ts`

`Document → Block[] → Word[]`.

- **`Word`** = `{ id, text, isWordlike }`. `text` is the raw token *including*
  attached punctuation. `isWordlike` is `false` for pure punctuation/symbol
  tokens (the pacer skips them; bionic ignores them).
- **`id` is the flat index, as a string.** `reindexWords()` guarantees ids are
  contiguous `"0".."N-1"` across the whole document in reading order. This is a
  deliberate invariant exploited everywhere: the pacer's `currentWordIndex`
  equals `Number(word.id)`, so "is this the active word?" is a numeric compare,
  and word→DOM lookup is `querySelector('[data-word-id="N"]')` with no map.
- **`Block`** = `{ id, type: 'heading'|'paragraph', level?, words }`. Minimal by
  design (v1 has only headings and paragraphs); lists/quotes/code collapse into
  paragraphs at parse time.

**Why:** pre-tokenizing into a flat `Word[]` up front means the pacer and bionic
share one list, seeking is just an index, and block grouping is preserved
separately purely for layout.

### Tokenizer — `src/model/tokenize.ts`

- `tokenize(text, startIndex)` → `Word[]`. Splits on whitespace; a token is
  word-like if it contains any Unicode letter or number (`/[\p{L}\p{N}]/u`).
  Attached punctuation stays on the token (splitting it is bionic's job, not the
  tokenizer's).
- `flattenWords(doc)` → the reading-order spine the pacer walks.
- `reindexWords(blocks)` → assigns the contiguous flat ids. Parsers tokenize
  blocks independently, then call this once.

**Portable.** Pure string/array logic, no platform deps.

---

## 3. Parsers — `src/parsers/`

`parse(file, format)` (`index.ts`) is the only entry point; it dispatches to a
per-format module returning a normalized `Document`.

- **Markdown** (`markdown.ts`, M2): dependency-free block tokenizer. Recognizes
  ATX headings, paragraphs, lists (→ one paragraph per item), blockquotes (→
  merged paragraph), fenced code (→ paragraph), and drops horizontal rules.
  Inline markup (bold/italic/links/code) is stripped to plain text — bionic owns
  all styling, so carrying source emphasis would fight it.
- **PDF** (M6): `pdf.ts` extracts positioned text per page via `pdfjs-dist`
  (`itemsToLines` groups glyphs into lines, each carrying an x/indentation cue
  and a `gapBefore` vertical-gap cue), then the **pure** `pdfText.ts`
  (`linesToParagraphs`) applies the cleanup heuristics — drop repeated
  headers/footers and bare page numbers, de-hyphenate line-break splits, and
  reflow lines into paragraphs, breaking on **three** independent cues: a
  vertical gap, a first-line indent vs. that page's body margin (the x cue —
  fixed in issue #9/D98; previously computed by `itemsToLines` but never
  read), and every page boundary (also D98 — page-to-page y-coordinates
  aren't comparable, so this always breaks rather than trying to detect a
  genuine cross-page continuation). `splitOversizedParagraphs` then runs as
  an independent hard-split safety net on the resulting paragraph strings,
  before tokenization, capping any single paragraph at 300 words regardless
  of why the break-detection above might have missed a split (D99) — see
  ARCHITECTURE §9's virtualization note and FINDINGS F1/F32 for why an
  unbounded block is a perf cliff, not just a cosmetic issue. Scanned/
  image-only PDFs (no extractable text) are detected and rejected with a
  clear message.
- **EPUB** (M6): `epub.ts` unzips via `JSZip`; the **pure** `epubStructure.ts`
  reads `META-INF/container.xml` → OPF → spine order and turns each XHTML body
  into blocks. Parsing uses targeted string scanning (not DOMParser) so it stays
  portable and testable.
- **Code-splitting:** `parse()` dynamically `import()`s the PDF/EPUB modules, so
  the heavy deps (pdf.js ~470 kB, JSZip ~100 kB) load only when those formats are
  used — a Markdown-only session never downloads them.

**Portable vs web:** Markdown parser, `pdfText.ts`, and `epubStructure.ts` are
pure (cleanup heuristics + structure parsing — these cross to RN). The thin
`pdf.ts`/`epub.ts` wrappers depend on JS libs and `ArrayBuffer` input; in RN they
get an RN-compatible PDF lib / unzip + the same pure cleanup.

---

## 4. Bionic rendering — `src/reader/bionic.ts` + `BionicText.tsx`

- **`splitBionic(text, ratio)`** (pure) returns `{ lead, head, tail }`. Bold the
  first `n = max(1, round(L·ratio))` *letters* (L counts letters only). A token
  can carry *leading* punctuation, so the split has three slots: an unbolded
  `lead`, the bold `head`, and the `tail` — rendered `{lead}<b>{head}</b>{tail}`.
  Intensity ratios: Low 0.3 / Medium 0.5 / High 0.6.
- **`BionicText.tsx`** (web) renders that as inline markup.

**`bionic.ts` is portable**; `BionicText.tsx` is a trivial web view (RN: reuse
`splitBionic`, render `<Text>` with a bold `<Text>` span).

> Note: logic file is `bionic.ts`, component is `BionicText.tsx` — named apart on
> purpose because macOS's case-insensitive FS collides `bionic`/`Bionic`.

---

## 5. The pacer clock — `src/pacer/usePacer.ts`

The heart of the app, and **the part most decoupled from React for performance.**

### Single source of truth, off the React render path
`currentWordIndex` lives in **`indexRef`** (a ref), not React state. Changes are
broadcast through a tiny **pub/sub** (`subscribe(cb)`). On a normal tick the only
work is: write the ref + call listeners. **Zero `setState`, so nothing
re-renders.** (`playing`/`atEnd` are React state but flip only at play/pause/end,
not per word.) Consumers that need the live index (highlight overlay,
auto-scroll, progress bar, RSVP word) subscribe and update the DOM imperatively.

**Why:** the document can be ~57k words / ~170k DOM nodes. Re-rendering that tree
per tick was the original performance cliff. The ref+pub/sub design means the
reader tree is rendered once and never reconciles during playback.

### Timing
`requestAnimationFrame` with a **time accumulator** (not `setInterval`):

- `msPerWord = 60000 / WPM`, recomputed every frame from a ref → **live WPM
  changes apply immediately** mid-playback.
- **Dwell multiplier** (punctuation-aware pacing): the threshold to advance off
  the current word is `msPerWord · chunkSize · dwell[index]` (see §6). Lets the
  highlight linger before a comma/period/paragraph break.
- **≤1 step per frame, capped backlog.** A single `if` (not a `while`) plus
  `acc = min(acc - threshold, msPerWord·chunkSize)` guarantees at most one
  advance per frame and no banked backlog — so a slow frame can never make the
  highlight *skip* a word (it slows instead). Verified: even a 1000ms jank frame
  advances exactly one word.
- **Chunk stepping:** `chunkSize` advances N word-like tokens per step with the
  threshold scaled by N, keeping effective WPM consistent. Flowing/RSVP use 1.

### API
`{ indexRef, playing, atEnd, play, pause, toggle, restart, seek, subscribe }`.
`seek` snaps to the nearest word-like token. Non-word-like tokens are always
skipped when advancing (`firstWordlikeFrom`).

**Portable.** `requestAnimationFrame` and `performance.now` exist in React
Native, and the hook is plain React. The whole timing/dwell/clamp/pub-sub design
crosses over essentially unchanged. Only the *consumers* of `subscribe` are
web-coupled.

---

## 6. Punctuation-aware pacing (dwell) — `src/pacer/dwell.ts`

A per-word dwell multiplier applied at the clock level, so **every mode inherits
it for free**:

- `, ; : – —` → 1.75×  | `. ! ? …` → 2.5×  | last word of a block (paragraph
  end) → 3× | otherwise 1×. Trailing closing quotes/brackets are ignored
  (`end."` reads as a sentence end).
- `buildDwellMultipliers(doc)` → `number[]` indexed by flat word id.
- Gated by the **"Natural pauses"** toggle (default ON). Off ⇒ pure metronomic.

**Portable.** Pure functions over the model.

---

## 7. Mode system — `src/pacer/modes/` + `ModeSettings.tsx`

Three modes read the same `currentWordIndex` but present differently. A dropdown
(`ModeSettings`) swaps both the active view and its settings panel.

- **Flowing** (`FlowingHighlight.tsx`, the priority experience): full text laid
  out; a **single absolutely-positioned overlay element glides** to the active
  word's rect (CSS transition on transform/size), with optional "lead" words
  tinted ahead. Highlight is translucent so bionic stays legible.
- **RSVP** (`Rsvp.tsx`): one word at a fixed focal point with an ORP anchor
  (§8). Single-word; monospace; theme-aware red anchor; a pause cue.
- **Chunk** (`ChunkHighlight.tsx`): full text; N words highlighted in place via
  imperative classes, advancing one chunk per step.

Common in-place auto-scroll lives in `scrollHelpers.ts`. Flowing/Chunk reuse the
virtualized `Reader`; RSVP replaces it with its own focal stage.

**Mode *logic* is portable** (which indices to highlight, lead/chunk index math).
**Mode *views* are web-coupled** (overlay positioning via `getBoundingClientRect`,
`scrollTo`, `classList`) and get reimplemented in RN with measured text layout +
`Animated`.

---

## 8. ORP / RSVP fixed anchor — `src/pacer/orp.ts` + `Rsvp.tsx`

- **`orpIndex(len)`**: anchor character index by word length (1→0, 2–5→1, 6–9→2,
  10–13→3, 14+→4). `splitOrp(text)` → `{ pre, anchor, post }`.
- **Fixed-anchor layout (the subtle part):** a 3-column CSS grid
  `2fr auto 3fr`. In **monospace**, the middle (`auto`) column is always exactly
  one glyph wide, so the anchor's centre is a constant x =
  `0.4·W + 0.1·ch` for *every* word — the anchor cannot drift. `pre`
  right-aligns and `post` left-aligns against it, extending outward. The focal
  point sits left-of-centre (~40%).
- **Pause cue:** a thin tick under the anchor that depletes over a punctuation
  dwell (width/duration scaled by the dwell multiplier). It's an absolutely
  positioned *sibling* of the anchor letter, so it can never move the anchor.
  Gated on Natural pauses.

**`orp.ts` is portable.** The fixed-anchor guarantee is a CSS-grid+monospace
property; in RN the same effect is a flex row with the equivalent ratios (and a
monospace font), reusing `splitOrp`.

### Context strip — `RsvpContextStrip.tsx` (RSVP only)
RSVP removes spatial context; the strip restores it, dim and small, below the
flashing word — applying the RSVP principle to itself: the **active word's line
is pinned to the box center line**, and the paragraph text **scrolls
continuously underneath it** (a CSS-transitioned `translateY` on the inner
content; lines rise one at a time, not a page-flip).

- **Additive independent subscriber** — subscribes to the pacer index (via the
  stable `subscribe`/`indexRef`, so it wires up **once**, not on every parent
  render) and, per word, sets the `translateY` + moves the highlight class
  imperatively (**zero React render**; the transform value only changes on a line
  change, so within a line there's no motion).
- **Centering is offsetParent-independent.** `center()` measures the active
  span vs. the scroll container with `getBoundingClientRect()` and reads the live
  `translateY` from the computed matrix — never `offsetTop`, which silently
  breaks when any ancestor (e.g. the paragraph, made `relative` for the break
  separator) becomes the offsetParent. Reading the *live* transform also lets a
  mid-transition re-center retarget without jitter.
- **Buffered window:** it renders a window of consecutive blocks (so context
  spans paragraph boundaries) and **re-renders only when the active block nears a
  window edge** — every few paragraphs, not per word. On a shift, a layout effect
  recenters instantly (imperceptible: center content unchanged, only faded edges
  differ). Block lookup is the pure `model/blocks.ts` (`blockIndexForWord` over a
  **monotonic** `buildBlockStarts` — empty blocks carry the next word's id so the
  binary search can't misfire).
- **Sharp, not blurred:** the top/bottom fade is an alpha `mask-image`; readable
  lines stay crisp.
- **Uniform line grid:** line-height is a **length** (`--rc-line`, inherited as a
  fixed px value) so every line box is identical, and the `translateY` is
  **snapped to whole-line multiples** so visible lines are always full boxes (no
  half-clipped "short" line) while the active line stays centred. Paragraph
  breaks are a **zero-height** hairline (`::before`), so they mark the boundary
  without stealing a text row.
- **Height** is a live 3/5 setting (`contextLines`, default 3); the box height
  (`--rc-lines`) and window adapt. **Font tracks the anchor** (`max(0.6rem,
  0.32em)`) so the strip scales with the font-size slider.
- **Vertical stack, not overlay:** the whole stage is a **centered flex column** —
  word → `1.8em` gap → strip. The gap is in word-`em`, so it scales with the
  pause tick it must clear (both scale in word-`em`); non-overlap is guaranteed
  by layout at any font size / line count. The word grid is untouched, so the ORP
  anchor's fixed x is unaffected.
- **Click-to-seek (delegated):** one `onClick` on the container resolves the
  nearest `[data-word-id]` and calls `pacer.seek` — parity with the main reader,
  no per-word handlers. The strip stays `aria-hidden` (peripheral visual echo),
  so this is a mouse convenience; keyboard/main-reader seeking stay authoritative.

`model/blocks.ts` is portable; `RsvpContextStrip.tsx` (transform/mask/DOM) is
web-coupled — an RN port reproduces "pinned line + text scrolls under it" (with a
line-snapped offset) with `Animated`, not a page swap.

---

## 9. Virtualization & the reading surface — `src/reader/Reader.tsx`

- **Block-level windowing** via `@tanstack/react-virtual` (words wrap and can't
  be fixed-size rows; blocks are measurable boxes). Only blocks near the viewport
  are mounted (~5–15 vs 57k words).
- **The scroll element is the reader pane, not the window.** This one container
  is simultaneously: the virtualizer's `getScrollElement`, the overlay's
  coordinate space, and the auto-scroll reference — so all measurements agree.
  The pane is responsive (`flex:1` in a `100dvh` column; `dvh` so mobile browser
  chrome doesn't clip it).
- **Memoized, no per-tick props.** `Reader` is `memo(forwardRef(...))` taking
  only `document`/`bionic`/`onSeekWord` — none change during playback — so it
  never reconciles per tick.
- **Imperative handle** (`ReaderHandle`): `scrollEl`, `contentEl`, `overlayEl`,
  `wordEl(index)`, `scrollToWord(index)`. Modes drive highlight/scroll through
  this without React reconciliation. `scrollToWord` maps word→block via binary
  search over each block's first flat id.
- **Click-to-seek** is one delegated handler on the pane
  (`closest('[data-word-id]')`), not a closure per word.
- **Auto-scroll** (`scrollHelpers.ts`): keep the active line in a band ~40% from
  the top; scroll only on line change to avoid per-word jitter.
- **`onRangeChange` (re-mount notification) never scrolls.** `Reader` fires
  `onRangeChange` whenever the virtualizer mounts a new span set — which
  happens on *any* scroll of the pane, manual or programmatic, since the pane
  is also the virtualizer's scroll element. Flowing/Chunk modes must wire this
  callback to a class-only helper (`updateLeadClasses`/`updateChunkClasses`)
  that never calls `scrollWordToBand`/`scrollToWord`. Scroll-centering is
  reached only from genuinely pacer-driven paths — the tick subscription
  (covers seek/restart), document-change, relayout, and resize effects — never
  from a mounted-range change alone. Violating this (as D25's original #17 fix
  did) makes manual scrolling on the pane impossible: every scroll re-triggers
  the auto-center and snaps back to the pacer's current word, regardless of
  play/pause state. See DECISIONS.md D77, FINDINGS.md F21.

**Web-coupled.** This whole module reimplements in RN (FlatList / RecyclerListView
+ `onLayout` measurement + `Animated` overlay). The *contract* it exposes
(`wordEl`, `scrollToWord`, a moving overlay, a 40% band) is the porting spec.

---

## 10. Theme system — `src/ui/theme.ts` + `index.css`

Four themes (light / sepia / dark / dim), each a set of CSS custom properties
(`--bg`, `--surface`, `--text`, `--muted`, `--border`, `--accent`, `--anchor`)
swapped via a single `data-theme` attribute on `<html>`. Light is the default
(bionic bold has stronger contrast on light). `:root` carries Light so the first
paint never flashes.

**The theme *token set* is portable** (it's just named colors). **The delivery
mechanism (CSS variables + `data-theme`) is web-specific** — in RN this becomes a
JS theme object provided via context.

---

## 11. Presets system — `src/presets/presets.ts` + `src/ui/PresetsPanel.tsx`

Named profiles that snapshot the full settings bundle and switch in one click.

### Data model
```typescript
interface PresetBundle {   // 13 fields — mirrors all App.tsx settings state
  wpm; naturalPauses; mode; bionic; theme; display; flowing; rsvp; chunk;
}
type BuiltinPreset = BasePreset & { builtin: true };        // code-defined
type UserPreset   = BasePreset & { builtin: false; createdAt: number }; // localStorage
type Preset = BuiltinPreset | UserPreset;
```

- **9 built-in presets** grouped by reading mode (flowing / RSVP / chunk / cross-cutting).
  Code constants in `BUILTIN_PRESETS`; never in storage.
- **User presets:** CRUD via `storageGet/Set` under key `readingaid_v1:presets`
  (`{ version: 1, userPresets: UserPreset[] }`).

### Apply is atomic
`applyPreset(preset)` in `App.tsx` fires all 9 `setState` calls in one event handler;
React 18 automatic batching produces a single render pass. No intermediate partial state.

### isModified tracking
`lastAppliedBundle` is a `useRef<PresetBundle | null>`. After `applyPreset` writes the
ref, `isModified` is a derived render-time boolean from `bundlesEqual(currentBundle,
lastAppliedBundle.current)` — no "mark modified" callbacks threaded through any existing
handler. A new setting requires one new line in `bundlesEqual` only.

### PresetsPanel
Renders as a block in `app-top` (between toolbar and PacerControls). Toggle button
expands a panel with built-ins grouped by mode; user presets beneath with inline rename
and delete; "Save current…" creates a new named preset from live state.

**Portable:** `presets.ts` (pure types, CRUD, `bundlesEqual`) — no DOM deps; swap
`storageGet/Set` to AsyncStorage/MMKV in RN.
**Web-coupled:** `PresetsPanel.tsx` (React UI, DOM refs for autofocus).

---

## 12. State & settings — `src/App.tsx`

`App` owns all state: loaded `Document`, bionic settings, theme, WPM, natural
pauses, mode, per-mode settings, reader display (font size + line width), and the
current app phase (`idle | resume-prompt | reading`). It builds `words` and `dwell`
(memoized per doc), runs `usePacer`, and renders the active mode view.

**Phase state machine (issue #6):** a three-state enum drives what is rendered:
`idle` → file-input screen; `resume-prompt` → resume interstitial (if the file is
recognised by fingerprint and has a saved position); `reading` → the full reader.
The pacer is always alive, but its keyboard handler is gated to the `reading` phase.

- **Resume drift guard (issue #48, D92):** `handleResume` compares the chosen
  `BookRecord.wordCount` against the live `words.length` before seeking. If a
  parser change re-tokenized the same file bytes since the position was saved,
  the fingerprint still matches but the raw `wordIndex` no longer points at the
  right word — so on a mismatch the target is recomputed from the snapshot's
  `percent` (`round(percent · (words.length − 1))`) instead of the stale raw
  index; on a match, behavior is unchanged. Both paths clamp to
  `[0, words.length − 1]`. `handleResume` therefore takes the full
  `PositionSnapshot` (needs `percent`), not a bare `wordIndex`.
- **Reader typography (M7):** font size and line width are applied as CSS
  variables (`--reader-font-size`, `--reading-width`) on the app shell; the
  laid-out reader reads them. A `layoutKey` (derived from those values) is passed
  to the in-place modes so the overlay/highlight reposition when typography
  changes the layout (the same way they react to a bionic toggle or resize).
- **Keyboard transport (M7; Space routing refined in issue #38, D86, then
  corrected by D89 after browser testing found the D86 design broke two
  things):** a window `keydown` handler gives Space (play/pause), ←/→ (step
  word), Home (restart). Arrows/Home still yield to any focused
  input/select/textarea/button (unchanged — don't hijack a slider/select).
  **Space is routed separately, through the pure predicate
  `spaceTogglesFrom` (`src/pacer/keyboard.ts`): it toggles the pacer
  regardless of focus by DEFAULT, yielding only for a narrow, enumerated
  set** — `TEXTAREA`; the Play/Pause button *specifically*, identified by a
  marker attribute (`pacerToggleButtonProps`, spread onto that one button in
  `PacerControls.tsx`) rather than by tag name, so native click there doesn't
  double-fire (D40); and `INPUT` types with a genuine native Space action of
  their own (`text`, `checkbox`, `radio`, `file`). Everything else — number/
  range inputs (WPM, Word, scrubber), `SELECT` (the Mode dropdown), every
  *other* `BUTTON` (Presets toggle, Restart, Load another), a clicked word
  span, `<body>` (where focus lands after a click on a non-focusable element,
  e.g. after click-to-seek), `null` — toggles. **The D86 design instead
  yielded by default for anything that wasn't literally an `INPUT`**, which
  silently broke Space after any click-to-seek (focus drops to `<body>`, a
  non-`INPUT` element, so Space fell through to the browser's native
  scroll-on-space) and yielded for every `BUTTON`/`SELECT` rather than just
  Play/Pause (Space toggled the Presets panel or Mode dropdown instead of the
  pacer) — see D89, FINDINGS F22/F23. This predicate is portable (no DOM deps
  beyond reading `tagName`/`type`/`hasAttribute`) and unit-tested headlessly
  against the real bundled module (13 cases, FINDINGS F23).
- **Minimal HUD during playback (issue #38, D87/D88, ceilings and WPM-control
  choice corrected by D89):** while `pacer.playing`, `.app-top` gets a
  `.playing` class that collapses the settings-heavy rows (`Settings`/
  `ThemeSelector` row, `PresetsPanel`, `ModeSettings`, the keyboard hint) via
  a CSS `max-height`/opacity transition — pure CSS, no conditional unmount, so
  there's no separate HUD component. The resting-state ceilings must be
  generous enough to never clip real content (D89: the first pass's 6rem
  ceiling clipped the ThemeSelector even while NOT playing, since it wasn't
  scoped to the `.playing` state and was sized without rendering the real
  content — corrected to 40rem, 4rem for the single-line keyboard hint).
  `PacerControls` itself stays mounted across the switch; a `compact` prop
  (`= pacer.playing`) swaps its internal JSX to a reduced layout (transport +
  the WPM number box + read-only progress — the same number box as the
  full/paused view, just shown alone; the WPM slider, Word field, and
  scrubber are dropped). The progress-bar-fill and `%` elements render in the
  *same* JSX position in both layouts specifically so the imperative
  `pacer.subscribe` write (§5) is never aimed at a torn-down/remounted node.
  Because `.app-top` is `flex: none` and the reader area is `flex: 1` in a
  fixed-height column, this collapse changes **`.app-top`'s height only** —
  reader pane *width* (and thus reading-column wrap) is untouched, so
  flowing/chunk text never re-wraps and `scrollTop` is preserved; RSVP's
  centered stage grows into the reclaimed space via ordinary flexbox
  centering, so the flashed word glides rather than jumps. **This is
  deliberately not routed through `layoutKey`** (unlike the bionic/text-size/
  line-width changes above) — `layoutKey` exists to trigger reposition when
  typography can change word *wrapping*, and this collapse structurally
  cannot affect wrapping.
- **Empty/error states:** parse failures (incl. the scanned-PDF message) surface
  via the file-input error slot; a parsed document with zero blocks is rejected
  with "No readable text was found."

These are web-coupled (keyboard event, CSS variables, range inputs) — in RN the
typography becomes theme/context values and transport becomes platform controls.

---

## Porting notes

What transfers to React Native unchanged vs. what gets reimplemented.

### Portable (pure TS — copy as-is)
| Module | Role |
|---|---|
| `model/types.ts` | Document/Block/Word model |
| `model/tokenize.ts` | tokenizer, `flattenWords`, `reindexWords` |
| `parsers/markdown.ts` | Markdown → Document (pure string logic) |
| `parsers/pdfText.ts` | PDF cleanup heuristics (lines → paragraphs) |
| `parsers/epubStructure.ts` | EPUB container/OPF spine + XHTML → blocks |
| `reader/bionic.ts` | `splitBionic` head/tail math |
| `pacer/orp.ts` | ORP index + split |
| `model/blocks.ts` | flat-word-index → block lookup (binary search) |
| `pacer/dwell.ts` | dwell multipliers |
| `pacer/usePacer.ts` | clock: timing, dwell, ≤1/frame clamp, chunk stepping, pub/sub (rAF & React exist in RN) |
| `pacer/keyboard.ts` | `spaceTogglesFrom` — which focused element types Space should toggle the pacer from (issue #38) |
| mode *logic* (lead/chunk index math, `firstWordlikeFrom`) | which words to highlight |
| theme token *values* | the color sets |
| `storage/storage.ts` | `storageGet/Set/Remove` wrapper — swap to AsyncStorage / MMKV on RN |
| `storage/readingPosition.ts` | `BookRecord`/`PositionSnapshot` schema + `saveReadingPosition` / `loadBookRecord` |
| `presets/presets.ts` | `PresetBundle` type, built-in definitions, CRUD helpers, `bundlesEqual` |

### Web-coupled (reimplement against RN primitives)
| Module | Web dependency | RN replacement |
|---|---|---|
| `reader/Reader.tsx` | DOM, `@tanstack/react-virtual`, `getBoundingClientRect`, `querySelector` | FlatList/RecyclerListView + `onLayout` + imperative handle |
| `reader/BionicText.tsx` | inline `<b>` | `<Text>`/`<Text bold>` (reuse `splitBionic`) |
| `pacer/modes/*.tsx` | overlay rects, `scrollTo`, `classList` | `Animated` overlay, measured layout (reuse mode logic) |
| `pacer/modes/scrollHelpers.ts` | DOM scroll | scroll-to-offset on the list |
| `pacer/PacerControls.tsx` | range/number inputs | RN `Slider` / `TextInput` |
| `ui/*` (`FileInput`, `Settings`, `ThemeSelector`, `ResumePrompt`, `PresetsPanel`) | DOM/CSS | RN views; file picking via a platform module; presets picker built from native components (reuse `presets.ts` CRUD) |
| `index.css` + `data-theme` | CSS variables | `StyleSheet` + theme context |
| `parsers/pdf.ts` | `pdfjs-dist` + worker, `ArrayBuffer` | RN PDF lib (reuse `pdfText.ts`) |
| `parsers/epub.ts` | `JSZip`, `ArrayBuffer` | RN unzip (reuse `epubStructure.ts`) |
| `parsers/index.ts` → `computeFingerprint` | `File.slice`, `crypto.subtle` (Web Crypto) | RN: RNFS chunk reads + `react-native-quick-crypto` SHA-256 |
| `storage/storage.ts` → `storageGet/Set/Remove` | `localStorage` | RN: AsyncStorage / MMKV (same key schema; the `storage/readingPosition.ts` logic is unchanged) |

**Rule of thumb:** if a file imports from `react-dom`, touches the DOM, reads
`getBoundingClientRect`, or lives in `.css`, it's web-coupled. Everything in
`model/`, the `*.ts` (non-`.tsx`) files under `pacer/` and `reader/`, and the
Markdown parser is portable.

---

## Change log
- **M1–M5 + refinements** backfilled (2026-06-26). Keep this file current every
  milestone — see DECISIONS.md for the working agreement.
- **M6** (2026-06-26): PDF (`pdfjs-dist` + pure `pdfText.ts` cleanup) and EPUB
  (`JSZip` + pure `epubStructure.ts`) parsers; format-selector dropdown;
  dynamic-import code-splitting of the heavy parser deps.
- **M7** (2026-06-26): polish — keyboard transport/seeking, reader font-size +
  line-width controls (CSS variables + `layoutKey` reposition), empty/error
  states. Final V1 milestone; docs audited against the shipped code.
- **Post-V1** (issue #1): RSVP context strip — additive dim current-paragraph
  view under the flashing word (`RsvpContextStrip.tsx` + pure `model/blocks.ts`),
  toggleable, default on. Merged to main (PR #23).
- **Parser bug-fixes** (#10 #11 #12): PDF em/en-dash join split into
  `ENDS_SOFT_HYPHEN`/`ENDS_DASH`; EPUB percent-encoded OPF hrefs decoded via
  `safeDecodeHref` before zip lookup; numeric entities guarded against code points
  above U+10FFFF (raw fallback). All in the portable layer (`pdfText.ts`,
  `epubStructure.ts`).
- **Reading-position persistence** (issue #6, 2026-07-07): sampled SHA-256
  fingerprint for book identity (`parsers/index.ts`); `storage/storage.ts`
  (generic `readingaid_v1:` localStorage wrapper, reused by future issue #3
  presets); `storage/readingPosition.ts` (`BookRecord` + two-layer
  `latest`/`history` model); `ui/ResumePrompt.tsx` (pre-reader interstitial);
  `App.tsx` phase machine + periodic/unload saves. Portable core:
  `readingPosition.ts` logic + schema; web-coupled: `localStorage` calls (swap
  to AsyncStorage/MMKV in RN) and `File.slice` + `crypto.subtle` hashing (swap
  to RNFS + react-native-quick-crypto).
- **Presets system** (issue #3, 2026-07-08): `presets/presets.ts` (types,
  9 built-in presets grouped by mode, user CRUD, `bundlesEqual`);
  `ui/PresetsPanel.tsx` (toggle-expand picker, group sections, rename/delete);
  `App.tsx` extended with `activePresetId`, `lastAppliedBundle` ref, `applyPreset`
  (atomic batch), `isModified` derived comparison, user-preset handlers. Storage
  key `readingaid_v1:presets`. Portable: `presets.ts`; web-coupled:
  `PresetsPanel.tsx`.
- **Minimal HUD + space-bar pause-trap fix** (issue #38, 2026-07-09): new
  portable `pacer/keyboard.ts` (`spaceTogglesFrom` predicate) narrows the M7
  keyboard handler's Space case so it toggles the pacer from a focused
  WPM/Word/scrubber field while still yielding to the Play/Pause button and
  genuine text entry (D86); `PacerControls.tsx` gains a `compact` prop
  rendering a reduced HUD without unmounting (D88); `App.tsx`/`index.css`
  collapse the settings-heavy `.app-top` rows via a `.playing`-driven CSS
  `max-height`/opacity transition, deliberately outside the `layoutKey`
  mechanism (D87). Portable: `pacer/keyboard.ts`. Web-coupled: the CSS
  collapse and the `compact` layout branch in `PacerControls.tsx`.
- **Issue #38 QA-round fixes** (2026-07-09, merged as part of PR #40):
  browser testing of the above found four real bugs and requested two feature
  changes; D89 corrects D86–D88. The Space predicate was rewritten to default
  to toggle (was: default to yield), with the Play/Pause button identified by
  a marker attribute (`pacerToggleButtonProps`) instead of by tag name — this
  fixed Space doing nothing after a click-to-seek (focus drops to `<body>`,
  which the old default wrongly yielded to) and Space toggling the Presets
  panel/Mode dropdown instead of the pacer. The HUD collapse's resting-state
  `max-height` ceilings were raised from 6rem (which clipped the theme
  selector even when not playing) to 40rem. `PacerControls.tsx`'s `:disabled`
  Play/Pause button (a pre-existing, not-#38-introduced interaction with
  `usePacer`'s `atEnd`) got visible disabled styling, since it previously
  looked identical whether active or not. Compact-mode WPM reverted from a
  slider to the same number box used in the full view; `WPM_MIN` lowered
  100 → 50. Root causes and full reasoning: D89. Verification: FINDINGS
  F22 (revised)/F23.
- **Markdown parser bug-fixes** (issues #41 #42, 2026-07-09): hard-wrapped
  sentence-initial numbers no longer misread as an ordered-list marker —
  paragraph-interruption now requires a bullet or an ordered marker starting
  at 1, matching CommonMark (D90); `stripInline` resolves backslash-escapes
  first via NUL-delimited placeholders and applies CommonMark's
  emphasis-flanking rules per delimiter type, fixing intraword-underscore,
  whitespace-flanked-asterisk, and escape-order corruption (D91). Both in the
  portable layer (`parsers/markdown.ts`). 15/15 headless-verified against the
  real bundled parser (FINDINGS F24).
- **Resume-drift bug-fix** (issue #48, 2026-07-10): `handleResume` (`App.tsx`)
  now compares the saved `BookRecord.wordCount` against the live
  `words.length` and falls back to resuming by the snapshot's `percent` when
  they differ (a re-tokenization since the position was saved), instead of
  seeking to a raw `wordIndex` that may now point at the wrong word (D92);
  `ResumePrompt.tsx`'s `onResume` callback now passes the full
  `PositionSnapshot` rather than a bare index. Pure logic in `App.tsx`;
  14/14 headless-verified (FINDINGS F26).
- **PDF paragraph-collapse bug-fix** (issue #9, CRITICAL, 2026-07-10):
  `linesToParagraphs` (`parsers/pdfText.ts`) now breaks paragraphs on a
  first-line indent vs. a per-page body-margin mode, and unconditionally at
  every page boundary, in addition to the existing vertical-gap cue (D98) —
  fixes an indented, tightly-leaded document collapsing into one giant Block
  and reopening the ~57k-node perf cliff (F1). A new independent export,
  `splitOversizedParagraphs`, hard-caps any paragraph string at 300 words
  before tokenization as a permanent backstop against future break-detection
  bugs (D99), wired into `parsers/pdf.ts` between `linesToParagraphs` and
  tokenization. Both in the portable layer (`parsers/pdfText.ts`);
  `Word.id === flat index` (D13) unaffected since the split runs on plain
  strings before `reindexWords`. 13/13 new headless-verified against the
  real bundled parser, plus all pre-existing parser/storage suites re-run
  clean (FINDINGS F32).
