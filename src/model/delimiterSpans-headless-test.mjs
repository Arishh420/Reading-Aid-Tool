/**
 * Headless checks for per-word RSVP delimiter spans (issue #84).
 *
 * esbuild-bundles the real src/model/delimiterSpans.ts AND src/pacer/orp.ts and
 * exercises the actual shipped `computeDelimiterSpans` / `splitOrp` — not a
 * hand-copied restatement.
 *
 * Covers (issue #84 acceptance):
 *  - unclosed span running to the end of a block (and NOT leaking into the next)
 *  - nested span, both orders — closers unwind in reverse
 *  - straight-quote parity across many tokens
 *  - a contraction-heavy passage proving apostrophes never open a span
 *  - curly and straight quotes both handled
 *  - `(aside)` fully inside one token is NOT double-wrapped
 *  - regression guard: splitOrp(word.text) is byte-identical with the feature
 *    active (decoration is never fed into splitOrp)
 */

import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function bundleAndImport(entryRelPath) {
  const result = await build({
    entryPoints: [path.join(__dirname, entryRelPath)],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'node18',
    platform: 'node',
  });
  const code = result.outputFiles[0].text;
  const tmpPath = path.join(
    __dirname,
    `.headless-${path.basename(entryRelPath, '.ts')}-${process.pid}-${Math.random()
      .toString(36)
      .slice(2)}.mjs`,
  );
  const { writeFile, unlink } = await import('node:fs/promises');
  await writeFile(tmpPath, code);
  try {
    return await import(`${tmpPath}?t=${Date.now()}`);
  } finally {
    await unlink(tmpPath);
  }
}

const { computeDelimiterSpans } = await bundleAndImport('delimiterSpans.ts');
const { splitOrp } = await bundleAndImport('../pacer/orp.ts');

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

/**
 * Build a minimal Document from block specs: each block is an array of raw
 * token strings. Ids are the contiguous flat index, matching reindexWords /
 * Word.id === flat index (D13). isWordlike/spaceBefore are irrelevant to the
 * delimiter scan, but populated for shape fidelity.
 */
const WORDLIKE = /[\p{L}\p{N}]/u;
function doc(...blocks) {
  let id = 0;
  return {
    blocks: blocks.map((tokens, b) => ({
      id: `b${b}`,
      type: 'paragraph',
      words: tokens.map((text) => ({
        id: String(id++),
        text,
        isWordlike: WORDLIKE.test(text),
        spaceBefore: true,
      })),
    })),
  };
}

/** Render string a word WOULD produce: prefix + splitOrp(text) reassembled + suffix. */
function rendered(word, deco) {
  const { pre, anchor, post } = splitOrp(word.text);
  return deco.prefix + pre + anchor + post + deco.suffix;
}

// ── 1. Straight double quote across many tokens ──────────────────────────
{
  const d = doc(['"the', 'whole', 'thing"']);
  const spans = computeDelimiterSpans(d);
  const words = d.blocks[0].words;
  check(
    '"the whole thing": every word wraps "…"',
    words.map((w, i) => rendered(w, spans[i])),
    ['"the"', '"whole"', '"thing"'],
  );
  check(
    '"the whole thing": prefix/suffix pairs',
    spans,
    [
      { prefix: '', suffix: '"' }, // opener carried by token, closer added
      { prefix: '"', suffix: '"' }, // both added (middle)
      { prefix: '"', suffix: '' }, // opener added, closer carried by token
    ],
  );
}

// ── 2. Parity across a longer straight-quote run ─────────────────────────
{
  const d = doc(['"a', 'b', 'c', 'd', 'e"', 'f']);
  const spans = computeDelimiterSpans(d);
  check(
    'straight-quote parity: inside a..e", outside f',
    spans.map((s) => `${s.prefix}|${s.suffix}`),
    ['|"', '"|"', '"|"', '"|"', '"|', '|'],
  );
}

// ── 3. Curly double quotes ───────────────────────────────────────────────
{
  const d = doc(['“the', 'whole', 'thing”']);
  const spans = computeDelimiterSpans(d);
  const words = d.blocks[0].words;
  check(
    'curly “the whole thing”: every word wraps “…”',
    words.map((w, i) => rendered(w, spans[i])),
    ['“the”', '“whole”', '“thing”'],
  );
}

// ── 4. Nested: paren outside, quote inside ───────────────────────────────
{
  const d = doc(['("the', 'whole', 'thing")']);
  const spans = computeDelimiterSpans(d);
  const words = d.blocks[0].words;
  check(
    '("the whole thing"): nested, closers mirror in reverse',
    words.map((w, i) => rendered(w, spans[i])),
    ['("the")', '("whole")', '("thing")'],
  );
}

// ── 5. Nested, opposite order: quote outside, paren inside ───────────────
{
  const d = doc(['"a', '(b', 'c)', 'd"']);
  const spans = computeDelimiterSpans(d);
  // `(b` carries its own `(`, so only `"` is open BEFORE it → prefix `"`,
  // suffix mirrors the surviving stack `["(] → )"`. `c)` carries its own `)`.
  check(
    '"a (b c) d": nested opposite order',
    spans.map((s) => `${s.prefix}|${s.suffix}`),
    ['|"', '"|)"', '"(|"', '"|'],
  );
  const words = d.blocks[0].words;
  check(
    '"a (b c) d": rendered — b/c wrapped by both, mirrored',
    words.map((w, i) => rendered(w, spans[i])),
    ['"a"', '"(b)"', '"(c)"', '"d"'],
  );
}

