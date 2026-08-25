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
 * ── Issue #87 (this pass) ────────────────────────────────────────────────
 * NFC is a NO-OP for scripts whose consonant+vowel-sign sequences have no
 * precomposed form at all — Devanagari, Thai, Hebrew-with-points, Tamil — so
 * the #77 fix above does nothing for them and the anchor could still land on a
 * bare matra / vowel sign / point. splitOrp now splits into GRAPHEME CLUSTERS
 * (src/pacer/orp.ts, `toGraphemeClusters`), so the anchor is always a whole
 * rendered unit and can never be a bare mark by construction. The clusterer is
 * hand-rolled rather than `Intl.Segmenter`, which Hermes permanently does not
 * implement — see DECISIONS.md D118 and FINDINGS.md F41.
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
 *   6. #87 acceptance: a Devanagari consonant+matra word yields no bare
 *      combining mark at every orpIndex length bucket.
 *   7. #87 acceptance: ASCII / precomposed Latin splits are byte-identical to
 *      pre-clustering behaviour, asserted against HARD-CODED literals captured
 *      from the pre-change implementation so they cannot drift with the code.
 *   8. Thai and pointed Hebrew never anchor on or lead with a bare mark.
 *   9. Tamil is safe, and its virama is deliberately NOT a conjunct linker.
 *  10. Demonstrates the #87 bug concretely: NFC-only (the shipped #77 fix)
 *      still anchors on a bare Devanagari matra where clustering does not.
 *  11. Conjunct linkers bind the following consonant (UAX #29 GB9c).
 *  12. Clustering is lossless across 31 words spanning 13 scripts.
 *  13. Empty / single-cluster / NFD-Latin degenerate inputs.
 *  14. Issue #84's delimiter decoration still composes correctly when `anchor`
 *      is a multi-code-point cluster.
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

const { splitOrp, orpIndex, toGraphemeClusters } = await bundleAndImport('orp.ts', 'orp');
// Issue #84's delimiter decoration, to verify it still composes correctly
// around a multi-code-point anchor cluster (test 14).
const { computeDelimiterSpans } = await bundleAndImport('../model/delimiterSpans.ts', 'delimiterspans');

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


// ─── issue #87: scripts with no precomposed forms ─────────────────────────────

// A pre-#87 mirror: NFC-normalize (the #77 fix) but split by CODE POINT, with
// no grapheme clustering. Kept solely to demonstrate the #87 bug concretely in
// test 10 — the real splitOrp is what every other test exercises.
function splitOrpNfcOnly(text) {
  const chars = [...text.normalize('NFC')];
  if (chars.length === 0) return { pre: '', anchor: '', post: '' };
  const idx = Math.min(orpIndex(chars.length), chars.length - 1);
  return {
    pre: chars.slice(0, idx).join(''),
    anchor: chars[idx],
    post: chars.slice(idx + 1).join(''),
  };
}

/** First code point of a string ('' for empty). */
const firstCp = (s) => (s ? [...s][0] : '');

/**
 * The precise invariant #87 is about: no FRAGMENT may begin with a combining
 * mark. A mark sitting inside a fragment attached to its own base character is
 * correct; a mark leading a fragment is an orphan, torn from the base that
 * ended the previous fragment.
 */
function assertNoOrphanMarks(word, split) {
  for (const [name, frag] of [['pre', split.pre], ['anchor', split.anchor], ['post', split.post]]) {
    assert.ok(!COMBINING_MARK.test(firstCp(frag)),
      `"${word}": ${name} must not begin with a bare combining mark, got ${JSON.stringify(split)}`);
  }
  assert.equal(split.pre + split.anchor + split.post, word.normalize('NFC'),
    `"${word}": reconstruction must equal the NFC form`);
}

// 6. ACCEPTANCE (issue #87): a Devanagari consonant+matra word yields no bare
// combining mark at every orpIndex length bucket. Each consonant+matra pair is
// exactly one grapheme cluster, so a word of N pairs has N clusters — letting
// this sweep every bucket boundary the way test 3 does for Latin.
test('Devanagari consonant+matra: no bare combining mark at every ORP length bucket', () => {
  const consonants = ['क', 'ख', 'ग', 'घ', 'च']; // क ख ग घ च
  const matras = ['ि', 'ा', 'ी', 'ु', 'े'];      // ि ा ी ु े
  const lengths = [1, 5, 6, 9, 10, 13, 14, 20]; // same bucket boundaries as test 3

  for (const len of lengths) {
    let word = '';
    for (let i = 0; i < len; i++) {
      word += consonants[i % consonants.length] + matras[i % matras.length];
    }
    // Sanity: NFC really is a no-op here — this is precisely why the #77 fix
    // does nothing for these scripts and #87 exists.
    assert.equal(word.normalize('NFC'), word, `NFC must be a no-op for Devanagari (length ${len})`);

    const split = splitOrp(word);
    assertNoOrphanMarks(word, split);
    // The anchor is a whole cluster: base consonant + its matra.
    assert.equal([...split.anchor].length, 2, `length ${len}: anchor should be one consonant+matra cluster, got ${JSON.stringify(split.anchor)}`);
    assert.ok(!COMBINING_MARK.test(firstCp(split.anchor)), `length ${len}: anchor must start on the base consonant`);
    // Anchor placement follows the bucket, counted in clusters.
    const expectedIdx = Math.min(orpIndex(len), len - 1);
    assert.equal(split.anchor, consonants[expectedIdx % consonants.length] + matras[expectedIdx % matras.length],
      `length ${len}: anchor should be cluster ${expectedIdx}`);
  }
});

// 7. ACCEPTANCE (issue #87): ASCII and precomposed Latin placement is
// byte-identical to the pre-clustering behaviour. Expected values are HARD-CODED
// literals — captured from the pre-change implementation (git show HEAD) — so
// this test cannot drift by being recomputed from the code it is checking.
test('ASCII and precomposed Latin splits are byte-identical to pre-#87 behaviour', () => {
  const EXPECTED = [
    ["a", { pre: "", anchor: "a", post: "" }],
    ["at", { pre: "a", anchor: "t", post: "" }],
    ["I", { pre: "", anchor: "I", post: "" }],
    ["cat", { pre: "c", anchor: "a", post: "t" }],
    ["reading", { pre: "re", anchor: "a", post: "ding" }],
    ["wonderful", { pre: "wo", anchor: "n", post: "derful" }],
    ["extraordinary", { pre: "ext", anchor: "r", post: "aordinary" }],
    ["internationalization", { pre: "inte", anchor: "r", post: "nationalization" }],
    ["naïve", { pre: "n", anchor: "a", post: "ïve" }],
    ["café", { pre: "c", anchor: "a", post: "fé" }],
    ["Ω", { pre: "", anchor: "Ω", post: "" }],
    ["don't", { pre: "d", anchor: "o", post: "n't" }],
    ["well-known", { pre: "wel", anchor: "l", post: "-known" }],
    ["1914", { pre: "1", anchor: "9", post: "14" }],
    ["ONE", { pre: "O", anchor: "N", post: "E" }],
    ["a-b", { pre: "a", anchor: "-", post: "b" }],
  ];
  for (const [word, expected] of EXPECTED) {
    assert.deepEqual(splitOrp(word), expected, `"${word}" must split exactly as it did before clustering`);
  }
});

// 8. Thai and pointed Hebrew — the other two scripts issue #87 names. Both were
// reproduced anchoring on a bare mark before this fix.
test('Thai and pointed Hebrew never anchor on or lead with a bare mark', () => {
  const words = [
    'ที่', 'หนังสือ', 'ภาษาไทย', 'เรียน',              // Thai
    'בְּרֵאשִׁית', 'שָׁלוֹם', 'סֵפֶר',                      // Hebrew with niqqud
  ];
  for (const word of words) {
    assert.equal(word.normalize('NFC'), word, `NFC must be a no-op for "${word}"`);
    assertNoOrphanMarks(word, splitOrp(word));
  }
});

// 9. Tamil — also named in the issue. Doubles as proof that the conjunct-linker
// set deliberately EXCLUDES the Tamil virama (U+0BCD): ICU does not bind Tamil
// conjuncts either, so neither do we.
test('Tamil is safe, and the Tamil virama is not treated as a conjunct linker', () => {
  for (const word of ['தமிழ்', 'புத்தகம்']) {
    assertNoOrphanMarks(word, splitOrp(word));
  }
  // புத்தகம் = பு | த் | த | க | ம்  — 5 clusters. If U+0BCD were in the linker
  // set, "த்" would swallow the following "த" and this would be 4.
  assert.equal(toGraphemeClusters('புத்தகம்').length, 5,
    'Tamil virama must NOT bind the following consonant (matches ICU)');
});

// 10. Concrete pre-fix bug demonstration for #87, mirroring how test 2 does it
// for #77: NFC alone (the shipped #77 fix) still anchors on a bare matra.
test('pre-fix bug reproduced: NFC-only split anchors on a bare Devanagari matra', () => {
  const word = 'किताब'; // क ि त ा ब — 5 code points, orpIndex(5) = 1
  const nfcOnly = splitOrpNfcOnly(word);
  assert.ok(COMBINING_MARK.test(nfcOnly.anchor),
    `expected the NFC-only split to anchor on a bare combining mark, got ${JSON.stringify(nfcOnly)}`);

  // The clustered splitOrp does not have this problem for the same input.
  const fixed = splitOrp(word);
  assert.ok(!COMBINING_MARK.test(firstCp(fixed.anchor)), 'fixed split must not anchor on a bare combining mark');
  assertNoOrphanMarks(word, fixed);
});

// 11. Conjunct binding (UAX #29 GB9c). Pins the linker rule so a future edit
// cannot silently drop it — these counts match Intl.Segmenter exactly.
test('conjunct linkers bind the following consonant, matching Intl.Segmenter', () => {
  assert.deepEqual(toGraphemeClusters('हिन्दी'), ['हि', 'न्दी'], 'Devanagari conjunct must not split');
  assert.equal(toGraphemeClusters('विश्वविद्यालय').length, 6, 'without the linker rule this would be 8 clusters');
  assert.deepEqual(toGraphemeClusters('বাংলা'), ['বাং', 'লা'], 'Bengali');
  assert.deepEqual(toGraphemeClusters('ខ្មែរ'), ['ខ្មែ', 'រ'], 'Khmer coeng');
});

// 12. Clustering never loses, duplicates or reorders a code point, for any of
// the scripts above — join(clusters) must reproduce the NFC input exactly.
test('clustering is lossless across every sample script', () => {
  const words = [
    'हिन्दी', 'किताब', 'पुस्तक', 'नमस्ते', 'विश्वविद्यालय',
    'ที่', 'หนังสือ', 'ภาษาไทย', 'เรียน',
    'בְּרֵאשִׁית', 'שָׁלוֹם', 'סֵפֶר', 'تمار',
    'தமிழ்', 'புத்தகம்', 'বাংলা', 'ગુજરાતી', 'മലയാളം', 'ಕನ್ನಡ', 'తెలుగు', 'ਪੰਜਾਬੀ', 'ខ្មែរ',
    '한국어', 'reading', 'naïve', 'naïve'.normalize('NFD'), 'café', 'Ω', 'hi👋', '👨‍👩‍👧', '🇯🇵ok',
  ];
  for (const word of words) {
    const nfc = word.normalize('NFC');
    assert.equal(toGraphemeClusters(nfc).join(''), nfc, `clustering "${word}" must be lossless`);
    assertNoOrphanMarks(word, splitOrp(word));
  }
});

// 13. Degenerate inputs still behave.
test('empty, single-cluster and NFD-Latin inputs still behave', () => {
  assert.deepEqual(splitOrp(''), { pre: '', anchor: '', post: '' });
  assert.deepEqual(toGraphemeClusters(''), []);
  assert.deepEqual(splitOrp('ที่'), { pre: '', anchor: 'ที่', post: '' }, 'a one-cluster word is all anchor');
  // #77 regression, restated against the clustered implementation.
  assert.deepEqual(splitOrp('naïve'.normalize('NFD')), splitOrp('naïve'.normalize('NFC')));
});

// 14. Interaction with the issue-#84 delimiter decoration. computeDelimiterSpans
// is computed from the bare token text and written AROUND splitOrp's output by
// Rsvp.tsx — never fed into it. This mirrors that composition exactly and
// confirms it still holds when `anchor` is a multi-code-point cluster.
test('issue #84 delimiter decoration composes correctly around multi-code-point anchors', () => {
  const words = ['"हिन्दी', 'किताब', 'पुस्तक"', '(ที่', 'หนังสือ)', '"שָׁלוֹם"', '(תמר', 'סֵפֶר)'];
  const doc = {
    blocks: [{
      id: 'b0',
      type: 'paragraph',
      words: words.map((text, i) => ({ id: String(i), text, isWordlike: true, spaceBefore: true })),
    }],
  };
  const spans = computeDelimiterSpans(doc);
  assert.equal(spans.length, words.length, 'one decoration per word (parallel array, D113)');

  for (let i = 0; i < words.length; i++) {
    const text = words[i];
    const { prefix, suffix } = spans[i];
    const { pre, anchor, post } = splitOrp(text);

    // Exactly what Rsvp.tsx writes into preRef/anchorRef/postRef.
    const rendered = (prefix + pre) + anchor + (post + suffix);
    assert.equal(rendered, prefix + text.normalize('NFC') + suffix,
      `"${text}": decoration must wrap the whole NFC token, not perturb it`);

    // The anchor is chosen from the BARE token — decoration must never shift it.
    assert.equal(anchor, splitOrp(text).anchor, 'anchor derives from bare text only');
    assertNoOrphanMarks(text, { pre, anchor, post });
    // Decoration must not introduce an orphan mark at a fragment edge either.
    assert.ok(!COMBINING_MARK.test(firstCp(prefix + pre)), `"${text}": decorated pre must not begin with a bare mark`);
  }

  // The span really is open across the middle words (otherwise this test would
  // pass vacuously with empty decoration everywhere).
  assert.equal(spans[1].prefix, '"', 'middle word of a quoted run carries the opening quote');
  assert.equal(spans[1].suffix, '"', 'and its mirror');
});

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
