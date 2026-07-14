/**
 * Headless checks for three independent silent-corruption bugs found by an
 * adversarial audit (issues #72 markdown, #73 pdf, #74 epub) — grouped
 * together because they share one theme: each parser was silently dropping
 * or injecting text into the reading spine, the one failure mode this tool
 * cannot tolerate (position tracking, resume, and dwell all trust "the
 * words are all there").
 *
 * esbuild-bundles the real src/parsers/markdown.ts, src/parsers/pdfText.ts,
 * src/parsers/epubStructure.ts, and src/model/tokenize.ts, and exercises the
 * actual shipped functions — not hand-copied restatements. For pdf/epub,
 * `tokenize`/`reindexWords` are wired the same way the real `pdf.ts`/
 * `epub.ts` wrappers do (see those files), so the Word.id contiguity checks
 * below exercise the true end-to-end pipeline, not just the pure text layer.
 *
 * Covers:
 *  - #72: a hard-wrapped numeric line inside/after a list is no longer
 *    misread as an ordered-list marker and silently deleted.
 *  - #73: isBarePageNumber's roman-numeral branch only fires at a genuine
 *    page edge; ordinary words made of ivxlcdm letters ("did", "Civil")
 *    survive mid-page. Genuine roman folios at page edges are still dropped.
 *  - #74: stripTags removes <script>/<style> bodies and HTML comment
 *    contents wholesale, instead of leaking them as reading text.
 *  - Word.id === flat word index (CLAUDE.md invariant) holds after each fix,
 *    exercised through the same tokenize+reindexWords wiring the real
 *    parsers use.
 */

import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function bundleAndImport(entry, tmpName) {
  const result = await build({
    entryPoints: [path.join(__dirname, entry)],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'node18',
    platform: 'node',
  });
  const tmpPath = path.join(__dirname, `.headless-${tmpName}-${process.pid}.mjs`);
  const { writeFile, unlink } = await import('node:fs/promises');
  await writeFile(tmpPath, result.outputFiles[0].text);
  try {
    return await import(`${tmpPath}?t=${Date.now()}`);
  } finally {
    await unlink(tmpPath);
  }
}

const { parseMarkdown } = await bundleAndImport('markdown.ts', 'spine-markdown');
const { linesToParagraphs, splitOversizedParagraphs, isBarePageNumber } =
  await bundleAndImport('pdfText.ts', 'spine-pdftext');
const { xhtmlToBlocks } = await bundleAndImport('epubStructure.ts', 'spine-epubstructure');
const { tokenize, reindexWords } = await bundleAndImport('../model/tokenize.ts', 'spine-tokenize');

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  try {
    assert.deepEqual(actual, expected);
    console.log(`  PASS  ${label}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${label}: ${err.message}`);
    failed++;
  }
}

const blockTexts = (doc) => doc.blocks.map((b) => b.words.map((w) => w.text).join(' '));

/** Word.id === flat index (CLAUDE.md §4 / D13): ids must be "0".."N-1", in order. */
function checkContiguousIds(label, doc) {
  const flat = doc.blocks.flatMap((b) => b.words);
  const ids = flat.map((w) => w.id);
  const expected = flat.map((_, i) => String(i));
  check(`${label}: Word.id contiguous 0..N-1`, ids, expected);
}

/** Mirrors pdf.ts's exact tokenize+reindexWords wiring (pdfText.ts itself only produces strings). */
function buildPdfDoc(pages) {
  const paragraphs = splitOversizedParagraphs(linesToParagraphs(pages));
  const blocks = paragraphs.map((text, i) => ({ id: `b${i}`, type: 'paragraph', words: tokenize(text) }));
  return { blocks: reindexWords(blocks) };
}

/** Mirrors epub.ts's exact tokenize+reindexWords wiring (epubStructure.ts itself only produces RawBlock[]). */
function buildEpubDoc(rawBlocks) {
  const blocks = rawBlocks.map((raw, i) => ({ id: `b${i}`, type: raw.type, level: raw.level, words: tokenize(raw.text) }));
  return { blocks: reindexWords(blocks) };
}

const L = (text, x, gapBefore = false) => ({ text, x, gapBefore });

console.log('\nSpine integrity — headless checks (issues #72, #73, #74)\n');

// ─── #72: markdown list-continuation deletes hard-wrapped numeric lines ────

{
  const doc = parseMarkdown('- The war ended in\n1945. Everyone celebrated.');
  check(
    '#72 repro: hard-wrapped "1945." after a bullet item is not deleted',
    blockTexts(doc),
    ['The war ended in', '1945. Everyone celebrated.']
  );
  checkContiguousIds('#72 repro', doc);
}

{
  // A wrapped number that breaks an *ordered* list's own sequential numbering
  // (not just a bullet list) must also survive, not be silently consumed as
  // "the next item".
  const doc = parseMarkdown('1. First\n2. Second\n1999. A year appears here.');
  check(
    '#72: a non-sequential ordered marker ends the list instead of being consumed',
    blockTexts(doc),
    ['First', 'Second', '1999. A year appears here.']
  );
  checkContiguousIds('#72 non-sequential ordered', doc);
}

