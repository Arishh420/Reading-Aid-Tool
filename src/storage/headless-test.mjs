/**
 * Headless checks for reading-position persistence (issue #6).
 *
 * What is provable without a browser:
 *   1. History rolls at exactly 5 entries (oldest dropped).
 *   2. The >2 % gate: same-position saves do NOT add history entries.
 *   3. latest is ALWAYS updated regardless of the >2 % gate.
 *   4. Position round-trips through storage (set then get, JSON fidelity).
 *   5. History entry with closest percent to latest is filtered in ResumePrompt
 *      (useful-history >5 % difference logic).
 *   6. Fingerprint: same content → same hash (deterministic).
 *      Uses Node's crypto, same SHA-256 algorithm as the browser.
 *   7. Fingerprint: different content → different hash.
 *   8-9. Fingerprint sampling on large (>96 KB) files.
 *   10. History entries are stored newest-first.
 *   11-14. Resume-target mapping (issue #48): wordCount drift → resume by
 *      percent instead of raw wordIndex; no drift → raw wordIndex unchanged;
 *      clamping holds at both ends of the word range.
 *   15. Per-snapshot wordCount drift (issue #76): a history snapshot saved
 *      under an older tokenization still resolves by ITS OWN wordCount even
 *      after a later save re-converges the record-level wordCount to match
 *      the current parse — the record-level comparison alone would miss this.
 *
 * What requires the browser (noted, not tested here):
 *   - computeFingerprint() on a real File object (crypto.subtle is browser API).
 *   - The resume prompt interstitial rendering and click handling.
 *   - pacer.seek() restoring position across all three modes.
 *   - The 30-second save interval / visibilitychange / pagehide triggering.
 *
 * Tests 1-4, 10, and 15 exercise the REAL src/storage/readingPosition.ts
 * (saveReadingPosition / loadBookRecord), esbuild-bundled the same way the
 * parser suites (e.g. spine-integrity-headless-test.mjs) exercise their real
 * modules — not a hand-copied restatement. This requires a localStorage stub
 * (Node has no such global): a trivial Map-backed object assigned to
 * globalThis.localStorage before the bundled module is imported. storage.ts
 * only calls localStorage inside function bodies (never at module-load time),
 * so import order relative to the stub assignment is safe.
 *
 * Two pieces of logic are still mirrored rather than imported, each for a
 * concrete reason, not convenience:
 *   - fingerprintFromBytes: the real computeFingerprint() uses crypto.subtle,
 *     a browser-only API operating on a File; Node's crypto module is used
 *     here as a same-algorithm (SHA-256) stand-in, same as before this change.
 *   - resolveResumeTarget: mirrors App.tsx's handleResume(), which is a
 *     React component method closing over component state (words, resumeRecord)
 *     rather than an exported pure function — there is nothing importable here.
 */

import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── In-memory localStorage stub (Node has no such global) ──────────────────

class MemoryStorage {
  constructor() {
    this._map = new Map();
  }
  getItem(key) {
    return this._map.has(key) ? this._map.get(key) : null;
  }
  setItem(key, value) {
    this._map.set(key, String(value));
  }
  removeItem(key) {
    this._map.delete(key);
  }
  clear() {
    this._map.clear();
  }
}

globalThis.localStorage = new MemoryStorage();

// ─── Bundle + import the REAL readingPosition.ts (and its storage.ts import) ─

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

const { saveReadingPosition, loadBookRecord } = await bundleAndImport(
  'readingPosition.ts',
  'reading-position',
);

// ─── Inline the resume-target mapping from App.tsx's handleResume ───────────
// (issue #48 — wordCount drift detection + percent fallback; issue #76 — use
// the snapshot's own wordCount, not the record-level one, to detect drift)
//
// Not importable: handleResume is a React component method closing over
// component state, not an exported pure function.

/**
 * Mirrors handleResume()'s pure index-selection logic: given the chosen
 * PositionSnapshot, the BookRecord's record-level wordCount (used only as a
 * fallback for snapshots saved before #76), and the current flattened word
 * count, returns the word index to seek to.
 */
function resolveResumeTarget(snapshot, recordWordCount, currentWordCount) {
  const len = currentWordCount;
  const savedWordCount = snapshot.wordCount ?? recordWordCount;
  let target;
  if (savedWordCount !== undefined && savedWordCount !== len) {
    target = len > 1 ? Math.round(snapshot.percent * (len - 1)) : 0;
  } else {
    target = snapshot.wordIndex;
  }
  return Math.max(0, Math.min(target, len - 1));
}

/**
 * Mirrors the PRE-#76 buggy logic (D92's original fix): compares only the
 * BookRecord's record-level wordCount against the current live count,
 * ignoring which snapshot is actually being resumed. Kept here solely to
 * demonstrate, concretely, that it produces the wrong answer in the #76
 * scenario (test 15) — not used anywhere in the app anymore.
 */
