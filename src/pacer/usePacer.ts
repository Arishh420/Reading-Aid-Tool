import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Word } from '../model/types';

/**
 * Pacer core (§7.2), reworked for performance (perf hardening pass).
 *
 * The current word index is the single source of truth, but it is held in a
 * **ref** and broadcast through a tiny pub/sub — NOT React state. This keeps the
 * pacer off React's reconciliation path: the document tree never re-renders on a
 * tick. Consumers that need the live index (highlight overlay, auto-scroll,
 * progress bar) subscribe and update the DOM imperatively.
 *
 * Timing uses requestAnimationFrame with a time accumulator so WPM changes apply
 * immediately. The accumulator advances **at most one word per frame** (the
 * backlog is capped), guaranteeing every word is actually painted — no visual
 * skipping under a transient slow frame.
 */

/** First word-like token at or after `from`. -1 if none. */
export function firstWordlikeFrom(words: Word[], from: number): number {
  for (let i = Math.max(0, from); i < words.length; i++) {
    if (words[i].isWordlike) return i;
  }
  return -1;
}

/** Last word-like token at or before `from`. -1 if none. */
function lastWordlikeUpTo(words: Word[], from: number): number {
  for (let i = Math.min(words.length - 1, from); i >= 0; i--) {
    if (words[i].isWordlike) return i;
  }
  return -1;
}

/** Snap an arbitrary target index to the nearest word-like token. */
function nearestWordlike(words: Word[], target: number): number {
  if (words.length === 0) return -1;
  const clamped = Math.max(0, Math.min(words.length - 1, target));
  if (words[clamped].isWordlike) return clamped;
  const fwd = firstWordlikeFrom(words, clamped);
  return fwd !== -1 ? fwd : lastWordlikeUpTo(words, clamped);
}

export type IndexListener = (index: number) => void;

export interface PacerApi {
  /** Live current word index. Read in subscribers; not React state. */
  indexRef: React.MutableRefObject<number>;
  playing: boolean;
  /** True when there is no further word-like token to advance to. */
  atEnd: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
  /** Seek to (the nearest word-like token of) an index. */
  seek: (target: number) => void;
  /** Subscribe to index changes; returns an unsubscribe fn. */
  subscribe: (listener: IndexListener) => () => void;
}

export interface PacerOptions {
  /** Per-flat-index dwell multipliers (see buildDwellMultipliers). */
  dwell?: number[];
  /** When true, apply dwell multipliers; otherwise pure metronomic pacing. */
  naturalPauses?: boolean;
  /** Word-like tokens advanced per step (Chunk mode). Default 1. */
  chunkSize?: number;
}

export function usePacer(words: Word[], wpm: number, options: PacerOptions = {}): PacerApi {
  const [playing, setPlaying] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  // Live values for the rAF loop and imperative consumers.
  const wpmRef = useRef(wpm);
  wpmRef.current = wpm;
  const wordsRef = useRef(words);
  wordsRef.current = words;
  const dwellRef = useRef(options.dwell);
  dwellRef.current = options.dwell;
  const naturalPausesRef = useRef(options.naturalPauses ?? false);
  naturalPausesRef.current = options.naturalPauses ?? false;
  const chunkSizeRef = useRef(options.chunkSize ?? 1);
  chunkSizeRef.current = Math.max(1, options.chunkSize ?? 1);
  const indexRef = useRef(Math.max(0, firstWordlikeFrom(words, 0)));

  const listenersRef = useRef(new Set<IndexListener>());
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const accRef = useRef(0);
  const atEndRef = useRef(false);

  const subscribe = useCallback((listener: IndexListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  // Commit a new index: update the ref and notify subscribers imperatively.
  // The ONLY React state touched on the hot path is atEnd, and only when it
  // actually flips — so a normal tick triggers zero re-renders.
  const commit = useCallback((next: number) => {
    indexRef.current = next;
    const ended = firstWordlikeFrom(wordsRef.current, next + 1) === -1;
    if (ended !== atEndRef.current) {
      atEndRef.current = ended;
      setAtEnd(ended);
    }
    listenersRef.current.forEach((cb) => cb(next));
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const tick = useCallback(
    (now: number) => {
      const w = wordsRef.current;
      const msPerWord = 60000 / wpmRef.current;
      accRef.current += now - lastRef.current;
      lastRef.current = now;

      // A step advances by `chunkSize` word-like tokens (Chunk mode); flowing /
      // RSVP use size 1. `last` is the final word of the current chunk — its
      // trailing-punctuation dwell governs the pause, and effective WPM stays
      // consistent by scaling the threshold by the chunk size.
      const size = chunkSizeRef.current;
      let last = indexRef.current;
      for (let k = 1; k < size; k++) {
        const nx = firstWordlikeFrom(w, last + 1);
        if (nx === -1) break;
        last = nx;
      }
      const mult = naturalPausesRef.current ? dwellRef.current?.[last] ?? 1 : 1;
      const threshold = msPerWord * size * mult;

      if (accRef.current >= threshold) {
        const next = firstWordlikeFrom(w, last + 1);
        if (next === -1) {
          accRef.current = 0;
          setPlaying(false);
          return;
        }
        commit(next);
        // Advance at most one step per frame; never bank more than one chunk of
        // backlog, so a slow frame can't make the highlight jump.
        accRef.current = Math.min(accRef.current - threshold, msPerWord * size);
      }

      rafRef.current = requestAnimationFrame(tick);
    },
    [commit],
  );

  // Start/stop the loop purely in response to `playing`.
  useEffect(() => {
    if (!playing) {
      stopLoop();
      return;
    }
    lastRef.current = performance.now();
    accRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
    return stopLoop;
  }, [playing, tick, stopLoop]);

  // Reset when the document (word list) changes.
  useEffect(() => {
    setPlaying(false);
    accRef.current = 0;
    commit(Math.max(0, firstWordlikeFrom(words, 0)));
  }, [words, commit]);

  const play = useCallback(() => {
    if (firstWordlikeFrom(wordsRef.current, indexRef.current + 1) === -1) return;
    setPlaying(true);
  }, []);

  const pause = useCallback(() => setPlaying(false), []);

  const toggle = useCallback(() => {
    setPlaying((p) => {
      if (p) return false;
      return firstWordlikeFrom(wordsRef.current, indexRef.current + 1) !== -1;
    });
  }, []);

  const restart = useCallback(() => {
    accRef.current = 0;
    commit(Math.max(0, firstWordlikeFrom(wordsRef.current, 0)));
  }, [commit]);

  const seek = useCallback(
    (target: number) => {
      const snapped = nearestWordlike(wordsRef.current, target);
      if (snapped === -1) return;
      accRef.current = 0;
      commit(snapped);
    },
    [commit],
  );

  // Memoize the returned object so its identity is stable across renders and
  // only changes when `playing`/`atEnd` actually flip (the callbacks and
  // indexRef are already stable). Consumers whose effects depend on `pacer`
  // (e.g. the context strip's subscription) then don't re-run on every unrelated
  // parent render — WPM changes, settings toggles, etc.
  return useMemo(
    () => ({ indexRef, playing, atEnd, play, pause, toggle, restart, seek, subscribe }),
    [playing, atEnd, play, pause, toggle, restart, seek, subscribe],
  );
}
