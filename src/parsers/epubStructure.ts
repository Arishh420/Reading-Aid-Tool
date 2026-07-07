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

/** Strip tags + decode entities + collapse whitespace from an HTML fragment. */
export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Read an attribute value (single or double quoted) from a start tag string. */
function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? m[2] ?? m[3] : undefined;
}

/** From META-INF/container.xml, the path to the OPF package document. */
export function parseContainerOpfPath(xml: string): string | undefined {
  const m = /<rootfile\b[^>]*>/i.exec(xml);
  return m ? attr(m[0], 'full-path') : undefined;
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
    if (!item) continue;
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

/** Turn an XHTML content document's body into ordered blocks. */
export function xhtmlToBlocks(html: string): RawBlock[] {
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  const body = bodyMatch ? bodyMatch[1] : html;

  const blocks: RawBlock[] = [];
  // Backreference to the same tag means an outer block consumes its nested
  // children (e.g. <li><p>…), so we don't emit a paragraph twice.
  const re = /<(h[1-6]|p|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const m of body.matchAll(re)) {
    const tag = m[1].toLowerCase();
    const text = stripTags(m[2]);
    if (!text) continue;
    if (tag[0] === 'h') {
      blocks.push({ type: 'heading', level: Number(tag[1]), text });
    } else {
      blocks.push({ type: 'paragraph', text });
    }
  }
  return blocks;
}
