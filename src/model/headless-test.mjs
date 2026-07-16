/**
 * Headless checks for the tokenizer's em/en-dash split (issue #25).
 *
 * esbuild-bundles the real src/model/tokenize.ts and exercises the actual
 * shipped `tokenize`, not a hand-copied restatement of its logic.
 *
 * Covers:
 *  - attached em/en dash ("word—word") splits into two tokens, dash on the
 *    left, right piece marked spaceBefore: false
 *  - a spaced dash stays a separate, non-word-like token, spaceBefore: true
 *  - hyphen-minus ("well-known") is never split
 *  - a numeric range ("1914–1918") is never split
 *  - a leading/trailing/bare dash is never split
 *  - a multi-dash run ("word——word") is treated as one unit
 *  - ids stay sequential from startIndex across split pieces
 */

import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const result = await build({
  entryPoints: [path.join(__dirname, 'tokenize.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  target: 'node18',
  platform: 'node',
});

const code = result.outputFiles[0].text;
const tmpPath = path.join(__dirname, `.headless-tokenize-${process.pid}.mjs`);
const { writeFile, unlink } = await import('node:fs/promises');
await writeFile(tmpPath, code);

let tokenize;
try {
  ({ tokenize } = await import(`${tmpPath}?t=${Date.now()}`));
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

function texts(words) {
  return words.map((w) => w.text);
}

// --- attached em dash: splits into two, dash stays left ---
{
  const words = tokenize('word—word');
  check('word—word: texts', texts(words), ['word—', 'word']);
  check('word—word: second spaceBefore false', words[1].spaceBefore, false);
  check('word—word: first spaceBefore true', words[0].spaceBefore, true);
}

// --- attached en dash: same shape ---
{
  const words = tokenize('word–word');
  check('word–word (en dash): texts', texts(words), ['word–', 'word']);
  check('word–word (en dash): second spaceBefore false', words[1].spaceBefore, false);
}

// --- spaced dash: three tokens, dash non-wordlike, all spaceBefore true ---
{
  const words = tokenize('word — word');
  check('word — word: texts', texts(words), ['word', '—', 'word']);
  check(
    'word — word: all spaceBefore true',
    words.map((w) => w.spaceBefore),
    [true, true, true],
  );
  check('word — word: dash isWordlike false', words[1].isWordlike, false);
}

// --- hyphen-minus is never split ---
{
  const words = tokenize('well-known');
  check('well-known: unchanged, one token', texts(words), ['well-known']);
}

// --- numeric range guard ---
{
  const words = tokenize('1914–1918');
  check('1914–1918: unchanged, one token', texts(words), ['1914–1918']);
}

// --- leading dash: nothing before, don't split ---
{
  const words = tokenize('—word');
  check('—word: unchanged, one token', texts(words), ['—word']);
}

// --- trailing dash: nothing after, don't split ---
{
  const words = tokenize('word—');
  check('word—: unchanged, one token', texts(words), ['word—']);
}

// --- bare dash: one non-wordlike token ---
{
  const words = tokenize('—');
  check('bare —: one token', texts(words), ['—']);
  check('bare —: non-wordlike', words[0].isWordlike, false);
}

// --- multi-dash run treated as one unit ---
{
  const words = tokenize('word——word');
  check('word——word: texts', texts(words), ['word——', 'word']);
}

// --- ids stay sequential across split pieces, honoring startIndex ---
{
  const words = tokenize('a word—word b', 10);
  check(
    'ids sequential from startIndex across split pieces',
    words.map((w) => w.id),
    ['10', '11', '12', '13'],
  );
  check(
    'ids-sequential texts',
    texts(words),
    ['a', 'word—', 'word', 'b'],
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