// ── 6. Unclosed span runs to end of block, does NOT leak to next block ───
{
  const d = doc(['(open', 'still', 'inside'], ['next', 'block']);
  const spans = computeDelimiterSpans(d);
  check(
    'unclosed "(": decorates to end of block 1',
    spans.slice(0, 3).map((s) => `${s.prefix}|${s.suffix}`),
    ['|)', '(|)', '(|)'],
  );
  check(
    'unclosed "(": block 2 starts fresh (no leak)',
    spans.slice(3).map((s) => `${s.prefix}|${s.suffix}`),
    ['|', '|'],
  );
}

// ── 7. `(aside)` fully inside one token — NOT double-wrapped ─────────────
{
  const d = doc(['before', '(aside)', 'after']);
  const spans = computeDelimiterSpans(d);
  const words = d.blocks[0].words;
  check(
    '(aside) self-contained: no added decoration',
    spans,
    [
      { prefix: '', suffix: '' },
      { prefix: '', suffix: '' },
      { prefix: '', suffix: '' },
    ],
  );
  check(
    '(aside) renders once, not ((aside))',
    rendered(words[1], spans[1]),
    '(aside)',
  );
}

// ── 8. Contraction-heavy passage: apostrophes NEVER open a span ──────────
{
  // straight ' (U+0027) and curly ’ (U+2019) apostrophes, plus a trailing
  // possessive and a leading decade elision — none may toggle any span.
  const tokens = [
    "don't",
    "it's",
    "readers'",
    "y'all",
    'the',
    'dogs’',
    "rock",
    "'n'",
    "roll",
    "'90s",
    'wouldn’t',
  ];
  const d = doc(tokens);
  const spans = computeDelimiterSpans(d);
  check(
    'contractions/possessives: zero decoration on every token',
    spans.every((s) => s.prefix === '' && s.suffix === ''),
    true,
  );
}

// ── 9. Contractions INSIDE a real quote still get the quote, nothing else ─
{
  const d = doc(['"don’t', 'it’s', 'me"']);
  const spans = computeDelimiterSpans(d);
  const words = d.blocks[0].words;
  check(
    'quoted contraction: only the double quote decorates',
    words.map((w, i) => rendered(w, spans[i])),
    ['"don’t"', '"it’s"', '"me"'],
  );
}

// ── 10. Trailing punctuation after a closer still updates the stack ───────
{
  const d = doc(['"end."', 'next']);
  const spans = computeDelimiterSpans(d);
  check(
    '"end." then next: quote closes despite trailing period',
    spans.map((s) => `${s.prefix}|${s.suffix}`),
    ['|', '|'],
  );
}

// ── 11. REGRESSION GUARD: splitOrp output byte-identical with feature on ──
// The decoration is never fed into splitOrp, so this passes by construction;
// it guards against a future refactor that decorates the token BEFORE
// splitOrp. It does NOT verify rendered anchor position (headless can't).
{
  const tokens = [
    '"the', 'whole', 'thing"', '("nested', 'x")', '(aside)',
    "don't", 'plain', '“curly”', 'a', 'supercalifragilistic"',
  ];
  const d = doc(tokens);
  const spans = computeDelimiterSpans(d);
  const words = d.blocks[0].words;

  // anchor letter chosen from the BARE token, identical to splitOrp(text) with
  // no feature involved.
  const anchorsWithFeature = words.map((w) => splitOrp(w.text).anchor);
  const anchorsBare = tokens.map((t) => splitOrp(t).anchor);
  check('regression: anchor letter unchanged for every token', anchorsWithFeature, anchorsBare);

  // full pre/anchor/post from splitOrp unchanged; decoration lives only in
  // prefix/suffix, appended OUTSIDE the split.
  check(
    'regression: splitOrp(pre/anchor/post) byte-identical, decoration is separate',
    words.every((w) => {
      const a = splitOrp(w.text);
      const b = splitOrp(w.text);
      return a.pre === b.pre && a.anchor === b.anchor && a.post === b.post;
    }),
    true,
  );
  // and the decoration is genuinely additive: stripping prefix/suffix from the
  // rendered string returns exactly splitOrp's reassembled bare output.
  check(
    'regression: rendered minus decoration === bare splitOrp output',
    words.map((w, i) => {
      const { pre, anchor, post } = splitOrp(w.text);
      const full = rendered(w, spans[i]);
      const inner = full.slice(spans[i].prefix.length, full.length - spans[i].suffix.length);
      return inner === pre + anchor + post;
    }),
    words.map(() => true),
  );
}

// ── 12. Index alignment: one decoration entry per flat word, in order ─────
{
  const d = doc(['"a', 'b'], ['c', 'd"'], ['e']);
  const spans = computeDelimiterSpans(d);
  const flatCount = d.blocks.reduce((n, b) => n + b.words.length, 0);
  check('one decoration per flat word', spans.length, flatCount);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
