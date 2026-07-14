import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { Document, Word } from '../../model/types';
import type { BionicSettings } from '../../ui/Settings';
import { Reader, type ReaderHandle } from '../../reader/Reader';
import { firstWordlikeFrom, type PacerApi } from '../usePacer';
import { LINE_EPSILON, scrollWordToBand } from './scrollHelpers';

/**
 * Chunk Highlight mode (§7.3, M5) — N words highlighted in place at a time,
 * advancing one chunk per step (the pacer's chunkSize drives the timing).
 *
 * Full text stays laid out in the virtualized Reader; the current chunk's word
 * spans get a highlight class imperatively (a handful of nodes, re-applied each
 * step). Auto-scroll keeps the chunk's first word in the reading band.
 */

export interface ChunkSettings {
  /** Words highlighted (and advanced) per step. */
  chunkSize: number;
}

export const DEFAULT_CHUNK: ChunkSettings = { chunkSize: 3 };

interface ChunkHighlightProps {
  document: Document;
  words: Word[];
  bionic: BionicSettings;
  pacer: PacerApi;
  settings: ChunkSettings;
  /** Changes when reader typography (font size / line width) changes layout. */
  layoutKey: string;
  onSeekWord: (index: number) => void;
}

export function ChunkHighlight({
  document,
  words,
  bionic,
  pacer,
  settings,
  layoutKey,
  onSeekWord,
}: ChunkHighlightProps) {
  const readerRef = useRef<ReaderHandle>(null);
  const wordsRef = useRef(words);
  wordsRef.current = words;
  const sizeRef = useRef(settings.chunkSize);
  sizeRef.current = Math.max(1, settings.chunkSize);
  const highlightedRef = useRef<HTMLElement[]>([]);
  const lineTopRef = useRef<number | null>(null);

  // Clear + reassign the `pacer-chunk` classes for this chunk's word-like
  // indices starting at `index`. Pure DOM class bookkeeping — no scroll side
  // effects — so it's safe to run from both the pacer-driven apply() and the
  // scroll-driven onRangeChange path. Indices with no currently-mounted span
  // are silently skipped (they'll be painted once their block remounts).
  const updateChunkClasses = useCallback((handle: ReaderHandle, index: number) => {
    const idxs: number[] = [index];
    let i = index;
    for (let c = 1; c < sizeRef.current; c++) {
      const n = firstWordlikeFrom(wordsRef.current, i + 1);
      if (n === -1) break;
      i = n;
      idxs.push(n);
    }

    for (const prev of highlightedRef.current) prev.classList.remove('pacer-chunk');
    highlightedRef.current = [];
    for (const j of idxs) {
      const el = handle.wordEl(j);
      if (el) {
        el.classList.add('pacer-chunk');
        highlightedRef.current.push(el);
      }
    }
  }, []);

  const apply = useCallback((index: number, animate: boolean, attempt = 0) => {
    const handle = readerRef.current;
    if (!handle) return;
    const { contentEl: content, scrollEl: scroll } = handle;
    if (!content || !scroll) return;

    const firstEl = handle.wordEl(index);
    if (!firstEl) {
      // Pacer-driven only (tick/seek/restart) — never reached from onRangeChange.
      if (attempt > 8) return;
      handle.scrollToWord(index);
      requestAnimationFrame(() => apply(index, animate, attempt + 1));
      return;
    }

    updateChunkClasses(handle, index);

    // Auto-scroll on line change of the chunk's first word. Pacer-driven only
    // — never reached from onRangeChange, so a manual scroll never fights this
    // re-center.
    const top = firstEl.getBoundingClientRect().top - content.getBoundingClientRect().top;
    if (lineTopRef.current === null || Math.abs(top - lineTopRef.current) > LINE_EPSILON) {
      scrollWordToBand(scroll, firstEl, lineTopRef.current !== null);
    }
    lineTopRef.current = top;
  }, [updateChunkClasses]);

  // Re-apply chunk classes to whatever the virtualizer currently has mounted,
  // after it mounts a new span set (scroll — manual or programmatic). This is
  // the #17 fix: it must NEVER touch scroll (no scrollWordToBand, no
  // scrollToWord) so a manual scroll is never fought. Stable identity (empty
  // transitive deps) — Reader's memo is never broken by it.
  const onRangeChange = useCallback(
    () => {
      const handle = readerRef.current;
      if (!handle) return;
      updateChunkClasses(handle, pacer.indexRef.current);
    },
    [updateChunkClasses], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Depends on pacer.subscribe (stable), not `pacer` itself — usePacer's
  // memoized return only changes identity when playing/atEnd flip (D56),
  // which would otherwise re-subscribe on every play/pause for no reason.
  useEffect(() => pacer.subscribe((i) => apply(i, true)), [pacer.subscribe, apply]);

  // Depends on pacer.indexRef (stable ref object) — see subscribe effect above.
  useLayoutEffect(() => {
    lineTopRef.current = null;
    const raf = requestAnimationFrame(() => apply(pacer.indexRef.current, false));
    return () => cancelAnimationFrame(raf);
  }, [document, pacer.indexRef, apply]);

  // Depends on pacer.indexRef (stable ref object) — see subscribe effect above.
  useLayoutEffect(() => {
    apply(pacer.indexRef.current, false);
  }, [bionic, settings.chunkSize, layoutKey, pacer.indexRef, apply]);

  // Depends on pacer.indexRef (stable ref object) — see subscribe effect above.
  useEffect(() => {
    const onResize = () => apply(pacer.indexRef.current, false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pacer.indexRef, apply]);

  return (
    <Reader
      ref={readerRef}
      document={document}
      bionic={bionic}
      onSeekWord={onSeekWord}
      onRangeChange={onRangeChange}
    />
  );
}
