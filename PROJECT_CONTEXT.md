# Reading Aid Tool — Project Context

> Single source of truth for **scope**. Read this fully before writing any code.
> System design lives in [ARCHITECTURE.md](ARCHITECTURE.md); resolved judgment
> calls/forks in [DECISIONS.md](DECISIONS.md). These three are kept current every
> milestone (docs are part of "done").

> **Status: V1 COMPLETE + post-V1 features shipped.** All three parsers
> (Markdown, PDF, EPUB), bionic, the full pacer (flowing / RSVP / chunk) +
> controls, four themes, punctuation-aware pacing, keyboard transport, reader
> font-size/line-width controls, and empty/error states are built. Post-V1
> additions: RSVP context strip (issue #1), reading-position persistence
> (issue #6), presets system (issue #3), minimal reading HUD during playback
> + space-bar pause-trap fix (issue #38, merged PR #40), markdown parser
> corruption fixes (issues #41/#42, merged PR #52). An adversarial-audit pass
> afterward opened a further backlog of issues — see GitHub issues for the
> current, authoritative list; not restated here. See
> [ARCHITECTURE.md](ARCHITECTURE.md) (Porting notes) and
> [FINDINGS.md](FINDINGS.md).

---

## 1. Problem Statement

The user has two distinct reading difficulties:

1. **Subvocalization / over-articulation.** Reads slowly while mentally pronouncing every word clearly, which consumes attention that should go to comprehension. The meaning is lost even though the words are "read," and this happens automatically without the user noticing until later — forcing re-reads.
2. **Poor short-term retention.** Comprehension happens *in the moment* of reading, but the understanding evaporates the instant attention shifts to something else (classic working-memory decay).

This tool targets **problem 1 directly** (speed + flow + reduced subvocalization) via two visual-aid techniques. Problem 2 (retention) is explicitly **deferred to v2** (see §4).

---

## 2. What The Tool Does (V1)

A local, browser-based reading app that loads a book and renders it with two assistive reading modes:

1. **Bionic reading** — bolds the leading characters of each word so the eye anchors on the word shape instead of sounding it out letter by letter.
2. **WPM pacer** — a paced visual cue that pulls the reader forward at a set words-per-minute, with three selectable modes.

Both can be combined (e.g. bionic rendering *plus* an active pacer).

---

## 3. V1 Scope (Locked)

- [x] **Bionic reading** rendering with adjustable intensity + on/off toggle
- [x] **WPM Pacer** with 3 modes (dropdown to switch; settings panel adapts per mode):
  - RSVP (single word flashed at a fixed ORP focal point)
  - Flowing highlight bar (a highlight sweeps across the text in place)
  - Chunk highlight (N words highlighted at a time, advancing in place)
- [x] **Pacer controls:** play / pause / restart / seek (jump to a clicked word or scrub a progress bar) / live speed adjustment
- [x] **File input** with a format selector dropdown: **PDF**, **Markdown**, **EPUB**
  *(all three parse; scanned/image-only PDFs are detected and rejected)*
- [x] All processing is **fully client-side** — no backend, no API, no network calls

**Added since the original spec (in scope, built M3–M5):**
- [x] **Four reader themes** (Light / Sepia / Dark / Dim), Light default
- [x] **Punctuation-aware pacing** — per-word dwell on commas/periods/paragraph
  breaks, toggle "Natural pauses" (default ON), applies to all three modes
- [x] **RSVP ORP fixed anchor** (one red anchor letter pinned to a stationary x)
  + a **pause cue** (a tick that depletes over a punctuation dwell)
- [x] **RSVP context strip** (issue #1) — dim current-paragraph view under the
  flashing word, toggleable, default on *(merged, PR #23)*
- [x] **Reading-position persistence** (issue #6) — sampled SHA-256 fingerprint for
  book identity; resume prompt on reload; 30 s interval + tab-hide saves *(merged)*
- [x] **Presets system** (issue #3) — named settings profiles (9 built-in presets
  grouped by mode: flowing / RSVP / chunk / accessibility). User presets fully
  CRUD-able (save, rename, delete). Atomic apply switches all 13 settings + mode in
  one batch. Modified indicator when settings drift from the applied preset. All local,
  no accounts. *(merged, PR #37)*
- [x] **Minimal HUD during playback + space-bar pause-trap fix** (issue #38) —
  while the pacer is playing, `.app-top`'s settings-heavy rows (mode dropdown,
  bionic/theme/text-size settings, presets panel, keyboard hint) collapse to a
  minimal HUD (transport, a live WPM number box, read-only progress); full
  controls return on pause. Space toggles play/pause from any element except
  the Play/Pause button itself and genuine text/checkbox/radio/file entry —
  including a WPM/Word/scrubber field (the original trap), a clicked word
  span, or the Mode dropdown/Presets panel button (previously also wrongly
  trapped Space; fixed in the same pass, see below). WPM floor lowered to 50.
  *(merged, PR #40 — a first round of browser testing had found 4 real bugs;
  all four were root-caused and fixed in the same PR. See FINDINGS F22
  (revised)/F23, DECISIONS D89.)*
- [x] **Markdown parser corruption fixes** (issues #41/#42) — hard-wrapped
  sentence-initial numbers no longer misread as ordered-list markers (only a
  marker starting at 1 interrupts an in-progress paragraph, matching
  CommonMark); `stripInline` no longer corrupts intraword underscores,
  whitespace-flanked asterisks, or backslash-escaped punctuation
  (per-delimiter CommonMark flanking rules + NUL-delimited escape
  placeholders resolved before any other inline regex runs). See DECISIONS
  D90/D91, FINDINGS F24. *(merged, PR #52)*

---

## 4. Explicitly Out Of Scope (V2+)

Do **not** build these in v1. Listed only so the architecture leaves room for them:

- Margin annotations / sticky notes
- Forced pause + recall prompts (testing-effect retention aid)
- AI summary sidebar (will require an API key — deferred until access is available)
- Native **Android app** — planned future port. **Because of this, prefer React** so a future React Native migration shares logic and mental model.

---

## 5. Tech Stack

- **React + Vite** (TypeScript preferred; plain JS acceptable if the user prefers)
- **pdf.js** (`pdfjs-dist`) — client-side PDF text extraction
- **JSZip** + a lightweight EPUB reader (or manual unzip + HTML parse) — EPUB is a zip of XHTML; unpack and read content documents in spine order
- **Markdown** — parse with a small lib (e.g. `marked`) or a minimal custom tokenizer; we only need block + inline text, not full HTML rendering
- **No backend.** No server, no database, no external API in v1.
- Styling: keep it simple and readable (the *content* is the product). A clean reader theme with adjustable font size and comfortable line length.

---

## 6. Core Architecture — Internal Text Model

**This is the most important design decision.** All three input formats normalize into ONE internal representation. The reader/bionic/pacer code only ever sees this model — it never knows or cares which format the file came from.

```
RawFile (pdf | md | epub)
        │
        ▼
  Format Parser  ──►  normalizes to ──►  Document
                                            │
                                            ▼
                                   Renderer + Bionic + Pacer
```

### Document shape (suggested)

```ts
interface Document {
  title?: string;
  blocks: Block[];
}

interface Block {
  id: string;
  type: 'heading' | 'paragraph';   // keep minimal in v1
  level?: number;                  // for headings
  words: Word[];                   // pre-tokenized
}

interface Word {
  id: string;        // stable index for seeking/pacing
  text: string;      // raw token incl. trailing punctuation
  isWordlike: boolean; // false for pure punctuation/symbols — pacer skips, bionic ignores
}
```

Tokenizing into `words` up front means the **pacer and bionic share the same word list** and seeking is just an index into a flat sequence. Build a flattened `Word[]` view across all blocks for the pacer, while keeping block grouping for layout.

---

## 7. Feature Specs

### 7.1 Bionic Reading

- For each word-like token of visible length `L` (letters only), bold the first `n` characters where `n = max(1, round(L * ratio))`.
- **Intensity is configurable** via `ratio`: Low ≈ 0.3, Medium ≈ 0.5, High ≈ 0.6.
- Punctuation attached to a word does not count toward `L` and is never bolded.
- Implement as inline markup: `<b>{head}</b>{tail}` per word. Pure CSS, cheap to render.
- Global on/off toggle. Works whether or not the pacer is running.

### 7.2 WPM Pacer — shared

- Single source of truth: `currentWordIndex` into the flattened `Word[]`.
- Advance timing derived from WPM: `msPerWord = 60000 / WPM`. (For chunk modes, advance by chunk but keep effective WPM consistent.)
- Controls: **play / pause / restart / seek / live WPM change.** Changing WPM while playing takes effect immediately.
- Seeking: clicking any word sets `currentWordIndex`; a progress bar/scrubber also sets it.
- Skip non-word-like tokens when advancing.
- **Punctuation-aware dwell (Natural pauses):** the per-word advance threshold is
  multiplied by a dwell factor from trailing punctuation (comma/dash 1.75×,
  sentence-end 2.5×, paragraph-end 3×). Lives in the clock so all modes inherit
  it. Toggle, default ON. See ARCHITECTURE §6.
- **Performance contract:** the index is held in a ref + pub/sub (the document
  tree does not re-render per tick), the clock advances **≤1 step per frame** (no
  word-skipping under jank), and timing stays smooth at 300+ WPM. See
  ARCHITECTURE §5 / §9 and DECISIONS D18–D24.

### 7.3 Pacer Modes (dropdown)

Each mode reads from the shared `currentWordIndex` but renders differently, and exposes its own settings panel:

1. **RSVP** (ORP-based)
   - Renders one word at a fixed focal point, rest of page replaced by the focal stage.
   - **Optimal Recognition Point (ORP):** one anchor letter is rendered in a
     theme-aware red and **pinned to a stationary horizontal x** (left-of-centre,
     ~40%); pre/post text extends left/right around it. Anchor index by word
     length (1→0, 2–5→1, 6–9→2, 10–13→3, 14+→4). Monospace, so the anchor cannot
     drift between words of different lengths. See ARCHITECTURE §8.
   - **Pause cue:** a thin tick under the anchor depletes over a punctuation
     dwell (scaled by the dwell factor), so a sentence/clause boundary is felt,
     not guessed. Never moves the anchor; gated on Natural pauses.
   - **Context strip (issue #1):** a dim, small, glanceable view of the
     surrounding text below the flashing word. The active word's line is **pinned
     to a fixed center line** and the paragraph text **scrolls continuously under
     it** (lines rise one at a time — not a page-flip), so the fixation point
     never moves. The current word is marked in the accent color with an
     underline (no bold — it would re-wrap the line). Every visible line is a full,
     uniform line box; paragraph breaks show a faint hairline that doesn't steal a
     text row. Sharp text with a soft alpha fade at the top/bottom edges. Restores
     the spatial context RSVP
     removes. RSVP-only; toggle "Show context" (default on); height adjustable
     live at **3 / 5 context lines** (default 3). The context font **tracks the
     anchor** (scales with the font-size slider), and the word + strip sit in one
     centered stack that can't overlap at any size. **Clicking any word in the
     strip seeks the pacer to it** (delegated, like the main reader). Additive —
     does not touch the pacer clock or the fixed anchor.
   - **Bionic** reading doesn't apply to a single ORP-anchored word, so the global
     Bionic toggle + intensity are **hidden while in RSVP** (state preserved; they
     return on switching back to flowing/chunk). The global **Text size** slider is
     likewise hidden in RSVP (RSVP has its own Font size); **Line width stays** (it
     sizes the RSVP word grid + strip).
   - Single word per flash (chunk size fixed at 1). Settings: WPM, font size,
     show context, context lines.
2. **Flowing Highlight Bar**
   - Full text stays visible and laid out normally; a highlight sweeps word-by-word in reading order, pulling the eye forward.
   - Settings: WPM, highlight color/style, optional number of "lead" words highlighted ahead.
   - This is the user's primary requested experience — keep it smooth.
3. **Chunk Highlight**
   - Full text visible; highlights N words at a time in place, advancing one chunk per tick.
   - Settings: WPM, chunk size (2–4), highlight style.

**The settings panel must swap dynamically when the mode dropdown changes.**

### 7.4 File Input

- A **format selector dropdown** (PDF / Markdown / EPUB) plus a file picker / drag-and-drop.
- Each format has its own parser module returning a `Document`:
  - **Markdown:** tokenize blocks (headings, paragraphs); strip inline markup to plain text for v1 (we don't need bold/italic rendering of the source — bionic owns the styling).
  - **PDF:** use pdf.js to extract text per page. Handle the common nasties: join hyphenated line-breaks, drop repeated headers/footers and bare page numbers where feasible, merge lines into paragraphs on blank-line / indentation cues. **Scanned (image-only) PDFs are out of scope** — detect "no extractable text" and show a clear message telling the user to convert to Markdown or EPUB instead.
  - **EPUB:** unzip, read `content.opf` spine order, parse each XHTML document's body text into blocks.
- Parsing quality will vary (especially messy PDFs). That's acceptable for v1 — the format dropdown exists precisely so the user can pick the cleanest source they have. (User note: a Microsoft "convert to Markdown" extension is one easy path to a clean MD input.)

---

## 8. Suggested Project Structure

```
src/
  main.tsx
  App.tsx
  model/
    types.ts            # Document, Block, Word
    tokenize.ts         # text -> Word[]
  parsers/
    markdown.ts
    pdf.ts
    epub.ts
    index.ts            # parse(file, format) -> Document
  reader/
    Reader.tsx          # lays out blocks
    Bionic.tsx          # bionic rendering of a Word/Block
    bionic.ts           # head/tail split logic
  pacer/
    usePacer.ts         # timing, currentWordIndex, play/pause/seek
    PacerControls.tsx   # play/pause/restart/seek/WPM
    modes/
      Rsvp.tsx
      FlowingHighlight.tsx
      ChunkHighlight.tsx
    ModeSettings.tsx    # swaps per selected mode
  ui/
    FileInput.tsx       # format dropdown + picker
    Settings.tsx        # global: font size, bionic intensity/toggle
```

---

## 9. Build Sequence (Milestones)

1. **Scaffold** Vite + React project; set up the internal `Document` model + tokenizer.
2. **Markdown parser first** (simplest) → render plain blocks in the Reader. Prove the model end-to-end with the easiest input.
3. **Bionic rendering** on top of the rendered blocks (toggle + intensity).
4. **Pacer core** (`usePacer`) + the **Flowing Highlight** mode (the priority experience) + controls.
5. **RSVP** and **Chunk** modes + the dynamic settings panel.
6. **PDF parser** (pdf.js) with cleanup, then **EPUB parser** (JSZip).
7. Polish: seeking UX, font/line-length controls, empty/error states (incl. scanned-PDF message).

---

## 10. Working Style (Important)

Confirm the plan and the proposed file/module structure **before** implementing each milestone. Prefer deliberate, requirement-confirmed steps over generating the whole app in one shot. After scaffolding, pause and show the structure for sign-off.

---

## 11. Open Questions — RESOLVED

The original pre-coding forks are all decided; full reasoning in DECISIONS.md:
TypeScript over plain JS (D1); persistence (D2 — since extended: reading-position
is now implemented per issue #6, see D67–D76; settings auto-persistence across
reloads is still deferred); four themes via a `data-theme` swap (D12).
