/**
 * Headless checks for dwell roll-up onto skipped punctuation (issue #25).
 *
 * esbuild-bundles the real src/pacer/dwell.ts (which imports model/types.ts —
 * a type-only import, erased by esbuild) and exercises the actual shipped
 * `buildDwellMultipliers`, not a hand-copied restatement of its logic.
 *
 * Documents are constructed directly as Document objects (bypassing the
 * tokenizer) so each test controls isWordlike/text precisely; ids are
 * assigned as the flat index per word, matching the reindexWords invariant.
 */

import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const result = await build({
  entryPoints: [path.join(__dirname, 'dwell.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  target: 'node18',
  platform: 'node',
});

const code = result.outputFiles[0].text;
const tmpPath = path.join(__dirname, `.headless-dwell-${process.pid}.mjs`);
const { writeFile, unlink } = await import('node:fs/promises');
await writeFile(tmpPath, code);

let buildDwellMultipliers;
try {
  ({ buildDwellMultipliers } = await import(`${tmpPath}?t=${Date.now()}`));
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

/** Build a single-block Document from [text, isWordlike] pairs, flat-indexed ids. */
function doc(tokenSpecs) {
  let id = 0;
  const words = tokenSpecs.map(([text, isWordlike]) => ({
    id: String(id++),
    text,
    isWordlike,
    spaceBefore: true,
  }));
  return { blocks: [{ id: '0', type: 'paragraph', words }] };
}

// --- "word — word": first word's dwell rolls up to 1.75 from the skipped "—" ---
{
  const d = doc([
    ['word', true],
    ['—', false],
    ['word', true],
  ]);
  const dwell = buildDwellMultipliers(d);
  check('word — word: first word rolled up to 1.75', dwell[0], 1.75);
}

// --- "end. — word": word ending in "." keeps 2.5, not downgraded by the MAX rule ---
{
  const d = doc([
    ['end.', true],
    ['—', false],
    ['word', true],
  ]);
  const dwell = buildDwellMultipliers(d);
  check('end. — word: sentence dwell not downgraded', dwell[0], 2.5);
}

// --- word-like token with no skipped run after it: unchanged at 1 ---
{
  const d = doc([
    ['plain', true],
    ['word', true],
    ['word', true],
  ]);
  const dwell = buildDwellMultipliers(d);
  check('plain word, no skipped run: dwell 1', dwell[0], 1);
}

// --- last word-like token of a block is still exactly 3 ---
{
  const d = doc([
    ['first', true],
    ['last', true],
  ]);
  const dwell = buildDwellMultipliers(d);
  check('last word-like token of block: dwell 3', dwell[1], 3);
}

// --- "word—word" after splitting: "word—" gets 1.75 with no dwell special-case ---
{
  const d = doc([
    ['word—', true],
    ['word', true],
  ]);
  const dwell = buildDwellMultipliers(d);
  check('word— (post-split attached dash): dwell 1.75', dwell[0], 1.75);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
