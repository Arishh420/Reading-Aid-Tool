/**
 * PDF text cleanup (§7.4) — the portable, DOM-free half of the PDF parser.
 *
 * pdf.js gives us positioned text per page; this module turns those positioned
 * lines into clean reading paragraphs by applying the common "PDF nasties"
 * heuristics: drop repeated headers/footers and bare page numbers, join
 * hyphenated line-breaks, and merge lines into paragraphs on vertical-gap cues.
 *
 * Quality is allowed to vary (the format dropdown lets the user pick a cleaner
 * source). Kept pure so it's unit-testable and crosses to React Native.
 */

export interface PdfLine {
  /** The line's text (already space-joined from glyphs). */
  text: string;
  /** Left x of the line (indentation cue). */
  x: number;
  /** True when a large vertical gap precedes this line (paragraph break). */
  gapBefore: boolean;
}

/** A bare page number / running folio that should be dropped. */
export function isBarePageNumber(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/^\d{1,4}$/.test(t)) return true; // 12
  if (/^[ivxlcdm]{1,8}$/i.test(t)) return true; // xiv
  if (/^[-–—]\s*\d{1,4}\s*[-–—]$/.test(t)) return true; // - 12 -
  if (/^(page|p\.?)\s*\d{1,4}$/i.test(t)) return true; // Page 12
  return false;
}

// Word-continuation hyphens: ASCII '-' (U+002D), soft hyphen (U+00AD), hyphen (U+2010).
const ENDS_SOFT_HYPHEN = /[-\u00AD\u2010]$/;
// Em/en dash punctuation: en dash (U+2013), em dash (U+2014).
const ENDS_DASH = /[\u2013\u2014]$/;

// First-line-indent break: a line whose x sits this far right of the page's
// body margin is treated as an indented paragraph start. Above float jitter,
// below a real first-line indent (D98).
const INDENT_THRESHOLD = 5;

interface AnnotatedLine extends PdfLine {
  /** First surviving line of a page after any prior page has already emitted content. */
  pageStart: boolean;
  /** x sits further right than the page's body margin by more than INDENT_THRESHOLD. */
  indentBreak: boolean;
}

/**
 * Turn positioned per-page lines into reading paragraphs.
 *
 * Steps: (1) detect header/footer text that repeats across pages, (2) per page,
 * drop page numbers/repeated edges and annotate each surviving line with its
 * break cues (vertical gap, first-line indent vs. that page's body margin, page
 * start), (3) merge lines into paragraphs, breaking on any of those cues and
 * de-hyphenating line-end breaks.
 */
export function linesToParagraphs(pages: PdfLine[][]): string[] {
  // 1. Repeated header/footer detection: the first/last line of many pages.
  const freq = new Map<string, number>();
  for (const page of pages) {
    if (!page.length) continue;
    const edges = new Set([page[0].text.trim(), page[page.length - 1].text.trim()]);
    for (const e of edges) if (e) freq.set(e, (freq.get(e) ?? 0) + 1);
  }
  const repeatThreshold = Math.max(2, Math.ceil(pages.length * 0.5));
  const repeated = new Set(
    [...freq].filter(([, n]) => n >= repeatThreshold).map(([t]) => t),
  );

  // 2. Per page: drop page numbers/repeated edges, compute that page's body
  // margin (the mode of surviving-line x, ties -> smaller x), and annotate.
  const lines: AnnotatedLine[] = [];
  let sawContent = false;

  for (const page of pages) {
    const survivors: PdfLine[] = [];
    page.forEach((line, i) => {
      const t = line.text.trim();
      if (!t) return;
      if (isBarePageNumber(t)) return;
      const isEdge = i === 0 || i === page.length - 1;
      if (isEdge && repeated.has(t)) return;
      survivors.push({ ...line, text: t });
    });
    if (!survivors.length) continue;

    const buckets = new Map<number, number>();
    for (const l of survivors) {
      const b = Math.round(l.x);
      buckets.set(b, (buckets.get(b) ?? 0) + 1);
    }
    let bodyMargin = survivors[0].x;
    let bestCount = -1;
    for (const [x, count] of [...buckets].sort((a, b) => a[0] - b[0])) {
      if (count > bestCount) {
        bestCount = count;
        bodyMargin = x;
      }
    }

    survivors.forEach((line, idx) => {
      lines.push({
        ...line,
        pageStart: idx === 0 && sawContent,
        indentBreak: line.x - bodyMargin > INDENT_THRESHOLD,
      });
      sawContent = true;
    });
  }

  // 3. Merge into paragraphs with de-hyphenation.
  const paragraphs: string[] = [];
  let current = '';
  const flush = () => {
    const s = current.replace(/\s+/g, ' ').trim();
    if (s) paragraphs.push(s);
    current = '';
  };

  for (const line of lines) {
    if (!current) {
      current = line.text;
      continue;
    }
    if (line.gapBefore || line.indentBreak || line.pageStart) {
      flush();
      current = line.text;
      continue;
    }
    if (ENDS_SOFT_HYPHEN.test(current)) {
      // Word-break hyphen: strip it when the next fragment is a lowercase continuation.
      current = /^[a-z]/.test(line.text)
        ? current.replace(ENDS_SOFT_HYPHEN, '') + line.text
        : current + line.text;
    } else if (ENDS_DASH.test(current)) {
      // Em/en dash punctuation: keep the dash. Mirror a leading space after it
      // ("word —" → "word — next") but not for an attached dash ("word—next").
      current += / [–—]$/.test(current) ? ' ' + line.text : line.text;
    } else {
      current += ' ' + line.text;
    }
  }
  flush();

  return paragraphs;
}

/**
 * Safety net: split any paragraph above `maxWords` into multiple chunks at
 * whitespace boundaries (never mid-word). Operates on plain paragraph strings
 * (already single-space-normalized by `linesToParagraphs`'s `flush`), before
 * tokenize()/reindexWords() ever run — independent of the paragraph-break
 * detection above, so it catches any future break-detection bug too (D99).
 * Rejoining every returned chunk with a single space reproduces the input
 * paragraph exactly.
 */
export function splitOversizedParagraphs(paragraphs: string[], maxWords = 300): string[] {
  const result: string[] = [];
  for (const p of paragraphs) {
    const words = p.split(' ');
    if (words.length <= maxWords) {
      result.push(p);
      continue;
    }
    for (let i = 0; i < words.length; i += maxWords) {
      result.push(words.slice(i, i + maxWords).join(' '));
    }
  }
  return result;
}
