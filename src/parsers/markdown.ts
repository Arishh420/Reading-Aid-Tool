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
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
const HR = /^\s*([-*_])(?:\s*\1){2,}\s*$/;

/** Strip inline Markdown markup, leaving plain text. */
function stripInline(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images -> alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> link text
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // bold
    .replace(/(\*|_)(.*?)\1/g, '$2') // italic
    .replace(/~~(.*?)~~/g, '$2') // strikethrough
    .replace(/\\([\\`*_{}[\]()#+\-.!>~])/g, '$1') // escaped punctuation
    .trim();
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
    if (LIST_ITEM.test(line)) {
      while (i < lines.length) {
        const item = lines[i].match(LIST_ITEM);
        if (!item) break;
        flushParagraph([item[1]]);
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
        LIST_ITEM.test(l) ||
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
