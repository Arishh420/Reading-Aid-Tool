import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { Document, Word } from '../../model/types';
import type { BionicSettings } from '../../ui/Settings';
import { Reader, type ReaderHandle } from '../../reader/Reader';
import { firstWordlikeFrom, type PacerApi } from '../usePacer';
import { LINE_EPSILON, scrollWordToBand } from './scrollHelpers';

/**
 * Flowing Highlight mode (§7.3) — the priority experience, reworked for the
 * perf pass.
 *
 * The Reader renders the text once (virtualized, never re-rendered per tick).
 * This component owns a single absolutely-positioned overlay element that
 * GLIDES to each active word's rect (CSS transition on transform/size), driven
 * imperatively by the pacer subscription. It also marks a few "lead" words and
 * auto-scrolls the pane so the active line stays ~40% from the top — all
 * measured against the same scroll container as the virtualizer.
 */

export interface FlowingSettings {
  /** Word-like tokens highlighted ahead of the current word (0 = none). */
  lead: number;
}

export const DEFAULT_FLOWING: FlowingSettings = { lead: 1 };

interface FlowingHighlightProps {
  document: Document;
  words: Word[];
  bionic: BionicSettings;
  pacer: PacerApi;
  wpm: number;
  settings: FlowingSettings;
  /** Changes when reader typography (font size / line width) changes layout. */
  layoutKey: string;
  onSeekWord: (index: number) => void;
}

export function FlowingHighlight({
  document,
  words,
  bionic,
  pacer,
  wpm,
  settings,
  layoutKey,
  onSeekWord,
}: FlowingHighlightProps) {
  const readerRef = useRef<ReaderHandle>(null);

  // Live values read inside the imperative apply() without re-subscribing.
  const wpmRef = useRef(wpm);
  wpmRef.current = wpm;
  const leadRef = useRef(settings.lead);
  leadRef.current = settings.lead;
  const wordsRef = useRef(words);
  wordsRef.current = words;

  const leadElsRef = useRef<HTMLElement[]>([]);
  const lineTopRef = useRef<number | null>(null);

  // Clear + reassign the `pacer-lead` classes for the `lead` word-like spans
  // after `index`. Pure DOM class bookkeeping — no scroll side effects — so
  // it's safe to run from both the pacer-driven apply() and the scroll-driven
  // onRangeChange path.
  const updateLeadClasses = useCallback((handle: ReaderHandle, index: number) => {
    for (const prev of leadElsRef.current) prev.classList.remove('pacer-lead');
    leadElsRef.current = [];
    let i = index;
    for (let c = 0; c < leadRef.current; c++) {
      const n = firstWordlikeFrom(wordsRef.current, i + 1);
      if (n === -1) break;
      i = n;
      const le = handle.wordEl(n);
      if (le) {
        le.classList.add('pacer-lead');
        leadElsRef.current.push(le);
      }
    }
  }, []);

  const apply = useCallback(
    (index: number, animate: boolean, attempt = 0) => {
      const handle = readerRef.current;
      if (!handle) return;
      const { contentEl: content, overlayEl: overlay, scrollEl: scroll } = handle;
      if (!content || !overlay || !scroll) return;

      const el = handle.wordEl(index);
      if (!el) {
        // Off-window (e.g. a far seek before scroll settles): bring it in, retry.
        // Pacer-driven only (tick/seek/restart) — never reached from onRangeChange.
        if (attempt > 8) return;
        handle.scrollToWord(index);
        requestAnimationFrame(() => apply(index, animate, attempt + 1));
        return;
      }

      const cRect = content.getBoundingClientRect();
      const wRect = el.getBoundingClientRect();
      const top = wRect.top - cRect.top;
      const left = wRect.left - cRect.left;

      const msPerWord = 60000 / wpmRef.current;
      const d = Math.max(40, Math.min(180, msPerWord * 0.6));
      overlay.style.transition = animate
        ? `transform ${d}ms ease-out, width ${d}ms ease-out, height ${d}ms ease-out`
        : 'none';
      overlay.style.transform = `translate(${left}px, ${top}px)`;
      overlay.style.width = `${wRect.width}px`;
      overlay.style.height = `${wRect.height}px`;
      overlay.style.opacity = '1';

      updateLeadClasses(handle, index);

      // Auto-scroll only when the active word moves to a new line. Pacer-driven
      // only — never reached from onRangeChange, so a manual scroll never fights
      // this re-center.
      const firstPlacement = lineTopRef.current === null;
      if (firstPlacement || Math.abs(top - lineTopRef.current!) > LINE_EPSILON) {
        scrollWordToBand(scroll, el, !firstPlacement);
      }
      lineTopRef.current = top;
    },
    [updateLeadClasses],
  );

  // Re-apply lead classes to whatever the virtualizer currently has mounted,
  // after it mounts a new span set (scroll — manual or programmatic). This is
  // the #17 fix: it must NEVER touch scroll (no scrollWordToBand, no
  // scrollToWord) so a manual scroll is never fought. Overlay position doesn't
  // need updating here — it's a plain `.reader-content` child, not part of the
  // virtual item list, so it survives remounts untouched (see FINDINGS F19).
  // Stable identity (empty transitive deps) — Reader's memo is never broken.
  const onRangeChange = useCallback(
    () => {
      const handle = readerRef.current;
      if (!handle) return;
      updateLeadClasses(handle, pacer.indexRef.current);
    },
    [updateLeadClasses], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Subscribe to the pacer; reposition the overlay imperatively on each word.
  // Depends on pacer.subscribe (stable), not `pacer` itself — usePacer's
  // memoized return only changes identity when playing/atEnd flip (D56),
  // which would otherwise re-subscribe on every play/pause for no reason.
  useEffect(() => pacer.subscribe((i) => apply(i, true)), [pacer.subscribe, apply]);

  // Place the overlay at the start when the document changes (reset line track).
  // Depends on pacer.indexRef (stable ref object) — see subscribe effect above.
  useLayoutEffect(() => {
    lineTopRef.current = null;
    const raf = requestAnimationFrame(() =>
      apply(pacer.indexRef.current, false),
    );
    return () => cancelAnimationFrame(raf);
  }, [document, pacer.indexRef, apply]);

  // Reposition (no scroll reset) when wrapping/lead/typography can change layout.
  // Depends on pacer.indexRef (stable ref object) — see subscribe effect above.
  useLayoutEffect(() => {
    apply(pacer.indexRef.current, false);
  }, [bionic, settings.lead, layoutKey, pacer.indexRef, apply]);

  // Keep the overlay glued through viewport resizes.
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
