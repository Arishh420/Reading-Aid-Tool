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
  (`itemsToLines` groups glyphs into lines with indentation + vertical-gap cues),
  then the **pure** `pdfText.ts` (`linesToParagraphs`) applies the cleanup
  heuristics — drop repeated headers/footers and bare page numbers, de-hyphenate
  line-break splits, reflow lines into paragraphs on gaps. Scanned/image-only
  PDFs (no extractable text) are detected and rejected with a clear message.
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

## 11. State & settings — `src/App.tsx`

`App` owns all state: loaded `Document`, bionic settings, theme, WPM, natural
pauses, mode, per-mode settings, and reader display (font size + line width). It
builds `words` and `dwell` (memoized per doc), runs `usePacer`, and renders the
active mode view. **No persistence yet** — localStorage for settings is deferred
(see DECISIONS D2).

- **Reader typography (M7):** font size and line width are applied as CSS
  variables (`--reader-font-size`, `--reading-width`) on the app shell; the
  laid-out reader reads them. A `layoutKey` (derived from those values) is passed
  to the in-place modes so the overlay/highlight reposition when typography
  changes the layout (the same way they react to a bionic toggle or resize).
- **Keyboard transport (M7):** a window `keydown` handler gives Space
  (play/pause), ←/→ (step word), Home (restart) — ignored while a control
  (input/select/textarea/button) is focused so it doesn't double-fire or hijack
  native keys.
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
| `pacer/dwell.ts` | dwell multipliers |
| `pacer/usePacer.ts` | clock: timing, dwell, ≤1/frame clamp, chunk stepping, pub/sub (rAF & React exist in RN) |
| mode *logic* (lead/chunk index math, `firstWordlikeFrom`) | which words to highlight |
| theme token *values* | the color sets |

### Web-coupled (reimplement against RN primitives)
| Module | Web dependency | RN replacement |
|---|---|---|
| `reader/Reader.tsx` | DOM, `@tanstack/react-virtual`, `getBoundingClientRect`, `querySelector` | FlatList/RecyclerListView + `onLayout` + imperative handle |
| `reader/BionicText.tsx` | inline `<b>` | `<Text>`/`<Text bold>` (reuse `splitBionic`) |
| `pacer/modes/*.tsx` | overlay rects, `scrollTo`, `classList` | `Animated` overlay, measured layout (reuse mode logic) |
| `pacer/modes/scrollHelpers.ts` | DOM scroll | scroll-to-offset on the list |
| `pacer/PacerControls.tsx` | range/number inputs | RN `Slider` / `TextInput` |
| `ui/*` (`FileInput`, `Settings`, `ThemeSelector`) | DOM/CSS | RN views; file picking via a platform module |
| `index.css` + `data-theme` | CSS variables | `StyleSheet` + theme context |
| `parsers/pdf.ts` | `pdfjs-dist` + worker, `ArrayBuffer` | RN PDF lib (reuse `pdfText.ts`) |
| `parsers/epub.ts` | `JSZip`, `ArrayBuffer` | RN unzip (reuse `epubStructure.ts`) |

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
