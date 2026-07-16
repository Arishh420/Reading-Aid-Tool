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
 *
 * One exception: a run of em/en dashes (– U+2013, — U+2014) attached to a
 * word on both sides (e.g. "going—but") is split so each side becomes its
 * own token, with the dash run staying attached to the LEFT piece
 * ("going—" / "but") — see `splitDashRuns` (issue #25). This is deliberately
 * narrower than "any dash": a run with nothing on one side (a leading/
 * trailing/bare dash) or flanked by digits on both sides (a numeric range
 * like "1914–1918") is left untouched.
 */

// At least one Unicode letter or number anywhere in the token.
const WORDLIKE = /[\p{L}\p{N}]/u;

// A run of one or more en/em dashes.
const DASH_RUN = /[–—]+/gu;
const DIGIT = /\p{N}/u;

/**
 * Split a single whitespace-delimited token at qualifying em/en-dash runs.
 * The dash run stays attached to the left piece. A run does not qualify (and
 * is left merged into the surrounding text) when either side is empty (a
 * leading/trailing/bare dash) or both flanking characters are digits (a
 * numeric range, e.g. "1914–1918"). Hyphen-minus ("-") is never split — that
 * would also misfire a clause-pause dwell on words like "well-known".
 */
function splitDashRuns(token: string): string[] {
  const pieces: string[] = [];
  let start = 0;
  let match: RegExpExecArray | null;
  DASH_RUN.lastIndex = 0;
  while ((match = DASH_RUN.exec(token))) {
    const runStart = match.index;
    const runEnd = runStart + match[0].length;
    const hasBefore = runStart > 0;
    const hasAfter = runEnd < token.length;
    if (!hasBefore || !hasAfter) continue;
    const before = token[runStart - 1];
    const after = token[runEnd];
    if (DIGIT.test(before) && DIGIT.test(after)) continue;
    pieces.push(token.slice(start, runEnd));
    start = runEnd;
  }
  pieces.push(token.slice(start));
  return pieces;
}

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
  const rawTokens = text.trim().split(/\s+/).filter((t) => t.length > 0);
  const words: Word[] = [];
  let id = startIndex;
  for (const token of rawTokens) {
    const pieces = splitDashRuns(token);
    pieces.forEach((piece, i) => {
      words.push({
        id: String(id++),
        text: piece,
        isWordlike: WORDLIKE.test(piece),
        spaceBefore: i === 0,
      });
    });
  }
  return words;
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
