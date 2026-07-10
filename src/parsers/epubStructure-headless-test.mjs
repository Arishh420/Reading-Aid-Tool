/**
 * Headless checks for xhtmlToBlocks's unclosed-tag fallback (issue #14).
 *
 * esbuild-bundles the real src/parsers/epubStructure.ts and exercises the
 * actual shipped `xhtmlToBlocks`, not a hand-copied restatement.
 *
 * Covers:
 *  - #14 repro: a body of unclosed <p> tags (valid HTML, invalid XHTML) that
 *    the strict backreferenced pass matches 0 of must recover via the fallback.
 *  - Partial mid-chapter loss (one closed tag + several unclosed) is NOT fixed
 *    by this pass — asserted as unchanged so the known gap is documented, not
 *    silently implied to be fixed. Follow-up, see FINDINGS F29.
 *  - Empty/whitespace-only body → still 0 blocks, no fallback.
 *  - Regression: well-formed XHTML parses via the strict pass unchanged.
 */

import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const result = await build({
  entryPoints: [path.join(__dirname, 'epubStructure.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  target: 'node18',
  platform: 'node',
});

const tmpPath = path.join(__dirname, `.headless-epubstructure-${process.pid}.mjs`);
const { writeFile, unlink } = await import('node:fs/promises');
await writeFile(tmpPath, result.outputFiles[0].text);

let xhtmlToBlocks;
try {
  ({ xhtmlToBlocks } = await import(`${tmpPath}?t=${Date.now()}`));
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

// Silence the intentional fallback console.warn during the run, but count it so
// we can assert it fired exactly for the chapters that used the fallback.
let warnCount = 0;
const realWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].startsWith('[epub] chapter')) {
    warnCount++;
    return;
  }
  realWarn(...args);
};

const texts = (blocks) => blocks.map((b) => b.text);

console.log('\nEPUB xhtmlToBlocks unclosed-tag fallback — headless checks\n');

// ─── #14 repro: unclosed <p> paragraphs ───────────────────────────────────
const unclosedBody =
  '<html><body>' +
  [1, 2, 3, 4, 5].map((n) => `<p>Paragraph number ${n} of unclosed text.`).join('\n') +
  '</body></html>';

const unclosedBefore = warnCount;
const unclosedBlocks = xhtmlToBlocks(unclosedBody, 'ch1.xhtml');
check('#14 repro: 5 unclosed <p> tags recover to 5 blocks (was 0)', unclosedBlocks.length, 5);
check(
  '#14 repro: recovered text is correct and complete',
  texts(unclosedBlocks),
  [1, 2, 3, 4, 5].map((n) => `Paragraph number ${n} of unclosed text.`)
);
check('#14 repro: fallback warning fired once', warnCount - unclosedBefore, 1);

// Headings recover too, with level preserved.
const unclosedHeading = xhtmlToBlocks(
  '<body><h2>Chapter Two<p>First line here.<p>Second line here.</body>',
  'ch2.xhtml'
);
check(
  '#14: unclosed heading + paragraphs recover with types/levels',
  unclosedHeading,
  [
    { type: 'heading', level: 2, text: 'Chapter Two' },
    { type: 'paragraph', text: 'First line here.' },
    { type: 'paragraph', text: 'Second line here.' },
  ]
);

// ─── Known gap (NOT fixed here): partial mid-chapter loss ──────────────────
// One properly-closed tag means the strict pass returns >0, so the fallback
// never fires and the unclosed tails are still lost. Asserted UNCHANGED so this
// documents current behavior rather than implying a fix. See FINDINGS F29.
const partialBefore = warnCount;
const partialBlocks = xhtmlToBlocks(
  '<body><p>Closed paragraph.</p><p>Unclosed one.<p>Unclosed two.</body>',
  'ch3.xhtml'
);
check(
  'known gap: one closed tag keeps strict pass, unclosed tails still lost (unchanged)',
  texts(partialBlocks),
  ['Closed paragraph.']
);
check('known gap: fallback does NOT fire when strict pass found any block', warnCount - partialBefore, 0);

// ─── Empty/whitespace body → still 0 blocks, no fallback ───────────────────
const emptyBefore = warnCount;
check('empty body → 0 blocks', xhtmlToBlocks('<body>   \n  </body>', 'empty.xhtml').length, 0);
check('empty body → no fallback warning', warnCount - emptyBefore, 0);

// A body with content but no block-level tags at all also yields 0 (fallback
// runs but finds no opening tags) and does not warn.
const noTagsBefore = warnCount;
check(
  'body with text but no block tags → 0 blocks',
  xhtmlToBlocks('<body>bare text with no block tags</body>', 'bare.xhtml').length,
  0
);
check('body with no block tags → no fallback warning', warnCount - noTagsBefore, 0);

// ─── Regression: well-formed XHTML uses the strict pass unchanged ──────────
const wellFormedBefore = warnCount;
const wellFormed = xhtmlToBlocks(
  '<body><h1>Title</h1><p>First paragraph.</p><p>Second paragraph.</p><li><p>Nested item</p></li></body>',
  'ok.xhtml'
);
check(
  'regression: well-formed XHTML parses via strict pass (no double-count of nested li>p)',
  wellFormed,
  [
    { type: 'heading', level: 1, text: 'Title' },
    { type: 'paragraph', text: 'First paragraph.' },
    { type: 'paragraph', text: 'Second paragraph.' },
    { type: 'paragraph', text: 'Nested item' },
  ]
);
check('regression: well-formed XHTML never triggers the fallback', warnCount - wellFormedBefore, 0);

console.warn = realWarn;
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
