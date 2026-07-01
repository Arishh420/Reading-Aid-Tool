import JSZip from 'jszip';
import { reindexWords, tokenize } from '../model/tokenize';
import type { Block, Document } from '../model/types';
import {
  parseContainerOpfPath,
  parseOpfSpine,
  xhtmlToBlocks,
} from './epubStructure';

/**
 * EPUB parser (§7.4). An EPUB is a zip: META-INF/container.xml points at the OPF
 * package document, whose spine lists the content documents in reading order.
 * We unzip (JSZip), resolve the spine, and parse each XHTML body into blocks.
 *
 * Only JSZip is web/runtime-coupled here; the structure parsing
 * (epubStructure.ts) is pure and portable.
 */

const CONTAINER_PATH = 'META-INF/container.xml';

export async function parseEpub(data: ArrayBuffer, title?: string): Promise<Document> {
  const zip = await JSZip.loadAsync(data);

  const container = zip.file(CONTAINER_PATH);
  if (!container) {
    throw new Error('Not a valid EPUB — missing META-INF/container.xml.');
  }

  const opfPath = parseContainerOpfPath(await container.async('string'));
  if (!opfPath || !zip.file(opfPath)) {
    throw new Error('Not a valid EPUB — could not locate the package document.');
  }

  const opfXml = await zip.file(opfPath)!.async('string');
  const hrefs = parseOpfSpine(opfXml, opfPath);

  const rawBlocks: { type: 'heading' | 'paragraph'; level?: number; text: string }[] =
    [];
  for (const href of hrefs) {
    const entry = zip.file(href);
    if (!entry) continue;
    rawBlocks.push(...xhtmlToBlocks(await entry.async('string')));
  }

  if (rawBlocks.length === 0) {
    throw new Error('This EPUB has no readable text content.');
  }

  const blocks: Block[] = rawBlocks.map((raw, i) => ({
    id: `b${i}`,
    type: raw.type,
    level: raw.level,
    words: tokenize(raw.text),
  }));

  return { title, blocks: reindexWords(blocks) };
}
