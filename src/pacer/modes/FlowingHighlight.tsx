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

  const apply = useCallback(
    (index: number, animate: boolean, attempt = 0) => {
      const handle = readerRef.current;
      if (!handle) return;
      const { contentEl: content, overlayEl: overlay, scrollEl: scroll } = handle;
      if (!content || !overlay || !scroll) return;

      const el = handle.wordEl(index);
      if (!el) {
        // Off-window (e.g. a far seek before scroll settles): bring it in, retry.
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

      // Lead words: clear the previous set, mark the next `lead` word-like spans.
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

      // Auto-scroll only when the active word moves to a new line.
      const firstPlacement = lineTopRef.current === null;
      if (firstPlacement || Math.abs(top - lineTopRef.current!) > LINE_EPSILON) {
        scrollWordToBand(scroll, el, !firstPlacement);
      }
      lineTopRef.current = top;
    },
    [],
  );

  // Subscribe to the pacer; reposition the overlay imperatively on each word.
  useEffect(() => pacer.subscribe((i) => apply(i, true)), [pacer, apply]);

  // Place the overlay at the start when the document changes (reset line track).
  useLayoutEffect(() => {
    lineTopRef.current = null;
    const raf = requestAnimationFrame(() =>
      apply(pacer.indexRef.current, false),
    );
    return () => cancelAnimationFrame(raf);
  }, [document, pacer, apply]);

  // Reposition (no scroll reset) when wrapping/lead/typography can change layout.
  useLayoutEffect(() => {
    apply(pacer.indexRef.current, false);
  }, [bionic, settings.lead, layoutKey, pacer, apply]);

  // Keep the overlay glued through viewport resizes.
  useEffect(() => {
    const onResize = () => apply(pacer.indexRef.current, false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pacer, apply]);

  return (
    <Reader
      ref={readerRef}
      document={document}
      bionic={bionic}
      onSeekWord={onSeekWord}
    />
  );
}
