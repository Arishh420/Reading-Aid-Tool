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

## Change log
- Created at the M7 documentation audit (2026-06-26). Keep current with
  ARCHITECTURE.md / DECISIONS.md.
