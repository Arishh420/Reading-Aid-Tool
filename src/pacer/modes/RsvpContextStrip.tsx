import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import type { Document } from '../../model/types';
import { blockIndexForWord, buildBlockStarts } from '../../model/blocks';
import type { PacerApi } from '../usePacer';

/**
 * RSVP context strip (issue #1) — restores the spatial context RSVP removes.
 *
 * The RSVP principle applied to the strip itself: the ACTIVE WORD's line stays
 * pinned on the box's center line, and the paragraph text scrolls continuously
 * underneath it (a `translateY` on the inner content, CSS-transitioned, so lines
 * rise one at a time). Not a page-flip.
 *
 * Off the per-tick render path: an independent pacer subscriber sets the
 * transform + highlight imperatively every word (the transform value only
 * changes on a line change, so within a line there's no motion). A **buffered
 * window** of blocks is rendered so there's context above/below across
 * paragraphs; React re-renders (setState) only when the active block nears a
 * window edge — every few paragraphs, not per word. On a window shift the
 * recenter is instant (imperceptible: the center content is unchanged; only the
 * faded edges differ).
 *
 * The RSVP word/anchor are untouched — the strip is a flex-column sibling below
 * the word (word → em-scaled gap → strip), so it can't shift the word grid.
 * Text stays sharp; the edge fade is an alpha mask, not a blur. Height is
 * adjustable (3/5 context lines) and adapts live; the context font tracks the
 * anchor font so the two read as one unit.
 *
 * Uniform lines: the translate is snapped to the whole-line grid so every
 * visible line is a full line box (no half-clipped "short" line) while the
 * active line stays dead-centre; paragraph breaks are drawn with a zero-height
 * separator (see CSS), so they never steal a text row off the grid.
 */

/** How close (in blocks) the active block may get to a window edge before we shift. */
const EDGE_MARGIN = 2;

interface RsvpContextStripProps {
  document: Document;
  pacer: PacerApi;
  contextLines: number;
}

interface Win {
  start: number;
  end: number;
}

