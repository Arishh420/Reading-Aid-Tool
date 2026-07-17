/**
 * The single internal representation that every input format normalizes into.
 *
 * The Reader, Bionic renderer, and Pacer only ever see this model — they never
 * know or care whether the source was PDF, Markdown, or EPUB (see §6 of the
 * project spec). Keep this minimal and format-agnostic.
 */

/** A single token. The pacer and bionic renderer share this exact list. */
export interface Word {
  /**
   * Stable, globally-unique index across the whole Document, as a string.
   * Used for seeking/pacing — the pacer's `currentWordIndex` indexes into the
   * flattened Word[] and matches the numeric value of this id.
   */
  id: string;
  /** Raw token including any attached (e.g. trailing) punctuation. */
  text: string;
  /**
   * False for pure punctuation/symbol tokens (e.g. "—", "...").
   * The pacer skips these when advancing; bionic never bolds them.
   */
  isWordlike: boolean;
  /**
   * False when this token must render flush against the previous one with no
   * space (e.g. the right-hand piece of a split `word—word`). Renderers that
   * re-insert inter-token whitespace must honor this.
   */
  spaceBefore: boolean;
}

export type BlockType = 'heading' | 'paragraph';

/** A layout-level grouping of words. Kept minimal for v1. */
export interface Block {
  id: string;
  type: BlockType;
  /** Heading depth (1–6). Only meaningful when type === 'heading'. */
  level?: number;
  /** Pre-tokenized words for this block. */
  words: Word[];
}

/** A fully-parsed document, ready for the Reader/Bionic/Pacer. */
export interface Document {
  title?: string;
  blocks: Block[];
}
