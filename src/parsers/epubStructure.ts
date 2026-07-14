/**
 * EPUB structure parsing (§7.4) — the portable, DOM-free half of the EPUB
 * parser. An EPUB is a zip of XHTML in spine (reading) order; these helpers read
 * the container/OPF to find that order and turn each content document's body
 * into blocks.
 *
 * Parsing is done with targeted string scanning rather than DOMParser so it
 * stays dependency-free, unit-testable, and portable to React Native (where
 * DOMParser may be unavailable). EPUB XML/XHTML is well-formed enough that this
 * is reliable for v1; quality is allowed to vary.
 */

export interface RawBlock {
  type: 'heading' | 'paragraph';
  level?: number;
  text: string;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

/** Decode the HTML entities that appear in book text. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10FFFF
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * Strip tags + decode entities + collapse whitespace from an HTML fragment.
 * `<script>`/`<style>` bodies and HTML comment contents are removed whole,
 * before the generic bracket-stripping pass — otherwise their non-prose
 * contents (CSS, JS, comment text) survive as reading tokens (issue #74).
 */
export function stripTags(html: string): string {
  const withoutNonText = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  return decodeEntities(withoutNonText.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Read an attribute value (single or double quoted) from a start tag string. */
function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(
    `(?:^|[\\s"'])${name}\\s*=\\s*("([^"]*)"|'([^']*)')`,
    'i'
  ).exec(tag);
  return m ? m[2] ?? m[3] : undefined;
}

/** From META-INF/container.xml, the path to the OPF package document. */
export function parseContainerOpfPath(xml: string): string | undefined {
  const m = /<rootfile\b[^>]*>/i.exec(xml);
  const fullPath = m ? attr(m[0], 'full-path') : undefined;
  return fullPath ? safeDecodeHref(fullPath) : undefined;
}

/**
 * From the OPF, the ordered list of content-document hrefs (spine order),
 * resolved relative to the OPF's own directory.
 */
export function parseOpfSpine(opfXml: string, opfPath: string): string[] {
  // manifest: id -> href (+ media-type)
  const manifest = new Map<string, { href: string; type: string }>();
  for (const m of opfXml.matchAll(/<item\b[^>]*>/gi)) {
    const tag = m[0];
    const id = attr(tag, 'id');
    const href = attr(tag, 'href');
    if (id && href) manifest.set(id, { href, type: attr(tag, 'media-type') ?? '' });
  }

  const opfDir = opfPath.includes('/') ? opfPath.replace(/\/[^/]*$/, '') : '';
  const hrefs: string[] = [];
  for (const m of opfXml.matchAll(/<itemref\b[^>]*>/gi)) {
    const idref = attr(m[0], 'idref');
    if (!idref) continue;
    const item = manifest.get(idref);
    if (!item) {
      console.warn(`[epub] manifest item not found for idref: "${idref}" — chapter skipped`);
      continue;
    }
    const isContent =
      item.type.includes('xhtml') || /\.x?html?($|[?#])/i.test(item.href);
    if (isContent) hrefs.push(resolvePath(opfDir, safeDecodeHref(item.href)));
  }
  return hrefs;
}

/**
 * Decode a percent-encoded OPF href so zip lookups match the stored filenames.
 * Falls back to the original string if the sequence is malformed (e.g. a bare
 * "%" in a filename that was never encoded in the first place).
 */
export function safeDecodeHref(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

/** Resolve a relative href against a base directory (handles ./ and ../). */
export function resolvePath(baseDir: string, href: string): string {
  const clean = href.replace(/[?#].*$/, '');
  const parts = (baseDir ? baseDir.split('/') : []).concat(clean.split('/'));
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function pushBlock(blocks: RawBlock[], tag: string, rawInner: string): void {
  const text = stripTags(rawInner);
  if (!text) return;
  if (tag[0] === 'h') {
    blocks.push({ type: 'heading', level: Number(tag[1]), text });
  } else {
    blocks.push({ type: 'paragraph', text });
  }
}

/**
 * Fallback for valid-HTML/invalid-XHTML bodies whose block tags never close
 * (e.g. `<p>` without `</p>`), which the strict backreferenced pass can't match
 * at all — see issue #14. Splits on block-level *opening* tags and takes the
 * text up to the next same-level opening tag (or end of body) as that block's
 * content. Deterministic and simple by design — not a full HTML5 parser.
 */
function xhtmlToBlocksFallback(body: string): RawBlock[] {
  const blocks: RawBlock[] = [];
  const openRe = /<(h[1-6]|p|li|blockquote)\b[^>]*>/gi;
  const opens = [...body.matchAll(openRe)];
  for (let i = 0; i < opens.length; i++) {
    const m = opens[i];
    const tag = m[1].toLowerCase();
    const start = m.index! + m[0].length;
    const end = i + 1 < opens.length ? opens[i + 1].index! : body.length;
    pushBlock(blocks, tag, body.slice(start, end));
  }
  return blocks;
}

/**
 * Turn an XHTML content document's body into ordered blocks. `href` is used
 * only to name the chapter in the fallback warning (issue #14).
 */
export function xhtmlToBlocks(html: string, href?: string): RawBlock[] {
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  const body = bodyMatch ? bodyMatch[1] : html;

  const blocks: RawBlock[] = [];
  // Backreference to the same tag means an outer block consumes its nested
  // children (e.g. <li><p>…), so we don't emit a paragraph twice.
  const re = /<(h[1-6]|p|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const m of body.matchAll(re)) {
    pushBlock(blocks, m[1].toLowerCase(), m[2]);
  }

  // Strict pass found nothing but the body has content — likely unclosed block
  // tags. Recover what we can with an opening-tag split rather than silently
  // dropping the whole chapter's text (issue #14).
  if (blocks.length === 0 && body.trim()) {
    const recovered = xhtmlToBlocksFallback(body);
    if (recovered.length > 0) {
      console.warn(
        `[epub] chapter "${href ?? '?'}" used unclosed-tag fallback, recovered ${recovered.length} block(s)`
      );
      return recovered;
    }
  }

  return blocks;
}