{
  // Regression: genuine sequential continuation (list starting away from 1,
  // per the existing #41 "starts at 5" case) still works inside the
  // continuation loop itself, not just at the top-level dispatch.
  const doc = parseMarkdown('5. Fifth\n6. Sixth\n7. Seventh');
  check(
    '#72 regression: sequential ordered continuation (non-1 start) still consumed as a list',
    blockTexts(doc),
    ['Fifth', 'Sixth', 'Seventh']
  );
  checkContiguousIds('#72 sequential ordered', doc);
}

{
  // Regression: a bullet list is completely unaffected (unrestricted, as before).
  const doc = parseMarkdown('- alpha\n- beta\n- gamma');
  check('#72 regression: bullet list unaffected', blockTexts(doc), ['alpha', 'beta', 'gamma']);
}

// ─── #73: PDF isBarePageNumber drops real one-word lines anywhere on a page ─

{
  // Direct contract check: roman-numeral branch gated by isEdge; other
  // branches (digit / dashed / "Page N") stay ungated, as scoped.
  check('#73: "xiv" at a page edge is dropped', isBarePageNumber('xiv', true), true);
  check('#73 repro: "xiv" mid-page (not edge) survives', isBarePageNumber('xiv', false), false);
  check('#73: isBarePageNumber defaults isEdge to false (safe default)', isBarePageNumber('xiv'), false);
  check('#73 repro: "did" mid-page survives regardless of isEdge', isBarePageNumber('did', false), false);
  check('#73: plain digit branch unaffected by isEdge', isBarePageNumber('12', false), true);
  check('#73: dashed-folio branch unaffected by isEdge', isBarePageNumber('- 12 -', false), true);
  check('#73: "Page N" branch unaffected by isEdge', isBarePageNumber('Page 12', false), true);
}

{
  // Full-pipeline repro: a mid-page line "did" between two ordinary
  // sentences must survive linesToParagraphs (was silently dropped).
  const pages = [[L('The dog', 72), L('did', 72), L('run fast', 72)]];
  const doc = buildPdfDoc(pages);
  check('#73 repro: mid-page "did" survives linesToParagraphs', blockTexts(doc), ['The dog did run fast']);
  checkContiguousIds('#73 "did" repro', doc);
}

{
  // Another real word made purely of roman-numeral letters (from the issue's
  // own examples), also mid-page.
  const pages = [[L('The', 72), L('Civil', 72), L('War began', 72)]];
  const doc = buildPdfDoc(pages);
  check('#73: mid-page "Civil" survives', blockTexts(doc), ['The Civil War began']);
}

{
  // A genuine roman folio at the page START edge is still correctly dropped.
  const pages = [[L('xiv', 72), L('Real content line one', 72)]];
  const doc = buildPdfDoc(pages);
  check('#73 regression: genuine roman folio at page start still dropped', blockTexts(doc), [
    'Real content line one',
  ]);
}

{
  // A genuine roman folio at the page END edge is still correctly dropped.
  const pages = [[L('Real content line one', 72), L('xiv', 72)]];
  const doc = buildPdfDoc(pages);
  check('#73 regression: genuine roman folio at page end still dropped', blockTexts(doc), [
    'Real content line one',
  ]);
}

// ─── #74: EPUB stripTags leaks style/script/comment contents ───────────────

{
  const { stripTags } = await bundleAndImport('epubStructure.ts', 'spine-epubstructure-striptags');
  check(
    '#74 repro: <style> body is stripped, not leaked as text',
    stripTags('Hello <style>.x{color:red}</style> world'),
    'Hello world'
  );
  check(
    '#74 repro: HTML comment (including an internal ">") is stripped whole',
    stripTags('before <!-- note: a > b --> after'),
    'before after'
  );
  check(
    '#74: <script> body is stripped, not leaked as text',
    stripTags('Hello <script>alert(1)</script> world'),
    'Hello world'
  );
  check(
    '#74 regression: ordinary tags + entities still work',
    stripTags('<em>A</em> &amp; <strong>B</strong>'),
    'A & B'
  );
}

{
  // Full-pipeline repro via xhtmlToBlocks, matching the issue's exact strings.
  const doc1 = xhtmlToBlocks('<body><p>Hello <style>.x{color:red}</style> world</p></body>');
  check('#74 repro (xhtmlToBlocks): style leak removed from paragraph', doc1, [
    { type: 'paragraph', text: 'Hello world' },
  ]);

  const doc2 = xhtmlToBlocks('<body><p>before <!-- note: a > b --> after</p></body>');
  check('#74 repro (xhtmlToBlocks): comment fragment removed from paragraph', doc2, [
    { type: 'paragraph', text: 'before after' },
  ]);

  const doc3 = buildEpubDoc(doc1);
  checkContiguousIds('#74 style repro', doc3);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
