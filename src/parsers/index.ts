import type { Document } from '../model/types';
import { parseMarkdown } from './markdown';

/**
 * Parser dispatch (§6). The Reader/Bionic/Pacer never call format-specific
 * parsers directly — they go through this single entry point, which returns the
 * normalized Document regardless of source format.
 *
 * The PDF and EPUB parsers (and their heavy deps, pdf.js / JSZip) are loaded via
 * dynamic import, so a Markdown-only session never downloads them.
 */

export type Format = 'markdown' | 'pdf' | 'epub';

/** Derive a human-ish title from a file name by dropping the extension. */
function titleFromFile(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

/** Parse a loaded file into a normalized Document (§7.4). */
export async function parse(file: File, format: Format): Promise<Document> {
  const title = titleFromFile(file.name);
  switch (format) {
    case 'markdown':
      return parseMarkdown(await file.text(), title);
    case 'pdf': {
      const { parsePdf } = await import('./pdf');
      return parsePdf(await file.arrayBuffer(), title);
    }
    case 'epub': {
      const { parseEpub } = await import('./epub');
      return parseEpub(await file.arrayBuffer(), title);
    }
  }
}

export { parseMarkdown };
