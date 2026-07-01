/**
 * Bionic reading — head/tail split logic (§7.1).
 *
 * For a word-like token, bold the first `n` letters where
 *   n = max(1, round(L * ratio))   and L = number of *letters* in the token.
 *
 * Punctuation attached to a word does not count toward L and is never bolded.
 * Because a token can carry *leading* punctuation (e.g. `"Hello`, `(e.g.`), the
 * split has three slots: an unbolded `lead`, the bold `head`, and the `tail`.
 * Render as `{lead}<b>{head}</b>{tail}`.
 */

export type BionicIntensity = 'low' | 'medium' | 'high';

/** Intensity → ratio (§7.1). */
export const BIONIC_RATIO: Record<BionicIntensity, number> = {
  low: 0.3,
  medium: 0.5,
  high: 0.6,
};

export interface BionicSplit {
  /** Leading non-letter characters — never bolded. */
  lead: string;
  /** The bolded portion (first n letters). Empty when nothing should bold. */
  head: string;
  /** The remainder — never bolded. */
  tail: string;
}

const LETTER = /\p{L}/u;

/**
 * Split a token into lead/head/tail for bionic rendering.
 *
 * `ratio` is the intensity (use BIONIC_RATIO). Tokens with no letters (e.g. a
 * bare number or pure punctuation) get an empty head — nothing to anchor on.
 */
export function splitBionic(text: string, ratio: number): BionicSplit {
  const chars = [...text];
  const letterCount = chars.reduce((acc, ch) => acc + (LETTER.test(ch) ? 1 : 0), 0);

  if (letterCount === 0) {
    return { lead: '', head: '', tail: text };
  }

  const n = Math.max(1, Math.round(letterCount * ratio));

  // Skip leading non-letters into `lead` so they're never bolded.
  let start = 0;
  while (start < chars.length && !LETTER.test(chars[start])) start++;

  // Extend `head` until it covers n letters.
  let end = start;
  let counted = 0;
  while (end < chars.length && counted < n) {
    if (LETTER.test(chars[end])) counted++;
    end++;
  }

  return {
    lead: chars.slice(0, start).join(''),
    head: chars.slice(start, end).join(''),
    tail: chars.slice(end).join(''),
  };
}
