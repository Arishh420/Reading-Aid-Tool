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

/**
 * Sampled SHA-256 fingerprint for book identity.
 *
 * Files ≤ 96 KB: full content hash.
 * Files > 96 KB: SHA-256 of [first 32 KB | middle 32 KB | last 32 KB | fileSize as 8-byte BE].
 * Sampling keeps hashing imperceptible even for large PDFs; collision risk is
 * negligible because three distinct regions + exact file size must all match.
 *
 * Uses crypto.subtle (native/C++ in browsers) — no external dependency.
 * Platform note: on React Native, swap File.slice → RNFS/Blob reads and
 * crypto.subtle → react-native-quick-crypto; the logic and schema are unchanged.
 */
const SAMPLE_BYTES = 32 * 1024; // 32 KB per region
const FULL_THRESHOLD = SAMPLE_BYTES * 3; // 96 KB

export async function computeFingerprint(file: File): Promise<string> {
  let buffer: ArrayBuffer;

  if (file.size <= FULL_THRESHOLD) {
    buffer = await file.arrayBuffer();
  } else {
    const mid = Math.floor(file.size / 2);
    const [start, middle, end] = await Promise.all([
      file.slice(0, SAMPLE_BYTES).arrayBuffer(),
      file.slice(mid - SAMPLE_BYTES / 2, mid + SAMPLE_BYTES / 2).arrayBuffer(),
      file.slice(file.size - SAMPLE_BYTES).arrayBuffer(),
    ]);
    // Concatenate the three regions plus an 8-byte big-endian file size so
    // two files with identical sample bytes but different sizes don't collide.
    const combined = new Uint8Array(start.byteLength + middle.byteLength + end.byteLength + 8);
    let offset = 0;
    combined.set(new Uint8Array(start), offset);   offset += start.byteLength;
    combined.set(new Uint8Array(middle), offset);  offset += middle.byteLength;
    combined.set(new Uint8Array(end), offset);     offset += end.byteLength;
    new DataView(combined.buffer).setBigUint64(offset, BigInt(file.size), false);
    buffer = combined.buffer;
  }

  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

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
