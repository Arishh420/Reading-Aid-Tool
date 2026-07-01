import type { Block, Document, Word } from './types';

/**
 * Tokenization: text -> Word[] (§6).
 *
 * Splitting into words up front means the pacer and bionic share one word list,
 * and seeking is just an index into a flat sequence. A token is "word-like" if
 * it contains at least one letter or number; pure punctuation/symbol tokens are
 * kept (so the rendered text reads naturally) but flagged so the pacer skips
 * them and bionic ignores them.
 *
 * Punctuation that is *attached* to a word (e.g. the comma in "world,") stays
 * part of that single token. Splitting head/tail for bionic and stripping
 * trailing punctuation is the concern of later milestones, not the tokenizer.
 */

// At least one Unicode letter or number anywhere in the token.
const WORDLIKE = /[\p{L}\p{N}]/u;

/**
 * Tokenize a run of text into Words.
 *
 * @param text        The raw text of a block.
 * @param startIndex  The global index of the first word produced, so ids stay
 *                    stable and unique across the whole Document (the pacer
 *                    relies on a single flat sequence). Defaults to 0.
 * @returns The Word[] for this text. Empty if the text has no tokens.
 */
export function tokenize(text: string, startIndex = 0): Word[] {
  const tokens = text.trim().split(/\s+/).filter((t) => t.length > 0);
  return tokens.map((token, i) => ({
    id: String(startIndex + i),
    text: token,
    isWordlike: WORDLIKE.test(token),
  }));
}

/**
 * Build the flattened Word[] view across all blocks — the single sequence the
 * pacer walks and seeks within. Block grouping is preserved separately for
 * layout; this is purely the reading-order spine.
 */
export function flattenWords(doc: Document): Word[] {
  return doc.blocks.flatMap((block) => block.words);
}

/**
 * Assign globally-sequential ids to every word across the given blocks, in
 * reading order. Parsers can tokenize each block independently and then call
 * this once to guarantee a single, gap-free flat index for the whole Document.
 */
export function reindexWords(blocks: Block[]): Block[] {
  let next = 0;
  return blocks.map((block) => ({
    ...block,
    words: block.words.map((word) => ({ ...word, id: String(next++) })),
  }));
}