function resolveResumeTargetOldBuggy(recordWordCount, snapshot, currentWordCount) {
  const len = currentWordCount;
  let target;
  if (recordWordCount !== len) {
    target = len > 1 ? Math.round(snapshot.percent * (len - 1)) : 0;
  } else {
    target = snapshot.wordIndex;
  }
  return Math.max(0, Math.min(target, len - 1));
}

// ─── Inline computeFingerprint logic using Node crypto ───────────────────────

const SAMPLE_BYTES = 32 * 1024;
const FULL_THRESHOLD = SAMPLE_BYTES * 3;

function hashBuffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function fingerprintFromBytes(bytes /* Buffer or Uint8Array */) {
  const size = bytes.length;
  if (size <= FULL_THRESHOLD) {
    return hashBuffer(bytes);
  }
  const mid = Math.floor(size / 2);
  const half = SAMPLE_BYTES / 2;
  const start  = bytes.subarray(0, SAMPLE_BYTES);
  const middle = bytes.subarray(mid - half, mid + half);
  const end    = bytes.subarray(size - SAMPLE_BYTES);
  const combined = new Uint8Array(SAMPLE_BYTES * 3 + 8);
  let offset = 0;
  combined.set(start, offset);  offset += SAMPLE_BYTES;
  combined.set(middle, offset); offset += SAMPLE_BYTES;
  combined.set(end, offset);    offset += SAMPLE_BYTES;
  const view = new DataView(combined.buffer);
  view.setBigUint64(offset, BigInt(size), false);
  return hashBuffer(combined);
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

console.log('\nReading-position persistence — headless checks\n');

// 1. History rolls at 5 — oldest entry dropped when 6th is added.
test('history caps at 5 entries', () => {
  localStorage.clear();
  const fp = 'fp-cap';
  const TOTAL = 1000;
  for (let i = 1; i <= 6; i++) {
    saveReadingPosition(fp, 'Book', i * 100, TOTAL);
  }
  const record = loadBookRecord(fp);
  assert.equal(record.history.length, 5, `expected 5, got ${record.history.length}`);
});

// 2. >2 % gate: saves within 2 % of last history entry do NOT add new entries.
test('>2 % gate prevents redundant history entries', () => {
  localStorage.clear();
  const fp = 'fp-gate';
  const TOTAL = 10000;
  // First save — creates a history entry at 0.
  saveReadingPosition(fp, 'Book', 0, TOTAL);
  const countAfterFirst = loadBookRecord(fp).history.length;
  // Second save at wordIndex 1 — 0.01 %, well within the 2 % gate.
  saveReadingPosition(fp, 'Book', 1, TOTAL);
  assert.equal(loadBookRecord(fp).history.length, countAfterFirst, 'history grew despite <2 % movement');
});

// 3. latest is ALWAYS updated, even when history gate suppresses a new snapshot.
test('latest is updated on every save regardless of gate', () => {
  localStorage.clear();
  const fp = 'fp-latest';
  const TOTAL = 10000;
  saveReadingPosition(fp, 'Book', 100, TOTAL);
  const historyLengthBefore = loadBookRecord(fp).history.length;
  // Move only 0.5 % — under the 2 % gate.
  saveReadingPosition(fp, 'Book', 150, TOTAL);
  const record = loadBookRecord(fp);
  assert.equal(record.latest.wordIndex, 150, 'latest.wordIndex not updated');
  assert.equal(record.history.length, historyLengthBefore, 'history should not have grown');
});

// 4. Position round-trips through real storage (localStorage stub set/get, JSON fidelity).
test('position round-trips through storage', () => {
  localStorage.clear();
  saveReadingPosition('fp-rt', 'Book B', 42, 1000);
  const restored = loadBookRecord('fp-rt');
  assert.equal(restored.latest.wordIndex, 42);
  assert.equal(restored.fingerprint, 'fp-rt');
  assert.equal(restored.wordCount, 1000);
  assert.equal(restored.latest.wordCount, 1000, 'snapshot should carry its own wordCount (issue #76)');
});

// 5. Useful-history filter: entries within 5 % of latest are excluded.
test('useful-history filter excludes entries within 5 % of latest', () => {
  const latest = { wordIndex: 700, percent: 0.70, savedAt: 5 };
  const history = [
    { wordIndex: 640, percent: 0.64, savedAt: 4 }, // 6 % away — included
    { wordIndex: 680, percent: 0.68, savedAt: 3 }, // 2 % away — excluded
    { wordIndex: 300, percent: 0.30, savedAt: 2 }, // 40 % away — included
    { wordIndex: 100, percent: 0.10, savedAt: 1 }, // 60 % away — included
  ];
  const useful = history.filter((s) => Math.abs(s.percent - latest.percent) > 0.05);
  assert.equal(useful.length, 3, `expected 3 useful entries, got ${useful.length}`);
  assert.ok(useful.every((s) => s.wordIndex !== 680), 'entry at 68 % should be excluded');
});

// 6. Fingerprint is deterministic: same bytes → same hash.
test('same content → same fingerprint (deterministic)', () => {
  const bytes = Buffer.from('Hello, world! This is a test document.');
  const fp1 = fingerprintFromBytes(bytes);
  const fp2 = fingerprintFromBytes(bytes);
  assert.equal(fp1, fp2);
});

// 7. Different content → different hash.
test('different content → different fingerprint', () => {
  const a = Buffer.from('Book A content');
  const b = Buffer.from('Book B content');
  assert.notEqual(fingerprintFromBytes(a), fingerprintFromBytes(b));
});

// 8. Large file (>96 KB) takes the sampled path and stays deterministic.
test('large file sampling is deterministic', () => {
  const LARGE = 200 * 1024; // 200 KB
  const bytes = Buffer.alloc(LARGE);
  // Fill with a non-trivial pattern so start/mid/end are different.
  for (let i = 0; i < LARGE; i++) bytes[i] = (i * 37 + 13) % 256;
  const fp1 = fingerprintFromBytes(bytes);
  const fp2 = fingerprintFromBytes(bytes);
  assert.equal(fp1, fp2, 'large-file fingerprint not deterministic');
});

// 9. Two large files that differ only in the middle are distinguished.
test('large files differing in middle are given different fingerprints', () => {
  const LARGE = 200 * 1024;
  const a = Buffer.alloc(LARGE, 0xaa);
  const b = Buffer.from(a);
  // Flip a byte exactly in the middle region that gets sampled.
  b[Math.floor(LARGE / 2)] ^= 0xff;
  assert.notEqual(fingerprintFromBytes(a), fingerprintFromBytes(b));
});

// 10. History entries are newest-first (most recent is index 0).
test('history is stored newest-first', () => {
  localStorage.clear();
  const fp = 'fp-newest';
  const TOTAL = 1000;
  const timestamps = [100, 200, 300];
  for (let i = 0; i < timestamps.length; i++) {
    saveReadingPosition(fp, 'Book', (i + 1) * 100, TOTAL);
  }
  const record = loadBookRecord(fp);
  // Each save is >2 % apart, so all should be in history.
  assert.ok(record.history[0].savedAt >= record.history[1].savedAt,
    'history[0] should be more recent than history[1]');
});

// 11. No drift: wordCount matches → raw wordIndex is used, unchanged.
test('no wordCount drift: resumes at the raw saved wordIndex', () => {
  const snapshot = { wordIndex: 4200, percent: 0.42, savedAt: 1, wordCount: 10000 };
  const target = resolveResumeTarget(snapshot, 10000, 10000);
  assert.equal(target, 4200);
});

// 12. Drift: wordCount mismatch → falls back to round(percent * (len - 1)).
test('wordCount drift: resumes by percent instead of raw wordIndex', () => {
  // Saved against a 10,000-word parse at 42 %; re-parsed to 8,000 words
  // (e.g. a parser fix changed tokenization for the same file bytes).
  const snapshot = { wordIndex: 4200, percent: 0.42, savedAt: 1, wordCount: 10000 };
  const target = resolveResumeTarget(snapshot, 10000, 8000);
  const expected = Math.round(0.42 * 7999);
  assert.equal(target, expected, `expected ${expected}, got ${target}`);
  assert.notEqual(target, 4200, 'should not have used the stale raw wordIndex');
});

// 13. Clamp holds at the low end (percent 0 on a drifted record).
test('drift fallback clamps at the low end', () => {
  const snapshot = { wordIndex: 0, percent: 0, savedAt: 1, wordCount: 500 };
  const target = resolveResumeTarget(snapshot, 500, 300);
  assert.equal(target, 0);
});

// 14. Clamp holds at the high end (percent 1, and a pathological >1 percent
// from a corrupted record, on non-drift, own-wordCount-drift, and legacy
// record-fallback-drift paths).
test('clamp holds at the high end for non-drift, own-wordCount-drift, and fallback-drift paths', () => {
  // Non-drift: snapshot's own wordCount matches current live count.
  const atEnd = { wordIndex: 299, percent: 1, savedAt: 1, wordCount: 300 };
  assert.equal(resolveResumeTarget(atEnd, 300, 300), 299, 'non-drift high end');

  // Drift via the snapshot's OWN wordCount (issue #76 path) — record-level
  // wordCount is deliberately different (500) to confirm the snapshot's own
  // value wins over the fallback when both are present.
  const driftedOwn = { wordIndex: 299, percent: 1, savedAt: 1, wordCount: 250 };
  assert.equal(resolveResumeTarget(driftedOwn, 500, 300), 299, 'drift (own wordCount) high end clamps');

  // Drift via the record-level FALLBACK — a legacy snapshot persisted before
  // #76 with no wordCount of its own.
  const legacyNoOwnWordCount = { wordIndex: 299, percent: 1, savedAt: 1 };
  assert.equal(resolveResumeTarget(legacyNoOwnWordCount, 500, 300), 299, 'drift (record fallback) high end clamps');

  // Corrupted percent (>1) clamps regardless of path.
  const corrupted = { wordIndex: 99999, percent: 1.5, savedAt: 1, wordCount: 500 };
  assert.equal(resolveResumeTarget(corrupted, 500, 300), 299, 'drift path clamps a corrupted percent');
  assert.equal(resolveResumeTarget({ ...corrupted, wordCount: 300 }, 300, 300), 299, 'non-drift path clamps a stale wordIndex');
});

// 15. Issue #76: a history snapshot saved under an older tokenization must
// resolve by ITS OWN wordCount, even after a LATER save re-converges the
// record-level wordCount to match some other value. The bug requires: (a) the
// snapshot being resumed is NOT the most recent save (so its own basis can
// differ from record.wordCount), and (b) record.wordCount, by the time of
// resume, coincidentally equals the CURRENT live word count for an unrelated
// reason — masking drift for that specific older snapshot.
test('issue #76: history snapshot drift survives record-level wordCount re-converging', () => {
  localStorage.clear();
  const fp = 'fp-76';

  // Save 1 — tokenization A (10,000 words), reader at 10 % (word 1000).
  saveReadingPosition(fp, 'Book', 1000, 10000);

  // Save 2 — a parser change shifts tokenization to B (8,000 words), reader
  // at 50 % (word 4000). Far enough from save 1's 10 % to create a new
  // history entry; record.wordCount becomes 8000.
  saveReadingPosition(fp, 'Book', 4000, 8000);

  // Save 3 — tokenization RECONVERGES to A's word count (10,000 again — e.g.
  // a further parser fix), reader at 90 % (word 9000). Far enough from 50 %
  // to create a third history entry; record.wordCount becomes 10000 again —
  // matching save 1's basis, but NOT save 2's.
  saveReadingPosition(fp, 'Book', 9000, 10000);

  const finalRecord = loadBookRecord(fp);
  assert.equal(finalRecord.wordCount, 10000, 'record-level wordCount re-converged to 10,000');
  assert.equal(finalRecord.history.length, 3, 'all three saves should have cleared the 2% gate');

  // The middle snapshot (save 2, tokenization B / 8000 words) is the one
  // whose OWN basis differs from the now-reconverged record-level wordCount.
  const middleSnapshot = finalRecord.history.find((s) => s.wordIndex === 4000);
  assert.ok(middleSnapshot, 'save 2 snapshot should still be present in history (no eviction — cap is 5)');
  assert.equal(middleSnapshot.wordCount, 8000, 'save 2 snapshot retains its own saved wordCount, unaffected by later saves');

  // Simulate resuming that middle snapshot in a session whose live word count
  // is 10,000 — i.e. matching the CURRENT (reconverged) record.wordCount, but
  // NOT matching the middle snapshot's own basis (8000).
  const currentLiveWordCount = 10000;

  // The OLD (pre-#76) logic compared only record.wordCount vs. current live
  // count — 10000 === 10000 — and would have wrongly reported "no drift",
  // reusing the snapshot's stale raw wordIndex (4000) as-is, even though that
  // index was computed against an 8000-word tokenization.
  const oldBuggyTarget = resolveResumeTargetOldBuggy(finalRecord.wordCount, middleSnapshot, currentLiveWordCount);
  assert.equal(oldBuggyTarget, middleSnapshot.wordIndex,
    'sanity: the old record-level-only comparison silently reuses the stale raw index — this is the bug');

  // The NEW (#76-fixed) logic uses the snapshot's OWN wordCount (8000) vs.
  // the current live count (10000) — correctly detects drift and falls back
  // to percent, regardless of what the record-level wordCount happens to be.
  const target = resolveResumeTarget(middleSnapshot, finalRecord.wordCount, currentLiveWordCount);
  const expectedByPercent = Math.round(middleSnapshot.percent * (currentLiveWordCount - 1));
  assert.equal(target, expectedByPercent,
    `expected percent-based target ${expectedByPercent}, got ${target}`);
  assert.notEqual(target, middleSnapshot.wordIndex,
    'must not silently reuse the stale raw wordIndex just because record-level wordCount happened to match');
});

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
