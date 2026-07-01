# Reading Aid Tool

A local, browser-based reading app that helps you read faster with less
subvocalization, using two visual aids:

- **Bionic reading** — bolds the leading letters of each word so your eye
  anchors on word shapes instead of sounding each word out.
- **WPM pacer** — pulls your eye forward at a set words-per-minute, with three
  selectable modes.

Both can run at once. **Everything runs client-side in your browser** — no
backend, no server, no network calls, nothing is uploaded. You load a book (PDF,
Markdown, or EPUB), it's parsed locally, and you read.

Built with React + Vite + TypeScript. Intended to be ported to a native mobile
app (React Native) later — see [the docs](#documentation).

---

## Requirements

- **Node.js 18 or newer** (Vite 6 supports Node 18, 20, and 22). `package.json`
  does not pin an engine version, so 18+ is the practical minimum.
- **npm** (ships with Node). Any recent version is fine.

No other system dependencies — the PDF and EPUB parsers are pure JavaScript
libraries pulled in by `npm install`.

---

## Setup — clone and run

```bash
git clone <repo-url>
cd "Reading Aid Tool"
npm install       # installs all dependencies listed in package.json
npm run dev       # starts the Vite dev server
```

Then open the URL printed in the terminal — by default
**http://localhost:5173** (Vite's default port; this project does not override
it).

> **About `npm install`:** it reads `package.json` (and locks exact versions in
> `package-lock.json`) and downloads everything into `node_modules/`. It's the
> Node equivalent of Python's `pip install -r requirements.txt` — you don't
> install dependencies by hand; `package.json` is the manifest and `npm install`
> resolves it. `node_modules/` is git-ignored, so a fresh clone always starts
> from `npm install`.

### Dependencies (from `package.json`)

Runtime: `react`, `react-dom`, `@tanstack/react-virtual` (reader
virtualization), `pdfjs-dist` (PDF text extraction), `jszip` (EPUB unzip).
Tooling: `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`,
`@types/react-dom`.

---

## Build & preview (production)

```bash
npm run build     # type-checks (tsc -b) then builds to dist/
npm run preview   # serves the built dist/ locally (default http://localhost:4173)
```

- `npm run build` runs `tsc -b && vite build`; output goes to **`dist/`**.
- `npm run preview` serves that production build for a local smoke test.
- `npm run typecheck` runs `tsc -b --noEmit` if you want types checked without a
  build.

The build code-splits the heavy parser libraries: pdf.js and JSZip load only
when you actually open a PDF or EPUB, so a Markdown-only session stays light.

---

## How to use

### 1. Load a book
On the start screen:
- Pick a **format** in the dropdown (Markdown / PDF / EPUB), or just drop/choose
  a file — the format is auto-detected from the extension (`.md` / `.markdown` /
  `.txt` → Markdown, `.pdf` → PDF, `.epub` → EPUB). The dropdown is the fallback
  for ambiguous files.
- **Drag-and-drop** a file onto the box, or click **Choose file**.
- **Load sample** loads a small built-in Markdown document to try things out.

### 2. Pick a reading mode (Mode dropdown)
- **Flowing highlight** — the whole text stays laid out; a highlight glides
  word-by-word, optionally with a few "lead" words highlighted ahead
  (*Lead words*: 0–5). The active line auto-scrolls to stay in view.
- **RSVP** — one word at a time at a fixed focal point, with one anchor letter in
  red (the Optimal Recognition Point). *Font size*: 1.5–6 rem.
- **Chunk highlight** — N words highlighted in place at a time, advancing one
  chunk per step. *Chunk size*: 2–4.

### 3. Set the pace & controls
- **WPM** — slider or type an exact value, **100–1000** (default **300**).
  Changes apply immediately, even mid-play.
- **Play / Pause**, **Restart**, and a **scrubber** to seek anywhere.
- **Word** field — type a word number to jump to it; a progress bar and
  percentage show your position.

### 4. Reading settings (toolbar)
- **Bionic reading** — on/off, with **Low / Medium / High** intensity (default:
  on, Medium).
- **Natural pauses** — when on (default), the pacer lingers longer on commas,
  sentence ends, and paragraph breaks so the rhythm feels natural. Turn off for
  a strictly metronomic pace.
- **Text size** and **Line width** — adjust the reading column's font size and
  measure.