export function RsvpContextStrip({ document, pacer, contextLines }: RsvpContextStripProps) {
  // Pull out the stable members (ref objects + useCallbacks). Depending on these
  // instead of the whole `pacer` object keeps the effects from
  // re-subscribing/re-running on the parent's every render (the returned pacer
  // object is memoized upstream too, but this makes the strip subscribe-once).
  const { subscribe, indexRef, seek } = pacer;

  const blockStarts = useMemo(() => buildBlockStarts(document), [document]);
  const blockStartsRef = useRef(blockStarts);
  blockStartsRef.current = blockStarts;

  // Blocks rendered on each side of the active block: generous, so single-line
  // paragraphs still fill the box and window shifts stay rare.
  const pad = Math.max(3, contextLines);
  const padRef = useRef(pad);
  padRef.current = pad;

  const windowFor = useCallback((activeBlock: number, p: number): Win => ({
    start: Math.max(0, activeBlock - p),
    end: Math.min(blockStartsRef.current.length - 1, activeBlock + p),
  }), []);

  const [win, setWin] = useState<Win>(() =>
    windowFor(blockIndexForWord(blockStarts, indexRef.current), pad),
  );
  const winRef = useRef(win);
  winRef.current = win;

  const outerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeElRef = useRef<HTMLElement | null>(null);

  // Pin the active word's line to the box center line, and move the highlight.
  // animate=false applies it instantly (after a window shift / resize / height
  // change) so a content or size discontinuity doesn't animate.
  const center = useCallback((index: number, animate: boolean) => {
    const outer = outerRef.current;
    const scroll = scrollRef.current;
    if (!outer || !scroll) return;

    const el = scroll.querySelector<HTMLElement>(`[data-word-id="${index}"]`);
    if (el !== activeElRef.current) {
      activeElRef.current?.classList.remove('rsvp-context-active');
      el?.classList.add('rsvp-context-active');
      activeElRef.current = el;
    }
    if (!el) return;

    // Measure with rects against the scroll container, so the offset is
    // independent of the spans' `offsetParent`. (`.rsvp-context-para` is
    // `position: relative` for the break separator, which would otherwise make
    // the paragraph — not the scroll — the offsetParent and corrupt offsetTop.)
    // Read the LIVE translateY from the computed matrix, not a tracked target,
    // so a re-center mid-transition retargets from the actual on-screen position
    // (no jitter when words advance faster than the 350ms glide).
    const cs = getComputedStyle(scroll);
    const line = parseFloat(cs.lineHeight) || 0;
    const currentY =
      cs.transform && cs.transform !== 'none'
        ? new DOMMatrixReadOnly(cs.transform).m42
        : 0;

    const outerRect = outer.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const boxCenter = outerRect.top + outer.clientHeight / 2;
    const elCenter = elRect.top + elRect.height / 2;

    // Then SNAP to the whole-line grid: the ideal offset is an exact multiple of
    // the line box (box height is an odd multiple of it, so the center slot is a
    // whole line), so rounding keeps every visible line a full box while the
    // active line stays dead-centre — no half-clipped "short" line.
    let y = currentY + (boxCenter - elCenter);
    if (line > 0) y = Math.round(y / line) * line;

    if (animate) {
      scroll.style.transition = '';
      scroll.style.transform = `translateY(${y}px)`;
    } else {
      scroll.style.transition = 'none';
      scroll.style.transform = `translateY(${y}px)`;
      void scroll.offsetHeight; // flush, then restore the CSS transition
      scroll.style.transition = '';
    }
  }, []);

  // Subscribe: recenter every word (imperative). Shift the window only when the
  // active block nears an edge — the only setState, every few paragraphs.
  useEffect(() => {
    const onIndex = (index: number) => {
      const ab = blockIndexForWord(blockStartsRef.current, index);
      const w = winRef.current;
      if (ab - w.start < EDGE_MARGIN || w.end - ab < EDGE_MARGIN) {
        const next = windowFor(ab, padRef.current);
        if (next.start !== w.start || next.end !== w.end) {
          setWin(next); // layout effect recenters after the new blocks render
          return;
        }
      }
      center(index, true);
    };
    onIndex(indexRef.current);
    return subscribe(onIndex);
  }, [subscribe, indexRef, center, windowFor]);

  // Re-pick the window when the height setting (pad) or document changes.
  useEffect(() => {
    const ab = blockIndexForWord(blockStartsRef.current, indexRef.current);
    setWin(windowFor(ab, Math.max(3, contextLines)));
  }, [contextLines, document, indexRef, windowFor]);

  // After any content/size change, recenter instantly.
  useLayoutEffect(() => {
    activeElRef.current = null;
    center(indexRef.current, false);
  }, [win, contextLines, document, center, indexRef]);

  // Recenter on size changes (line width, viewport → rewrap).
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const ro = new ResizeObserver(() => center(indexRef.current, false));
    ro.observe(outer);
    return () => ro.disconnect();
  }, [center, indexRef]);

  // Click-to-seek, delegated: one handler on the container walks up to the
  // nearest [data-word-id] (every span has one) and seeks the pacer there —
  // parity with the main reader, and no per-word handlers on the render path.
  // seek() snaps to the nearest word-like token, so clicking punctuation is fine.
  const onSeekClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const el = (e.target as HTMLElement).closest('[data-word-id]');
      const id = el?.getAttribute('data-word-id');
      if (id != null) seek(Number(id));
    },
    [seek],
  );

  const blocks = document.blocks.slice(win.start, win.end + 1);

  return (
    <div
      className="rsvp-context"
      style={{ '--rc-lines': contextLines } as CSSProperties}
      aria-hidden="true"
      ref={outerRef}
      onClick={onSeekClick}
    >
      <div className="rsvp-context-scroll" ref={scrollRef}>
        {blocks.map((block) => (
          <p key={block.id} className="rsvp-context-para">
            {block.words.map((word, i) => (
              <Fragment key={word.id}>
                {i > 0 && word.spaceBefore && ' '}
                <span className="rsvp-context-word" data-word-id={word.id}>
                  {word.text}
                </span>
              </Fragment>
            ))}
          </p>
        ))}
      </div>
    </div>
  );
}
