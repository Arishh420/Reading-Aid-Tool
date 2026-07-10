/**
 * Reading-position persistence (issue #6).
 *
 * Two distinct layers:
 *   latest  — updated on every save trigger (30 s interval / visibilitychange /
 *             pagehide). Always reflects the most recent position. This is the
 *             primary resume bookmark.
 *   history — a rolling log of up to 5 snapshots, each appended only when the
 *             position has moved >2 % from the previous history entry. The >2 %
 *             gate applies ONLY to history — it must never delay updating latest.
 *
 * Key per book: storageGet/Set("pos:{fingerprint}") via the shared wrapper,
 * which prefixes with "readingaid_v1:".
 */

import { storageGet, storageSet } from './storage';

export interface PositionSnapshot {
  wordIndex: number;
  /**
   * 0–1. Display-only when wordCount matches on restore. If wordCount has
   * drifted (re-tokenization since save), this becomes the source of truth
   * the resume index is recomputed from, not wordIndex (issue #48).
   */
  percent: number;
  savedAt: number; // epoch ms
}

export interface BookRecord {
  fingerprint: string;
  title: string;
  wordCount: number;
  /** Primary resume bookmark — updated on every save, never gated. */
  latest: PositionSnapshot;
  /** Recovery log — newest entry first, max 5. Gated to >2 % movement. */
  history: PositionSnapshot[];
}

function recordKey(fingerprint: string): string {
  return `pos:${fingerprint}`;
}

export function loadBookRecord(fingerprint: string): BookRecord | null {
  return storageGet<BookRecord>(recordKey(fingerprint));
}

/**
 * Persist the current reading position for a book.
 *
 * latest is ALWAYS written — it is the resume bookmark and must be current.
 * A new history entry is appended only when the position has shifted >2 % from
 * the most recent history snapshot, capping the log at 5 entries (oldest dropped).
 */
export function saveReadingPosition(
  fingerprint: string,
  title: string,
  wordIndex: number,
  wordCount: number,
): void {
  const percent = wordCount > 1 ? wordIndex / (wordCount - 1) : 0;
  const snapshot: PositionSnapshot = { wordIndex, percent, savedAt: Date.now() };

  const existing = loadBookRecord(fingerprint);
  let history = existing?.history ?? [];

  // Gate: only push a history entry when position moved more than 2 %.
  const lastHistoryPercent = history.length > 0 ? history[0].percent : -Infinity;
  if (Math.abs(percent - lastHistoryPercent) > 0.02) {
    history = [snapshot, ...history].slice(0, 5);
  }

  const record: BookRecord = { fingerprint, title, wordCount, latest: snapshot, history };
  storageSet(recordKey(fingerprint), record);
}
