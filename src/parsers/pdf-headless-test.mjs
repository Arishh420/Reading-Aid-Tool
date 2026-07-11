/**
 * Headless checks for pdf.ts's glyph pre-sort comparator (issue #13, HIGH).
 *
 * esbuild-bundles the real src/parsers/pdf.ts and exercises the actual
 * shipped `itemsToLines`, not a hand-copied restatement. Bundling pdf.ts in
 * Node requires stubbing two things that only exist for the browser build,
 * purely inside this test file (nothing shipped changes):
 *   - the Vite-only `?url` worker import (`pdfjs-dist/build/pdf.worker.min.mjs?url`)
 *   - `pdfjs-dist` itself (its non-legacy build requires `DOMMatrix`, which
 *     doesn't exist in plain Node) — `itemsToLines` never calls into pdfjs.*
 *     at runtime, so a trivial stub (GlobalWorkerOptions as a plain object,
 *     getDocument throwing if ever called) is safe: if `parsePdf` were
 *     accidentally exercised by a future test it would throw loudly rather
 *     than silently behave like a browser.
 *
 * Covers:
 *  - Direct proof that the OLD comparator (`(a,b) => Math.abs(a.y-b.y) >
 *    medianH*0.5 ? b.y-a.y : a.x-b.x`) is not a valid total order: a
 *    constructed 3-point triple gives A<B, B<C, but C<A — a genuine cycle,
 *    independent of whatever any particular Array.sort() implementation
 *    happens to do with it.
 *  - The same triple under the NEW comparator (`(a,b) => b.y-a.y || a.x-b.x`)
 *    is consistent (no cycle) — proof it's a valid total order.
 *  - itemsToLines reading-order correctness on a realistic small-jitter
 *    drifting baseline (single line, and two adjacent lines with no
 *    interleaving) — regression coverage, run against the real shipped
 *    comparator.
 *
 * IMPORTANT CAVEAT (see FINDINGS.md F33): a randomized + parametric search
 * (~400 seeds x multiple amplitudes/frequencies/lengths) during development
 * of this fix found NO realistic-jitter input where the OLD comparator's
 * Array.sort() output visibly diverges from the NEW comparator's — because
 * flush()'s existing per-row x-sort self-heals within-row reordering
 * regardless of pre-sort order, and V8's adaptive sort doesn't appear to
 * exercise the bad comparisons on these near-sorted inputs. Only at jitter
 * amplitudes large enough to also break the separate, out-of-scope
 * row-clustering threshold (medianH*0.6) did BOTH old and new code fragment
 * a line — not a demonstration this fix resolves. The tests below are
 * therefore regression guards for the total-order fix, not proof it changes
 * observed output on realistic PDFs; the comparator-transitivity proof
 * above is the actual evidence for the bug and its fix.
 */

import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const stubHeavyImportsPlugin = {
  name: 'stub-heavy-imports',
  setup(b) {
    b.onResolve({ filter: /\?url$/ }, (args) => ({ path: args.path, namespace: 'stub-empty' }));
    b.onResolve({ filter: /^pdfjs-dist$/ }, () => ({ path: 'pdfjs-dist', namespace: 'stub-pdfjs' }));
    b.onLoad({ filter: /.*/, namespace: 'stub-empty' }, () => ({
      contents: 'export default "";',
      loader: 'js',
    }));
    b.onLoad({ filter: /.*/, namespace: 'stub-pdfjs' }, () => ({
      contents:
        'export const GlobalWorkerOptions = {}; ' +
        'export function getDocument() { throw new Error("stub: pdfjs-dist not available in headless test"); }',
      loader: 'js',
    }));
  },
};

