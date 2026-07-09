/**
 * Headless checks for the Markdown parser (issues #41, #42).
 *
 * esbuild-bundles the real src/parsers/markdown.ts (which itself imports
 * model/tokenize.ts and model/types.ts) and exercises the actual shipped
 * `parseMarkdown`, not a hand-copied restatement of its logic.
 *
 * Covers:
 *  - #41: a hard-wrapped sentence-initial number (e.g. "1945.") must not be
 *    misread as an ordered-list marker and must not split the paragraph.
 *  - #41 regression check: a genuine ordered/bullet list still parses into
 *    one paragraph block per item, with the marker stripped.
 */

import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const result = await build({
  entryPoints: [path.join(__dirname, 'markdown.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  target: 'node18',
  platform: 'node',
});

const code = result.outputFiles[0].text;
const tmpPath = path.join(__dirname, `.headless-markdown-${process.pid}.mjs`);
const { writeFile, unlink } = await import('node:fs/promises');
await writeFile(tmpPath, code);

let parseMarkdown;
try {
  ({ parseMarkdown } = await import(`${tmpPath}?t=${Date.now()}`));
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

/** Flatten a parsed Document's blocks into an array of block texts (words rejoined with spaces). */
function blockTexts(doc) {
  return doc.blocks.map((b) => b.words.map((w) => w.text).join(' '));
}

console.log('\nMarkdown parser — headless checks\n');

// ─── Issue #41: hard-wrapped sentence-initial numbers ─────────────────────

check(
  '#41 repro: sentence-initial "1945." is preserved, paragraph not split',
  blockTexts(parseMarkdown('The war ended in\n1945. Everyone celebrated in the streets.')),
  ['The war ended in 1945. Everyone celebrated in the streets.']
);

check(
  '#41: a paragraph-initial number other than 1 does not fuse into the previous paragraph',
  blockTexts(parseMarkdown('Some text\n1945. Another sentence.')),
  ['Some text 1945. Another sentence.']
);

check(
  '#41 regression: genuine ordered list (starting at 1) still parses into separate items',
  blockTexts(parseMarkdown('1. First item\n2. Second item\n3. Third item')),
  ['First item', 'Second item', 'Third item']
);

check(
  '#41 regression: genuine bullet list still parses into separate items',
  blockTexts(parseMarkdown('- alpha\n- beta\n- gamma')),
  ['alpha', 'beta', 'gamma']
);

check(
  '#41 regression: ordered list starting at 1 correctly interrupts a paragraph',
  blockTexts(parseMarkdown('Intro text\n1. First\n2. Second')),
  ['Intro text', 'First', 'Second']
);

check(
  '#41: a list that legitimately starts at a number other than 1 (not interrupting a paragraph) still parses as a list',
  blockTexts(parseMarkdown('5. Fifth\n6. Sixth')),
  ['Fifth', 'Sixth']
);

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
