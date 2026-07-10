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
 *
 * What requires the browser (noted, not tested here):
 *   - computeFingerprint() on a real File object (crypto.subtle is browser API).
 *   - The resume prompt interstitial rendering and click handling.
 *   - pacer.seek() restoring position across all three modes.
 *   - The 30-second save interval / visibilitychange / pagehide triggering.
 */

import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// ─── Inline the logic from storage/readingPosition.ts ────────────────────────
// (We can't import the TS directly in a .mjs headless script without a build
//  step, so we re-implement the pure logic to test it in isolation.)

function makeSnapshot(wordIndex, wordCount, savedAt) {
  const percent = wordCount > 1 ? wordIndex / (wordCount - 1) : 0;
  return { wordIndex, percent, savedAt };
}

/** Mirrors saveReadingPosition() logic. Returns the updated BookRecord. */
function applyPositionSave(existing, fingerprint, title, wordIndex, wordCount, now) {
  const snapshot = makeSnapshot(wordIndex, wordCount, now);
  let history = existing?.history ?? [];
  const lastHistoryPercent = history.length > 0 ? history[0].percent : -Infinity;
  if (Math.abs(snapshot.percent - lastHistoryPercent) > 0.02) {
    history = [snapshot, ...history].slice(0, 5);
  }
  return { fingerprint, title, wordCount, latest: snapshot, history };
}

// ─── Inline the resume-target mapping from App.tsx's handleResume ───────────
// (issue #48 — wordCount drift detection + percent fallback)

/**
 * Mirrors handleResume()'s pure index-selection logic: given the BookRecord's
 * stored wordCount, the chosen PositionSnapshot, and the current flattened
 * word count, returns the word index to seek to.
 */
function resolveResumeTarget(recordWordCount, snapshot, currentWordCount) {
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
  let record = null;
  const TOTAL = 1000;
  for (let i = 1; i <= 6; i++) {
    record = applyPositionSave(record, 'fp', 'Book', i * 100, TOTAL, Date.now() + i);
  }
  assert.equal(record.history.length, 5, `expected 5, got ${record.history.length}`);
});

// 2. >2 % gate: saves within 2 % of last history entry do NOT add new entries.
test('>2 % gate prevents redundant history entries', () => {
  let record = null;
  const TOTAL = 10000;
  // First save — creates a history entry at 0.
  record = applyPositionSave(record, 'fp', 'Book', 0, TOTAL, 1);
  const countAfterFirst = record.history.length;
  // Second save at wordIndex 1 — 0.01 %, well within the 2 % gate.
  record = applyPositionSave(record, 'fp', 'Book', 1, TOTAL, 2);
  assert.equal(record.history.length, countAfterFirst, 'history grew despite <2 % movement');
});

// 3. latest is ALWAYS updated, even when history gate suppresses a new snapshot.
test('latest is updated on every save regardless of gate', () => {
  let record = null;
  const TOTAL = 10000;
  record = applyPositionSave(record, 'fp', 'Book', 100, TOTAL, 1);
  const historyLengthBefore = record.history.length;
  // Move only 0.5 % — under the 2 % gate.
  record = applyPositionSave(record, 'fp', 'Book', 150, TOTAL, 2);
  assert.equal(record.latest.wordIndex, 150, 'latest.wordIndex not updated');
  assert.equal(record.history.length, historyLengthBefore, 'history should not have grown');
});

// 4. Position round-trips through JSON (simulates the localStorage serialize/deserialize).
test('position round-trips through JSON serialisation', () => {
  let record = null;
  record = applyPositionSave(record, 'fp-rt', 'Book B', 42, 1000, 1_700_000_000_000);
  const serialised = JSON.stringify(record);
  const restored = JSON.parse(serialised);
  assert.equal(restored.latest.wordIndex, 42);
  assert.equal(restored.latest.savedAt, 1_700_000_000_000);
  assert.equal(restored.fingerprint, 'fp-rt');
  assert.equal(restored.wordCount, 1000);
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
  let record = null;
  const TOTAL = 1000;
  const timestamps = [100, 200, 300];
  for (let i = 0; i < timestamps.length; i++) {
    record = applyPositionSave(record, 'fp', 'Book', (i + 1) * 100, TOTAL, timestamps[i]);
  }
  // Each save is >2 % apart, so all should be in history.
  assert.ok(record.history[0].savedAt > record.history[1].savedAt,
    'history[0] should be more recent than history[1]');
});

// 11. No drift: wordCount matches → raw wordIndex is used, unchanged.
test('no wordCount drift: resumes at the raw saved wordIndex', () => {
  const snapshot = { wordIndex: 4200, percent: 0.42, savedAt: 1 };
  const target = resolveResumeTarget(10000, snapshot, 10000);
  assert.equal(target, 4200);
});

// 12. Drift: wordCount mismatch → falls back to round(percent * (len - 1)).
test('wordCount drift: resumes by percent instead of raw wordIndex', () => {
  // Saved against a 10,000-word parse at 42 %; re-parsed to 8,000 words
  // (e.g. a parser fix changed tokenization for the same file bytes).
  const snapshot = { wordIndex: 4200, percent: 0.42, savedAt: 1 };
  const target = resolveResumeTarget(10000, snapshot, 8000);
  const expected = Math.round(0.42 * 7999);
  assert.equal(target, expected, `expected ${expected}, got ${target}`);
  assert.notEqual(target, 4200, 'should not have used the stale raw wordIndex');
});

// 13. Clamp holds at the low end (percent 0 on a drifted record).
test('drift fallback clamps at the low end', () => {
  const snapshot = { wordIndex: 0, percent: 0, savedAt: 1 };
  const target = resolveResumeTarget(500, snapshot, 300);
  assert.equal(target, 0);
});

// 14. Clamp holds at the high end (percent 1, and a pathological >1 percent
// from a corrupted record, on both drifted and non-drifted paths).
test('clamp holds at the high end for both drift and non-drift paths', () => {
  const atEnd = { wordIndex: 299, percent: 1, savedAt: 1 };
  assert.equal(resolveResumeTarget(300, atEnd, 300), 299, 'non-drift high end');
  assert.equal(resolveResumeTarget(500, atEnd, 300), 299, 'drift high end');

  const corrupted = { wordIndex: 99999, percent: 1.5, savedAt: 1 };
  assert.equal(resolveResumeTarget(500, corrupted, 300), 299, 'drift path clamps a corrupted percent');
  assert.equal(resolveResumeTarget(300, corrupted, 300), 299, 'non-drift path clamps a stale wordIndex');
});

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