const result = await build({
  entryPoints: [path.join(__dirname, 'pdf.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  target: 'node18',
  platform: 'node',
  plugins: [stubHeavyImportsPlugin],
});

const tmpPath = path.join(__dirname, `.headless-pdf-${process.pid}.mjs`);
const { writeFile, unlink } = await import('node:fs/promises');
await writeFile(tmpPath, result.outputFiles[0].text);

let itemsToLines;
try {
  ({ itemsToLines } = await import(`${tmpPath}?t=${Date.now()}`));
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

console.log('\npdf.ts — headless checks (issue #13)\n');

// ─── Direct comparator transitivity proof ───────────────────────────────────

{
  // medianH = 10 (font size 10). Old comparator's branch threshold is
  // medianH*0.5 = 5.
  const medianH = 10;
  const oldCmp = (a, b) => (Math.abs(a.y - b.y) > medianH * 0.5 ? b.y - a.y : a.x - b.x);
  const newCmp = (a, b) => b.y - a.y || a.x - b.x;

  // A/B/C: adjacent pairs (|Δy| <= 5) fall to the x-branch giving A<B<C;
  // the non-adjacent pair (|Δy| = 5.5 > 5) falls to the y-branch and
  // reverses to C<A — a genuine cycle, proving the old comparator is not a
  // valid total order.
  const A = { x: 0, y: 0 };
  const B = { x: 10, y: 3 };
  const C = { x: 20, y: 5.5 };

  const abOld = oldCmp(A, B) < 0;
  const bcOld = oldCmp(B, C) < 0;
  const acOld = oldCmp(A, C) < 0;
  check('old comparator: A<B', abOld, true);
  check('old comparator: B<C', bcOld, true);
  check('old comparator: A<C (should be FALSE — this is the intransitivity)', acOld, false);
  check(
    'old comparator: cycle confirmed (A<B<C transitively implies A<C, but comparator says C<A)',
    abOld && bcOld && !acOld,
    true,
  );

  // The new comparator's primary key is descending y, so for these
  // differing-y points it orders C<B<A (largest y first) — NOT the same
  // relative order as the old comparator's x-branch. That's fine: the new
  // comparator doesn't need to preserve x-order for differing-y points —
  // that's flush()'s job once the (unchanged) row-clustering sweep has
  // grouped them. What matters here is that the new comparator is
  // transitively consistent for this same triple where the old one cycles.
  const cbNew = newCmp(C, B) < 0;
  const baNew = newCmp(B, A) < 0;
  const caNew = newCmp(C, A) < 0;
  check('new comparator: C<B (descending y)', cbNew, true);
  check('new comparator: B<A (descending y)', baNew, true);
  check('new comparator: C<A (transitively consistent — no cycle)', caNew, true);
}

// ─── Total-order sanity: new comparator is consistent across many random points ──

{
  const newCmp = (a, b) => b.y - a.y || a.x - b.x;
  let seed = 42;
  function rnd() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const points = Array.from({ length: 40 }, () => ({
    x: Math.round(rnd() * 100),
    y: Math.round(rnd() * 100),
  }));
  let violation = false;
  for (const a of points) {
    for (const b of points) {
      for (const c of points) {
        const ab = newCmp(a, b);
        const bc = newCmp(b, c);
        const ac = newCmp(a, c);
        // Transitivity of strict total order: if a<b and b<c then a<c
        // (ties via <=0/>=0 are fine; only a genuine sign contradiction on
        // the strict a<c relation counts as a violation).
        if (ab < 0 && bc < 0 && !(ac < 0)) violation = true;
      }
    }
  }
  check('new comparator: no transitivity violation across 40 random points (64000 triples)', violation, false);
}

// ─── itemsToLines: realistic drifting baseline, single line ────────────────

function item(str, x, y, fontSize = 10) {
  return { str, transform: [fontSize, 0, 0, fontSize, x, y], height: fontSize, width: fontSize * 0.6 };
}

{
  // Small (~0.15 * fontSize) per-glyph y jitter — representative of real
  // sub-pixel font-kerning noise in extracted PDF text, well within both the
  // comparator's branch threshold and the row-clustering threshold.
  const letters = 'ABCDEFGHIJKL'.split('');
  const items = letters.map((ch, i) => item(ch, i * 7, 100 + (i % 3 === 1 ? 1.5 : i % 3 === 2 ? -1 : 0)));
  const lines = itemsToLines(items);
  check('single drifting-baseline line reads in order, one line', lines.length, 1);
  check('single drifting-baseline line: correct text', lines[0]?.text.replace(/\s+/g, ''), 'ABCDEFGHIJKL');
}

// ─── itemsToLines: two adjacent drifting lines, no interleaving ────────────

{
  const upper = 'ABCDEFGHIJKL'.split('');
  const lower = 'mnopqrstuvwx'.split('');
  const line1 = upper.map((ch, i) => item(ch, i * 7, 100 + (i % 3 === 1 ? 1.5 : i % 3 === 2 ? -1 : 0)));
  const line2 = lower.map((ch, i) => item(ch, i * 7, 80 + (i % 3 === 0 ? -1.2 : i % 3 === 2 ? 1.2 : 0)));
  const items = [...line1, ...line2];
  const lines = itemsToLines(items);
  check('two adjacent drifting lines: exactly 2 lines (no fragmentation)', lines.length, 2);
  check('two adjacent drifting lines: line 1 text, no interleaving', lines[0]?.text.replace(/\s+/g, ''), 'ABCDEFGHIJKL');
  check('two adjacent drifting lines: line 2 text, no interleaving', lines[1]?.text.replace(/\s+/g, ''), 'mnopqrstuvwx');
  check('two adjacent drifting lines: gapBefore set on line 2', lines[1]?.gapBefore, true);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
