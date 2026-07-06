import type { Document } from './types';

/**
 * Flat-word-index → block lookups (pure, portable).
 *
 * Word ids are the contiguous flat index (reindexWords guarantees it), so the
 * block containing a given word is found by binary search over each block's
 * first word id. Used by any consumer that needs "which paragraph is the active
 * word in" — e.g. the RSVP context strip.
 */

/**
 * First flat word id of each block, as a **non-decreasing** array (required by
 * the binary search below).
 *
 * A word-less block (possible from PDF/EPUB) owns no flat index, so it is given
 * the id of the *next* word (the running count). That keeps the array monotonic
 * and makes an empty block never win the search: its start ties with the
 * following real block's start, and the search resolves ties to the later block.
 * (An earlier version used MAX_SAFE_INTEGER, which broke monotonicity — a single
 * mid-document empty block then corrupted every lookup after it.)
 */
export function buildBlockStarts(doc: Document): number[] {
  const starts: number[] = [];
  let running = 0;
  for (const b of doc.blocks) {
    starts.push(b.words.length ? Number(b.words[0].id) : running);
    running += b.words.length;
  }
  return starts;
}

/** Index of the block containing flat word `index` (binary search). */
export function blockIndexForWord(blockStarts: number[], index: number): number {
  let lo = 0;
  let hi = blockStarts.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (blockStarts[mid] <= index) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
