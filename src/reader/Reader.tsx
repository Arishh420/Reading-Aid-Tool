import {
  Fragment,
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Block, Document, Word } from '../model/types';
import { buildBlockStarts, blockIndexForWord } from '../model/blocks';
import { BIONIC_RATIO } from './bionic';
import { BionicText } from './BionicText';
import type { BionicSettings } from '../ui/Settings';

/**
 * The Reader is the virtualized reading surface (perf hardening pass).
 *
 * - Block-level windowing via @tanstack/react-virtual, scrolling the reader
 *   PANE (not the window) — so the same element is the scroll container,
 *   overlay coordinate space, and auto-scroll reference.
 * - Memoized and free of any per-tick props: the document tree never re-renders
 *   while the pacer runs. The active-word highlight is an imperative overlay
 *   (see FlowingHighlight), not a React-driven class on 57k spans.
 * - Click-to-seek uses one delegated handler on the pane (data-word-id), not a
 *   closure per word.
 *
 * The imperative handle lets the active pacer mode locate words, scroll to an
 * arbitrary word, and drive the overlay — all without React reconciliation.
 */

export interface ReaderHandle {
  scrollEl: HTMLDivElement | null;
  contentEl: HTMLDivElement | null;
  overlayEl: HTMLDivElement | null;
  /** The mounted span for a flat word index, or null if outside the window. */
  wordEl: (index: number) => HTMLElement | null;
  /** Scroll the pane so the block containing `index` is mounted and centered. */
  scrollToWord: (index: number) => void;
}

interface ReaderProps {
  document: Document;
  bionic: BionicSettings;
  onSeekWord?: (index: number) => void;
  /** Called after layout whenever the virtualizer's mounted item set changes (scroll). */
  onRangeChange?: () => void;
}

const WordSpan = memo(function WordSpan({
  word,
  bionic,
  clickable,
}: {
  word: Word;
  bionic: BionicSettings;
  clickable: boolean;
}) {
  const content =
    bionic.enabled && word.isWordlike ? (
      <BionicText text={word.text} ratio={BIONIC_RATIO[bionic.intensity]} />
    ) : (
      word.text
    );
  return (
    <span className={clickable ? 'word clickable' : 'word'} data-word-id={word.id}>
      {content}
    </span>
  );
});

const BlockView = memo(function BlockView({
  block,
  bionic,
  clickable,
}: {
  block: Block;
  bionic: BionicSettings;
  clickable: boolean;
}) {
  const words = (
    <>
      {block.words.map((word, i) => (
        <Fragment key={word.id}>
          {i > 0 && word.spaceBefore && ' '}
          <WordSpan word={word} bionic={bionic} clickable={clickable} />
        </Fragment>
      ))}
    </>
  );

  if (block.type === 'heading') {
    const level = Math.min(Math.max(block.level ?? 1, 1), 6);
    const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    return <Tag className="reader-heading">{words}</Tag>;
  }
  return <p className="reader-paragraph">{words}</p>;
});

function ReaderInner(
  { document, bionic, onSeekWord, onRangeChange }: ReaderProps,
  ref: React.Ref<ReaderHandle>,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: document.blocks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 6,
    getItemKey: (i) => document.blocks[i].id,
  });

  const blockStarts = useMemo(() => buildBlockStarts(document), [document]);

  const blockForWord = useCallback(
    (wordIndex: number) => blockIndexForWord(blockStarts, wordIndex),
    [blockStarts],
  );

  useImperativeHandle(
    ref,
    (): ReaderHandle => ({
      get scrollEl() {
        return scrollRef.current;
      },
      get contentEl() {
        return contentRef.current;
      },
      get overlayEl() {
        return overlayRef.current;
      },
      wordEl: (index) =>
        contentRef.current?.querySelector<HTMLElement>(`[data-word-id="${index}"]`) ??
        null,
      scrollToWord: (index) =>
        virtualizer.scrollToIndex(blockForWord(index), { align: 'center' }),
    }),
    [virtualizer, blockForWord],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onSeekWord) return;
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-word-id]');
      if (el?.dataset.wordId) onSeekWord(Number(el.dataset.wordId));
    },
    [onSeekWord],
  );

  const items = virtualizer.getVirtualItems();

  // Re-apply imperative highlights (lead/chunk classes) whenever the virtualizer
  // mounts a new set of spans due to scrolling. The callback is stored in a ref
  // so this effect's dep is only [items] — it never fires on pacer ticks.
  const onRangeChangeRef = useRef(onRangeChange);
  onRangeChangeRef.current = onRangeChange;
  useLayoutEffect(() => {
    onRangeChangeRef.current?.();
  }, [items]);

  return (
    <div className="reader-pane" ref={scrollRef} onClick={handleClick}>
      <div
        className="reader-content"
        ref={contentRef}
        style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
      >
        <div className="pacer-overlay" ref={overlayRef} aria-hidden="true" />
        {items.map((item) => (
          <div
            key={item.key}
            data-index={item.index}
            ref={virtualizer.measureElement}
            className="reader-block-wrap"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${item.start}px)`,
            }}
          >
            <BlockView
              block={document.blocks[item.index]}
              bionic={bionic}
              clickable={!!onSeekWord}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export const Reader = memo(forwardRef<ReaderHandle, ReaderProps>(ReaderInner));
