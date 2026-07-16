import type { Document } from '../model/types';

/**
 * Punctuation-aware pacing (refinement A). A per-word dwell multiplier applied
 * on top of msPerWord by the pacer clock, so the highlight lingers on the word
 * *before* a pause then advances. This lives at the clock level, so every mode
 * (flowing, RSVP, chunk) inherits it for free.
 *
 * Multiplier is driven by the current word's trailing punctuation, with the
 * last word of a block (paragraph end) taking the longest pause:
 *   , ; : – —                 -> 1.75x
 *   . ! ? …                   -> 2.5x
 *   last word of block        -> 3x
 *   no trailing punctuation   -> 1x
 *
 * A standalone punctuation token (e.g. a spaced "—") is `isWordlike: false`,
 * so the pacer's `firstWordlikeFrom` skips it and never lands on its index —
 * its own dwell entry would be dead. To keep the pause perceptible anyway
 * (issue #25), each word-like token's dwell rolls up the MAX of its own
 * `trailingDwell` and the `trailingDwell` of every non-word-like token
 * immediately following it (the run the pacer will skip over), so the pause
 * is felt on the word right before the skipped run instead of being lost.
 */

export const DWELL_CLAUSE = 1.75;
export const DWELL_SENTENCE = 2.5;
export const DWELL_PARAGRAPH = 3;

// Closing quotes/brackets that can trail the real punctuation (e.g. `end."`).
const TRAILING_CLOSERS = /["'”’)\]}]+$/;

/** Dwell multiplier implied by a token's trailing punctuation (no block info). */
export function trailingDwell(token: string): number {
  const trimmed = token.replace(TRAILING_CLOSERS, '');
  const last = trimmed[trimmed.length - 1];
  if (!last) return 1;
  if ('.!?…'.includes(last)) return DWELL_SENTENCE;
  if (',;:'.includes(last)) return DWELL_CLAUSE;
  if ('-–—'.includes(last)) return DWELL_CLAUSE;
  return 1;
}

/**
 * Build a dwell multiplier per flat word index. Word ids are the contiguous
 * flat index (reindexWords guarantees it), so this array is indexed directly by
 * the pacer's currentWordIndex. The last word-like token of each block gets the
 * paragraph-end pause.
 */
export function buildDwellMultipliers(doc: Document): number[] {
  const result: number[] = [];
  for (const block of doc.blocks) {
    let lastWordlikePos = -1;
    block.words.forEach((w, i) => {
      if (w.isWordlike) lastWordlikePos = i;
    });
    block.words.forEach((w, i) => {
      if (!w.isWordlike) {
        result[Number(w.id)] = trailingDwell(w.text);
        return;
      }
      if (i === lastWordlikePos) {
        result[Number(w.id)] = DWELL_PARAGRAPH;
        return;
      }
      let dwell = trailingDwell(w.text);
      for (let j = i + 1; j < block.words.length && !block.words[j].isWordlike; j++) {
        dwell = Math.max(dwell, trailingDwell(block.words[j].text));
      }
      result[Number(w.id)] = dwell;
    });
  }
  return result;
}