- **Theme** — Light / Sepia / Dark / Dim (default: Light).

### 5. Keyboard shortcuts
| Key | Action |
|-----|--------|
| `Space` | Play / pause |
| `→` | Step to the next word |
| `←` | Step to the previous word |
| `Home` | Restart from the beginning |
| Click a word | Jump the pacer to that word |

(Shortcuts are ignored while you're typing in a field or a control is focused.)

---

## File-format notes & limitations

Parsing quality varies by format — the format dropdown exists so you can pick the
cleanest source you have. All parsing normalizes into one internal model, so the
reader/pacer behave identically regardless of source.

**Markdown** (best results)
- Headings and paragraphs are preserved. Lists become one paragraph per item;
  blockquotes merge into a paragraph; fenced code blocks become paragraphs;
  horizontal rules are dropped.
- Inline formatting (bold/italic/links/inline code) is **stripped to plain
  text** — bionic rendering owns all styling.

**PDF** (best-effort; text-based PDFs only)
- Text is extracted with pdf.js and cleaned up heuristically: repeated
  headers/footers (text appearing on ≥ ~half the pages) and bare page numbers are
  dropped, hyphenated line-breaks are re-joined, and lines are reflowed into
  paragraphs on vertical gaps.
- **No heading detection** — PDF content becomes paragraphs.
- **Multi-column layouts, tables, footnotes, and drop-caps will reflow poorly**
  (line grouping is position-based).
- **Scanned / image-only PDFs are rejected** with a message telling you to
  convert to Markdown or EPUB. Detection is based on how much text is
  extractable (not OCR), so a mostly-image PDF with a little text may slip
  through and read badly.

**EPUB**
- The book's spine (reading order) is followed; each XHTML document's body is
  parsed into blocks.
- Only `h1`–`h6`, `p`, `li`, and `blockquote` content is captured — text inside
  other containers (e.g. bare `div`/`table`/`figure`) may be skipped.
- Parsing assumes reasonably well-formed XHTML. **DRM-encrypted EPUBs are not
  supported.**

---

## Project structure (`src/`)

```
src/
  main.tsx, App.tsx, index.css   # entry, app shell + state, styles
  model/
    types.ts        # Document / Block / Word model
    tokenize.ts     # text → Word[]; flatten + reindex
  parsers/
    index.ts        # parse(file, format) dispatcher (lazy-loads pdf/epub)
    markdown.ts     # Markdown → Document
    pdf.ts          # pdf.js extraction (+ scanned-PDF rejection)
    pdfText.ts      # pure PDF cleanup heuristics
    epub.ts         # JSZip unzip → Document
    epubStructure.ts# pure container/OPF/XHTML parsing
  reader/
    Reader.tsx      # virtualized reading surface (imperative handle)
    BionicText.tsx  # inline bionic markup
    bionic.ts       # head/tail split logic
  pacer/
    usePacer.ts     # the clock: index, timing, dwell, ≤1-word/frame, pub/sub
    PacerControls.tsx # play/pause/restart/seek/WPM
    ModeSettings.tsx  # mode dropdown + per-mode settings
    dwell.ts        # punctuation dwell multipliers
    orp.ts          # RSVP optimal-recognition-point math
    modes/
      FlowingHighlight.tsx, Rsvp.tsx, ChunkHighlight.tsx
      scrollHelpers.ts
  ui/
    FileInput.tsx   # format dropdown + picker + drag/drop
    Settings.tsx    # bionic, natural pauses, text size, line width
    ThemeSelector.tsx, theme.ts   # 4 themes
    sample.ts       # built-in sample document
```

The code is deliberately split into **portable pure logic** (`model/`, the
`.ts` files, the parser cleanup) and a **web layer** (DOM, virtualization, CSS),
because the portable half is what crosses to the planned React Native port.

---

## Documentation

These are maintained docs, kept current every milestone, and form the basis for
the planned React Native (Android, then iOS) port:

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — system design, and the portable-logic
  vs. web-layer split with explicit **Porting notes**.
- **[DECISIONS.md](DECISIONS.md)** — append-only log of every design decision and
  why.
- **[FINDINGS.md](FINDINGS.md)** — empirical learnings from building/testing,
  each tagged with how it was verified.
- **[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)** — the product spec and scope.
