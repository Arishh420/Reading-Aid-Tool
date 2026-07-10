/**
 * Headless checks for pdfText.ts's paragraph-break detection and the
 * oversized-paragraph safety net (issue #9, CRITICAL).
 *
 * esbuild-bundles the real src/parsers/pdfText.ts and exercises the actual
 * shipped `linesToParagraphs` / `splitOversizedParagraphs`, not a
 * hand-copied restatement.
 *
 * Covers:
 *  - #9 repro: a 2-page indented document with no vertical gaps between its
 *    4 paragraphs, which collapsed to 1 block before this fix, must produce
 *    4+ blocks.
 *  - Indent break alone (no preceding gap) must trigger a paragraph split —
 *    the core missed case.
 *  - A genuine continuation line sharing the page's body margin must NOT be
 *    flagged as indented (no false-positive split).
 *  - A page boundary with no indent and no gap must still force a break.
 *  - A middle page that contributes zero surviving lines (e.g. only a bare
 *    page number) must not introduce a phantom break or suppress the real
 *    break on the next content page — exercises the `sawContent` flag.
 *  - splitOversizedParagraphs: a 1000+-word paragraph is chunked at the cap,
 *    no chunk exceeds it, and rejoining every chunk reproduces the original
 *    text exactly (word order/content preserved).
 */

import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const result = await build({
  entryPoints: [path.join(__dirname, 'pdfText.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  target: 'node18',
  platform: 'node',
});

const tmpPath = path.join(__dirname, `.headless-pdftext-${process.pid}.mjs`);
const { writeFile, unlink } = await import('node:fs/promises');
await writeFile(tmpPath, result.outputFiles[0].text);

let linesToParagraphs, splitOversizedParagraphs;
try {
  ({ linesToParagraphs, splitOversizedParagraphs } = await import(`${tmpPath}?t=${Date.now()}`));
} finally {
  await unlink(tmpPath);
}

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

/** Build a PdfLine. */
const L = (text, x, gapBefore = false) => ({ text, x, gapBefore });

console.log('\npdfText.ts — headless checks (issue #9)\n');

// ─── #9 repro: 2-page indented doc, no vertical gaps ───────────────────────

{
  // Body margin x=72 on every page; each paragraph's first line is indented
  // to x=90 with NO gapBefore anywhere — the exact case that collapsed to 1
  // block before this fix (indent-only breaks, tight leading).
  const pages = [
    [
      L('Para one line one', 90),
      L('para one line two', 72),
      L('Para two line one', 90),
      L('para two line two', 72),
    ],
    [
      L('Para three line one', 90),
      L('para three line two', 72),
      L('Para four line one', 90),
      L('para four line two', 72),
    ],
  ];
  const paras = linesToParagraphs(pages);
  check('#9 repro: 2-page indented doc produces 4+ paragraphs (was 1)', paras.length >= 4, true);
  check('#9 repro: paragraph content preserved', paras, [
    'Para one line one para one line two',
    'Para two line one para two line two',
    'Para three line one para three line two',
    'Para four line one para four line two',
  ]);
}

// ─── Indent break with no preceding gap (core missed case) ─────────────────

{
  const pages = [
    [
      L('First paragraph line one', 72),
      L('first paragraph line two', 72),
      L('Second paragraph indented start', 90), // no gapBefore, only indent
      L('second paragraph continuation', 72),
    ],
  ];
  const paras = linesToParagraphs(pages);
  check('indent-only break (no gap) splits into 2 paragraphs', paras, [
    'First paragraph line one first paragraph line two',
    'Second paragraph indented start second paragraph continuation',
  ]);
}

// ─── Continuation line at body margin: no false-positive split ─────────────

{
  const pages = [
    [
      L('Indented opening line', 90),
      L('continuation at body margin', 72),
      L('another continuation line', 72),
      L('final continuation line', 72),
    ],
  ];
  const paras = linesToParagraphs(pages);
  check('body-margin continuation lines do not false-positive split', paras, [
    'Indented opening line continuation at body margin another continuation line final continuation line',
  ]);
}

// ─── Page boundary with no indent and no gap still forces a break ──────────

{
  const pages = [
    [L('Page one first line', 72), L('page one second line', 72)],
    [L('Page two first line', 72), L('page two second line', 72)], // same x, no gap
  ];
  const paras = linesToParagraphs(pages);
  check('page boundary forces a break even with no indent/gap', paras, [
    'Page one first line page one second line',
    'Page two first line page two second line',
  ]);
}

// ─── Middle page with zero surviving lines: no phantom break, real break preserved ──

{
  // Page 2 contributes nothing (a bare page number, dropped by
  // isBarePageNumber before it ever reaches the annotation step) between two
  // real content pages. Must produce exactly 2 paragraphs — one per content
  // page — with no empty/phantom paragraph for the dropped page, and the
  // page-boundary break must still fire correctly on page 3 (sawContent
  // stays true across the empty page, it isn't reset by a raw page index).
  const pages = [
    [L('Page one first line', 72), L('page one second line', 72)],
    [L('42', 72)], // bare page number — dropped entirely, zero survivors
    [L('Page three first line', 72), L('page three second line', 72)],
  ];
  const paras = linesToParagraphs(pages);
  check('empty middle page: exactly 2 paragraphs, no phantom break', paras, [
    'Page one first line page one second line',
    'Page three first line page three second line',
  ]);
}

// ─── Regression: genuine vertical-gap break still works ────────────────────

{
  const pages = [
    [L('First paragraph text', 72), L('Second paragraph text', 72, true)],
  ];
  const paras = linesToParagraphs(pages);
  check('regression: gapBefore still breaks paragraphs', paras, [
    'First paragraph text',
    'Second paragraph text',
  ]);
}

// ─── splitOversizedParagraphs ───────────────────────────────────────────────

{
  const words = Array.from({ length: 1000 }, (_, i) => `word${i}`);
  const original = words.join(' ');
  const chunks = splitOversizedParagraphs([original], 300);

  check('splitOversizedParagraphs: chunk count for 1000 words at cap 300', chunks.length, 4);
  check(
    'splitOversizedParagraphs: no chunk exceeds the cap',
    chunks.every((c) => c.split(' ').length <= 300),
    true,
  );
  check(
    'splitOversizedParagraphs: rejoining all chunks reproduces the original exactly',
    chunks.join(' '),
    original,
  );
}

{
  // Under the cap: passed through unchanged.
  const short = 'a short paragraph well under the cap';
  check('splitOversizedParagraphs: paragraph under cap is unchanged', splitOversizedParagraphs([short], 300), [
    short,
  ]);
}

{
  // Multiple paragraphs: only the oversized one is split.
  const short = 'short one';
  const long = Array.from({ length: 650 }, (_, i) => `w${i}`).join(' ');
  const chunks = splitOversizedParagraphs([short, long], 300);
  check('splitOversizedParagraphs: mixed input splits only the oversized paragraph', chunks.length, 1 + 3);
  check('splitOversizedParagraphs: short paragraph passed through first', chunks[0], short);
  check(
    'splitOversizedParagraphs: mixed input rejoins the long paragraph exactly',
    chunks.slice(1).join(' '),
    long,
  );
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
