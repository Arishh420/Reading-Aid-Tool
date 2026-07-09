import { reindexWords, tokenize } from '../model/tokenize';
import type { Block, Document } from '../model/types';

/**
 * Markdown parser (§7.4).
 *
 * We only need block structure + inline *text* — not HTML rendering. So this is
 * a small, dependency-free block tokenizer that recognizes the common Markdown
 * shapes and normalizes everything into the v1 model's two block types
 * (heading | paragraph). Inline markup (bold/italic/links/code) is stripped to
 * plain text: bionic owns all styling, so carrying source emphasis would only
 * fight it.
 *
 * Deliberately minimal — parsing quality is allowed to vary in v1 (the format
 * dropdown exists so the user can pick their cleanest source).
 */

interface RawBlock {
  type: 'heading' | 'paragraph';
  level?: number;
  text: string;
}

const ATX_HEADING = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const FENCE = /^\s*(```|~~~)/;
const BLOCKQUOTE = /^\s*>\s?/;
const BULLET_ITEM = /^\s*[-*+]\s+(.*)$/;
const ORDERED_ITEM = /^\s*(\d+)[.)]\s+(.*)$/;
const HR = /^\s*([-*_])(?:\s*\1){2,}\s*$/;

/** Matches a bullet OR ordered list-item line; returns its text with the marker stripped. */
function matchListItem(line: string): string | null {
  const bullet = line.match(BULLET_ITEM);
  if (bullet) return bullet[1];
  const ordered = line.match(ORDERED_ITEM);
  if (ordered) return ordered[2];
  return null;
}

function isListItem(line: string): boolean {
  return matchListItem(line) !== null;
}

/**
 * CommonMark: an ordered-list marker only interrupts an in-progress paragraph
 * when its start number is 1 (bullets can always interrupt). Without this, a
 * hard-wrapped sentence-initial number (e.g. "1945.") reads as a new list and
 * its text is discarded as a marker. Continuing an *already-started* list
 * (the loop at the LIST_ITEM dispatch site below) is unaffected — any number
 * there is a continuation, not an interruption.
 */
function interruptsParagraph(line: string): boolean {
  if (BULLET_ITEM.test(line)) return true;
  const ordered = line.match(ORDERED_ITEM);
  return ordered !== null && Number(ordered[1]) === 1;
}

// Underscore-based emphasis (both `_.._` and `__..__`) forbids intraword use
// (CommonMark): a word character immediately outside either delimiter
// disqualifies it, so "snake_case_name" is left untouched rather than
// mangled into "snakecasename".
const BOLD_UNDERSCORE = /(?<!\w)__(.+?)__(?!\w)/g;
const ITALIC_UNDERSCORE = /(?<!\w)_(.+?)_(?!\w)/g;

// Asterisk-based emphasis forbids whitespace immediately inside the
// delimiters (CommonMark's flanking-delimiter-run rule): the character right
// after the opening delimiter and right before the closing one must be
// non-whitespace, so "3 * 4 * 5" (space-padded on both sides) is left
// untouched rather than stripped to "3 4 5".
const BOLD_ASTERISK = /\*\*(?!\s)(.+?)(?<!\s)\*\*/g;
const ITALIC_ASTERISK = /\*(?!\s)(.+?)(?<!\s)\*/g;

const ESCAPE = /\\([\\`*_{}[\]()#+\-.!>~])/g;

// A NUL-delimited index can't collide with legitimate prose (unlike, say, a
// bare space-digit-space token, which issue #42b's own "3 * 4 * 5" case would
// have falsely matched — that text contains standalone digits surrounded by
// spaces). U+0000 cannot occur in real Markdown source.
const NUL = String.fromCharCode(0);
const PLACEHOLDER = new RegExp(`${NUL}(\\d+)${NUL}`, 'g');

/** Strip inline Markdown markup, leaving plain text. */
function stripInline(s: string): string {
  // Resolve escapes FIRST, into placeholders the emphasis/link/code regexes
  // below can't mistake for real markup — otherwise "\*not emphasis\*" is
  // unescaped last, after the italic regex has already consumed the literal
  // "\*" pair as if it were a real delimiter (issue #42c).
  const escaped: string[] = [];
  const withPlaceholders = s.replace(ESCAPE, (_match, ch: string) => {
    escaped.push(ch);
    return `${NUL}${escaped.length - 1}${NUL}`;
  });

  const stripped = withPlaceholders
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images -> alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> link text
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(BOLD_UNDERSCORE, '$1') // bold (__x__)
    .replace(BOLD_ASTERISK, '$1') // bold (**x**)
    .replace(ITALIC_UNDERSCORE, '$1') // italic (_x_)
    .replace(ITALIC_ASTERISK, '$1') // italic (*x*)
    .replace(/~~(.*?)~~/g, '$1') // strikethrough
    .trim();

  return stripped.replace(PLACEHOLDER, (_match, idx: string) => escaped[Number(idx)]);
}

/** Split raw Markdown source into ordered raw blocks. */
function blockify(source: string): RawBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: RawBlock[] = [];
  let i = 0;

  const flushParagraph = (parts: string[]) => {
    const text = stripInline(parts.join(' '));
    if (text) blocks.push({ type: 'paragraph', text });
  };

  while (i < lines.length) {
    const line = lines[i];

    // Blank line — skip.
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Fenced code block — keep inner lines as a paragraph, never merge fences.
    if (FENCE.test(line)) {
      const fence = line.trim().slice(0, 3);
      i++;
      const code: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith(fence)) {
        code.push(lines[i]);
        i++;
      }
      i++; // consume closing fence (if present)
      const text = code.join(' ').trim();
      if (text) blocks.push({ type: 'paragraph', text });
      continue;
    }

    // Horizontal rule — no textual content, drop it.
    if (HR.test(line)) {
      i++;
      continue;
    }

    // ATX heading.
    const heading = line.match(ATX_HEADING);
    if (heading) {
      const text = stripInline(heading[2]);
      if (text) {
        blocks.push({ type: 'heading', level: heading[1].length, text });
      }
      i++;
      continue;
    }

    // List — each item becomes its own paragraph (v1 has no list block type).
    if (isListItem(line)) {
      while (i < lines.length) {
        const itemText = matchListItem(lines[i]);
        if (itemText === null) break;
        flushParagraph([itemText]);
        i++;
      }
      continue;
    }

    // Blockquote — strip markers, merge contiguous quote lines into a paragraph.
    if (BLOCKQUOTE.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && BLOCKQUOTE.test(lines[i])) {
        quote.push(lines[i].replace(BLOCKQUOTE, ''));
        i++;
      }
      flushParagraph(quote);
      continue;
    }

    // Paragraph — merge consecutive plain lines until a blank line or a line
    // that starts a different block kind.
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (
        l.trim() === '' ||
        FENCE.test(l) ||
        HR.test(l) ||
        ATX_HEADING.test(l) ||
        interruptsParagraph(l) ||
        BLOCKQUOTE.test(l)
      ) {
        break;
      }
      para.push(l);
      i++;
    }
    flushParagraph(para);
  }

  return blocks;
}

/**
 * Parse a Markdown string into the internal Document model, with globally
 * sequential word ids ready for the pacer.
 */
export function parseMarkdown(source: string, title?: string): Document {
  const blocks: Block[] = blockify(source).map((raw, index) => ({
    id: `b${index}`,
    type: raw.type,
    level: raw.level,
    words: tokenize(raw.text),
  }));

  return { title, blocks: reindexWords(blocks) };
}
