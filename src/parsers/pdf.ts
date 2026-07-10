import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { reindexWords, tokenize } from '../model/tokenize';
import type { Block, Document } from '../model/types';
import { linesToParagraphs, splitOversizedParagraphs, type PdfLine } from './pdfText';

/**
 * PDF parser (§7.4) — the web-coupled half. pdf.js extracts positioned text per
 * page; the portable cleanup (pdfText.ts) turns it into paragraphs.
 *
 * Scanned / image-only PDFs have no extractable text — we detect that and throw
 * a clear message telling the user to convert to Markdown or EPUB.
 */

// pdf.js needs its worker; Vite resolves the URL via `?url`.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface Glyph {
  x: number;
  y: number;
  h: number;
  w: number;
  str: string;
}

/** Group a page's text items into positioned lines (top-to-bottom). */
function itemsToLines(items: TextItem[]): PdfLine[] {
  const glyphs: Glyph[] = [];
  for (const it of items) {
    if (typeof it.str !== 'string' || it.str.length === 0) continue;
    glyphs.push({
      x: it.transform[4],
      y: it.transform[5],
      h: Math.abs(it.transform[3]) || it.height || 10,
      w: it.width || 0,
      str: it.str,
    });
  }
  if (!glyphs.length) return [];

  const medianH =
    [...glyphs.map((g) => g.h)].sort((a, b) => a - b)[Math.floor(glyphs.length / 2)] ||
    10;

  // Sort into reading order: top-to-bottom (PDF y grows upward), then left.
  glyphs.sort((a, b) => (Math.abs(a.y - b.y) > medianH * 0.5 ? b.y - a.y : a.x - b.x));

  const lines: PdfLine[] = [];
  let row: Glyph[] = [];
  let rowY = glyphs[0].y;
  let prevRowY: number | null = null;

  const flush = () => {
    if (!row.length) return;
    row.sort((a, b) => a.x - b.x);
    let text = '';
    let prevRight: number | null = null;
    for (const g of row) {
      // Insert a space when there's a real horizontal gap between glyph runs.
      if (prevRight !== null && g.x - prevRight > medianH * 0.25) text += ' ';
      text += g.str;
      prevRight = g.x + g.w;
    }
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned) {
      lines.push({
        text: cleaned,
        x: Math.min(...row.map((g) => g.x)),
        gapBefore: prevRowY !== null && prevRowY - rowY > medianH * 1.8,
      });
      prevRowY = rowY;
    }
    row = [];
  };

  for (const g of glyphs) {
    if (row.length && Math.abs(g.y - rowY) > medianH * 0.6) {
      flush();
      rowY = g.y;
    }
    if (!row.length) rowY = g.y;
    row.push(g);
  }
  flush();

  return lines;
}

const SCANNED_MESSAGE =
  'This PDF has no extractable text — it looks like a scanned or image-only PDF. ' +
  'Try converting it to Markdown or EPUB and loading that instead.';

export async function parsePdf(data: ArrayBuffer, title?: string): Promise<Document> {
  const loadingTask = pdfjs.getDocument({ data });
  try {
    const pdf = await loadingTask.promise;

    const pages: PdfLine[][] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      pages.push(itemsToLines(content.items as TextItem[]));
    }

    const paragraphs = splitOversizedParagraphs(linesToParagraphs(pages));

    // No meaningful text across the whole document → image-only PDF.
    const visibleChars = paragraphs.join(' ').replace(/\s/g, '').length;
    if (visibleChars < Math.max(16, pdf.numPages * 2)) {
      throw new Error(SCANNED_MESSAGE);
    }

    const blocks: Block[] = paragraphs.map((text, i) => ({
      id: `b${i}`,
      type: 'paragraph',
      words: tokenize(text),
    }));

    return { title, blocks: reindexWords(blocks) };
  } finally {
    await loadingTask.destroy();
  }
}
