/**
 * Headless checks for the NFD/combining-mark ORP anchor fix (issue #77).
 *
 * splitOrp previously split by raw code point ([...text]), which separates a
 * base character from a combining diacritic in NFD (decomposed) text — e.g.
 * NFD "naïve" (n, a, i, combining-diaeresis, v, e — 6 code points) splits
 * differently than its NFC form "naïve" (n, a, ï, v, e — 5 code points),
 * and can leave a combining mark detached from its base character in the
 * pre/anchor/post output — including, for some word shapes, landing the
 * anchor itself directly on a bare combining mark, which is what the flashed
 * RSVP word actually renders.
 *
 * Fix: splitOrp now normalizes to NFC before splitting into code points
 * (src/pacer/orp.ts). This composes any decomposed sequence that has a
 * precomposed equivalent — which covers standard Latin accented letters, the
 * common real-world case (e.g. macOS-authored NFD text, per the issue). It
 * does not fix exotic combining sequences with no precomposed NFC form; see
 * the DECISIONS.md entry for this fix for why that gap was judged
 * out-of-scope.
 *
 * esbuild-bundles the real src/pacer/orp.ts and exercises the actual shipped
 * splitOrp/orpIndex — not a hand-copied restatement. Same pattern as
 * src/parsers/spine-integrity-headless-test.mjs.
 *
 * Covers:
 *   1. NFD "naïve" and NFC "naïve" produce byte-identical pre/anchor/post.
 *   2. Demonstrates the pre-fix bug concretely: splitting NFD "naïve" by raw
 *      code point (i.e. skipping the NFC-normalize step) produces a bare
 *      combining mark leading the post fragment — the exact "post ' ̈ve'"
 *      symptom described in the issue.
 *   3. Systematic sweep: for every ORP length bucket (≤1, ≤5, ≤9, ≤13, >13),
 *      an NFD word built entirely from precomposable accented Latin vowels
 *      normalizes cleanly, and the anchor is never a bare combining mark.
 *   4. Ordinary ASCII words are unaffected (NFC-normalizing ASCII is a no-op).
 *   5. Empty string still returns { pre: '', anchor: '', post: '' }.
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

const { splitOrp, orpIndex } = await bundleAndImport('orp.ts', 'orp');

// Combining-mark check: Unicode category M (Mn/Mc/Me) — matches any diacritic
// that, if it appears alone (not attached to a preceding base character in
// the same rendered cluster), would render as a floating/bare mark.
const COMBINING_MARK = /\p{M}/u;

// A pre-fix mirror of the OLD (buggy) split logic — code-point split with NO
// NFC normalization — kept here solely to demonstrate the bug concretely in
// test 2. Not used anywhere in the app; orp.ts's real splitOrp is what every
// other test in this file exercises.
function splitOrpOldBuggy(text) {
  const chars = [...text];
  if (chars.length === 0) return { pre: '', anchor: '', post: '' };
  const idx = Math.min(orpIndex(chars.length), chars.length - 1);
  return {
    pre: chars.slice(0, idx).join(''),
    anchor: chars[idx],
    post: chars.slice(idx + 1).join(''),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
    failed++;
  }
}

console.log('\nORP NFD/combining-mark fix — headless checks\n');

// 1. NFD and NFC forms of the same word produce identical splits.
test('NFD "naïve" and NFC "naïve" produce identical pre/anchor/post', () => {
  const nfc = 'naïve'.normalize('NFC'); // n, a, ï, v, e — 5 code points
  const nfd = 'naïve'.normalize('NFD'); // n, a, i, ◌̈, v, e — 6 code points
  assert.notEqual(nfc.length, nfd.length, 'sanity: NFC and NFD forms must actually differ in code-point length for this test to mean anything');

  const splitFromNfc = splitOrp(nfc);
  const splitFromNfd = splitOrp(nfd);
  assert.deepEqual(splitFromNfd, splitFromNfc,
    `NFD split ${JSON.stringify(splitFromNfd)} should equal NFC split ${JSON.stringify(splitFromNfc)}`);
  // And the composed anchor must not itself be a bare combining mark.
  assert.ok(!COMBINING_MARK.test(splitFromNfd.anchor), 'anchor must not be a bare combining mark');
});

// 2. Concrete pre-fix bug demonstration, matching the issue's own repro text.
test('pre-fix bug reproduced: unnormalized NFD split leaves a bare combining mark', () => {
  const nfd = 'naïve'.normalize('NFD');
  const buggy = splitOrpOldBuggy(nfd);
  // orpIndex(6) = 2 (<=9 bucket); NFD code points are n,a,i,◌̈,v,e (indices 0-5).
  // idx=2 lands on the base 'i', but the very next code point (index 3) is the
  // bare combining diaeresis — it leaks into `post`, detached from its base,
  // exactly the "post '̈ve'" symptom the issue describes.
  assert.ok(COMBINING_MARK.test(buggy.post[0] ?? ''),
    `expected the old buggy split's post to start with a bare combining mark, got ${JSON.stringify(buggy)}`);

  // The FIXED splitOrp does not have this problem for the same input.
  const fixed = splitOrp(nfd);
  assert.ok(!COMBINING_MARK.test(fixed.post[0] ?? ''), 'fixed split must not leak a bare combining mark into post');
  assert.ok(!COMBINING_MARK.test(fixed.anchor), 'fixed split must not anchor on a bare combining mark');
});

// 3. Systematic sweep across every ORP length bucket (≤1, ≤5, ≤9, ≤13, >13):
// an NFD word built entirely from precomposable accented Latin vowels (so NFC
// normalization removes every combining mark in the string) must never anchor
// on — or leak into pre/post — a bare combining mark, at any length.
test('anchor is never a bare combining mark for NFD input, across every ORP length bucket', () => {
  const vowels = ['a', 'e', 'i', 'o', 'u']; // each has a precomposed acute form: á é í ó ú
  const lengths = [1, 5, 6, 9, 10, 13, 14, 20]; // spans every orpIndex bucket boundary
  for (const len of lengths) {
    // Build the NFC "expected" word first (repeating vowels to reach `len`
    // composed characters), each combined with U+0301 COMBINING ACUTE ACCENT,
    // then derive the NFD test input by decomposing it.
    let nfcWord = '';
    for (let i = 0; i < len; i++) {
      nfcWord += (vowels[i % vowels.length] + '\u0301').normalize('NFC'); // '\u0301' = combining acute accent
    }
    assert.equal(nfcWord.length, len, `constructed NFC word should have exactly ${len} composed characters`);
    const nfdWord = nfcWord.normalize('NFD');
    assert.notEqual(nfdWord.length, nfcWord.length, `NFD form of length-${len} word should have more code points than its NFC form`);

    const bucket = orpIndex(len);
    const split = splitOrp(nfdWord);
    const reconstructed = split.pre + split.anchor + split.post;
    assert.equal(reconstructed, nfcWord, `length ${len} (bucket ${bucket}): reconstructed split should equal the NFC word`);
    assert.ok(!COMBINING_MARK.test(split.anchor), `length ${len} (bucket ${bucket}): anchor must not be a bare combining mark, got ${JSON.stringify(split)}`);
    assert.ok(!COMBINING_MARK.test(split.pre), `length ${len} (bucket ${bucket}): pre must not contain a bare combining mark`);
    assert.ok(!COMBINING_MARK.test(split.post), `length ${len} (bucket ${bucket}): post must not contain a bare combining mark`);
  }
});

// 4. Ordinary ASCII words are unaffected — NFC-normalizing ASCII is a no-op.
test('ordinary ASCII words unaffected', () => {
  const cases = ['a', 'cat', 'reading', 'wonderful', 'extraordinary'];
  for (const word of cases) {
    const split = splitOrp(word);
    assert.equal(split.pre + split.anchor + split.post, word, `reconstruction should equal the original word "${word}"`);
    const idx = Math.min(orpIndex(word.length), word.length - 1);
    assert.equal(split.anchor, word[idx], `anchor for "${word}" should be the character at index ${idx}`);
  }
});

// 5. Empty string still returns { pre: '', anchor: '', post: '' }.
test('empty string returns empty split', () => {
  assert.deepEqual(splitOrp(''), { pre: '', anchor: '', post: '' });
});

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
