import type { Document } from './types';

/**
 * Per-word delimiter-span state for RSVP (issue #84).
 *
 * RSVP flashes one word at a time, so a quoted / parenthetical span is only
 * marked on the token that physically carries the opening or closing
 * character (`"the`, `thing"`). Every word in between flashes bare and the
 * reader loses track of whether they are still inside the quotation. This
 * module walks the flat word stream and computes, for each word, the
 * delimiters to render mirrored around it — so the whole span reads
 * `"the"` `"whole"` `"thing"`, and `("whole")` when nested.
 *
 * The state is a value computed OUTSIDE `splitOrp`: `splitOrp` derives the
 * ORP anchor index from the length of the string it receives, so a
 * delimiter-padded token would select a different anchor letter and break the
 * fixed-x monospace-grid guarantee (D29/F3). The renderer feeds the bare
 * `word.text` to `splitOrp` and writes the decoration around the result.
 *
 * ── How doubling is avoided (the key idea) ──────────────────────────────
 * The token's own literal delimiters still render through `splitOrp`
 * unchanged; the decoration only fills the *missing* side, computed from two
 * snapshots of the delimiter stack:
 *
 *   prefix = openers of the stack as it was *before* the token (outer→inner)
 *   suffix = closers of the stack as it is  *after*  the token (inner→outer)
 *
 * | span…                    | in stackBefore? | in stackAfter? | render      |
 * |--------------------------|-----------------|----------------|-------------|
 * | opens in token (`"the`)  | no              | yes            | `"the"`     |
 * | closes in token (`thing"`)| yes            | no             | `"thing"`   |
 * | crosses token (`whole`)  | yes             | yes            | `"whole"`   |
 * | fully inside (`(aside)`) | no              | no             | `(aside)`   |
 *
 * The fully-inside row is why we snapshot before/after rather than decorate
 * unconditionally: `(aside)` must not become `((aside))`.
 *
 * ── Design decisions (see DECISIONS.md) ─────────────────────────────────
 * - Nesting: show ALL open delimiters, no depth cap (D110).
 * - Single quotes (U+0027 ' , U+2018 ' , U+2019 ') are NEVER delimiters —
 *   they are apostrophes inside contractions/possessives too often to track
 *   safely (D111).
 * - The stack RESETS at every block boundary — an unclosed span decorates to
 *   the end of its block only, never leaking into the next paragraph (D112).
 * - Returned as a parallel array; nothing is stored on `Word`, so the
 *   `Word.id === flat index` invariant and `reindexWords` are untouched (D113).
 *
 * Pure and portable: imports only the `Document` type. No DOM, no React, no
 * browser globals — ships with `pacer/orp.ts` and the model layer to the
 * Android `core/` seed.
 */

/** Delimiter chars to render around a single word (already mirrored). */
export interface DelimiterDecoration {
  /** Openers of the spans open when the word begins, outermost first. */
  prefix: string;
  /** Closers of the spans open when the word ends, innermost first (mirrored). */
  suffix: string;
}

const STRAIGHT_DQUOTE = '"'; // " — same glyph opens and closes; parity-tracked.

/** Distinct-glyph opener → closer pairs. */
const OPEN_TO_CLOSE: Record<string, string> = {
  '(': ')',
  '[': ']',
  '“': '”', // “ ”  curly double quotes
};

/** Reverse map for popping on a closer. */
const CLOSE_TO_OPEN: Record<string, string> = {
  ')': '(',
  ']': '[',
  '”': '“',
};

/** The closer glyph for an opener currently on the stack. */
function closerFor(opener: string): string {
  return opener === STRAIGHT_DQUOTE ? STRAIGHT_DQUOTE : OPEN_TO_CLOSE[opener];
}

/**
 * Update `stack` (an array of opener chars, bottom = outermost) for one
 * character. Openers push; a closer pops only if it matches the current top
 * (a mismatched closer in malformed text is ignored, not force-popped); the
 * straight double quote toggles by parity. Single quotes and every other
 * character are ignored entirely.
 */
function step(stack: string[], ch: string): void {
  if (ch === STRAIGHT_DQUOTE) {
    if (stack[stack.length - 1] === STRAIGHT_DQUOTE) stack.pop();
    else stack.push(STRAIGHT_DQUOTE);
    return;
  }
  if (Object.prototype.hasOwnProperty.call(OPEN_TO_CLOSE, ch)) {
    stack.push(ch);
    return;
  }
  if (Object.prototype.hasOwnProperty.call(CLOSE_TO_OPEN, ch)) {
    if (stack[stack.length - 1] === CLOSE_TO_OPEN[ch]) stack.pop();
    return;
  }
}

/**
 * Compute the delimiter decoration for every word in `doc`, in the same flat
 * order as `flattenWords(doc)` (`blocks.flatMap(b => b.words)`) — so the
 * returned array is index-aligned with the pacer's `currentWordIndex`
 * (`Word.id === flat index`, D13). The stack resets per block, so an unclosed
 * span never runs past its block (D112).
 */
export function computeDelimiterSpans(doc: Document): DelimiterDecoration[] {
  const out: DelimiterDecoration[] = [];
  for (const block of doc.blocks) {
    const stack: string[] = [];
    for (const word of block.words) {
      // prefix: openers open BEFORE this token, outermost first.
      const prefix = stack.join('');
      // advance the stack through the token's characters.
      for (const ch of word.text) step(stack, ch);
      // suffix: closers of the spans still open AFTER this token, innermost
      // first — the mirror image of the surviving stack.
      const suffix = stack
        .slice()
        .reverse()
        .map(closerFor)
        .join('');
      out.push({ prefix, suffix });
    }
  }
  return out;
}
