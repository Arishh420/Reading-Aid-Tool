import { useCallback, useEffect, useRef } from 'react';
import type { Document, Word } from '../../model/types';
import { splitOrp } from '../orp';
import type { PacerApi } from '../usePacer';
import { RsvpContextStrip } from './RsvpContextStrip';

/**
 * RSVP mode (§7.3, M5) — single word flashed at a fixed focal point.
 *
 * Layout: a monospace 3-column grid `2fr auto 3fr`. The middle (auto) column
 * holds the ORP anchor letter; because monospace glyphs are a constant width,
 * that column's width never changes, so the anchor's centre is a fixed x at
 * ~40% (left-of-centre). Pre/post text right/left-aligns against it, extending
 * outward without ever moving the anchor.
 *
 * Reads the shared pacer index, so play/pause/seek/WPM/natural-pauses all
 * apply. Punctuation dwell (clock-level) makes the word linger on commas /
 * periods automatically. The pause cue below makes that dwell *perceptible*: a
 * thin tick under the anchor depletes over the dwell, scaled by its length —
 * gated on Natural pauses, and never touching the anchor letter.
 */

export interface RsvpSettings {
  /** Word font size in rem. */
  fontSize: number;
  /** Show the dim current-paragraph context strip below the word (issue #1). */
  showContext: boolean;
  /** Strip height in context lines (odd: 3/5 — a centered line with equal
   *  context above and below). */
  contextLines: number;
}

export const DEFAULT_RSVP: RsvpSettings = {
  fontSize: 3,
  showContext: true,
  contextLines: 3,
};

interface RsvpProps {
  document: Document;
  words: Word[];
  pacer: PacerApi;
  wpm: number;
  dwell: number[];
  naturalPauses: boolean;
  settings: RsvpSettings;
}

export function Rsvp({
  document,
  words,
  pacer,
  wpm,
  dwell,
  naturalPauses,
  settings,
}: RsvpProps) {
  const preRef = useRef<HTMLSpanElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const postRef = useRef<HTMLSpanElement>(null);
  const tickRef = useRef<HTMLSpanElement>(null);

  const wordsRef = useRef(words);
  wordsRef.current = words;
  const wpmRef = useRef(wpm);
  wpmRef.current = wpm;
  const dwellRef = useRef(dwell);
  dwellRef.current = dwell;
  const naturalRef = useRef(naturalPauses);
  naturalRef.current = naturalPauses;

  const apply = useCallback((index: number) => {
    const word = wordsRef.current[index];
    const { pre, anchor, post } = splitOrp(word ? word.text : '');
    if (preRef.current) preRef.current.textContent = pre;
    if (anchorRef.current) anchorRef.current.textContent = anchor;
    if (postRef.current) postRef.current.textContent = post;

    // Pause cue: deplete a thin tick under the anchor over the dwell. The tick
    // is absolutely positioned and centred on the anchor, so the anchor itself
    // never moves. Width/duration scale with the dwell multiplier.
    const tick = tickRef.current;
    if (!tick) return;
    const mult = naturalRef.current ? dwellRef.current?.[index] ?? 1 : 1;
    if (mult > 1) {
      const dwellMs = (60000 / wpmRef.current) * mult;
      const widthEm = Math.min(2.2, 0.6 * mult);
      tick.style.transition = 'none';
      tick.style.opacity = '0.5';
      tick.style.width = `${widthEm}em`;
      void tick.offsetWidth; // flush, so the deplete animates from full width
      tick.style.transition = `width ${dwellMs}ms linear, opacity ${dwellMs}ms ease-in`;
      tick.style.width = '0em';
      tick.style.opacity = '0';
    } else {
      tick.style.transition = 'none';
      tick.style.width = '0em';
      tick.style.opacity = '0';
    }
  }, []);

  useEffect(() => {
    apply(pacer.indexRef.current);
    return pacer.subscribe(apply);
  }, [pacer, apply]);

  // Re-render the current word if the font size changes the layout.
  useEffect(() => {
    apply(pacer.indexRef.current);
  }, [settings.fontSize, naturalPauses, pacer, apply]);

  return (
    <div className="rsvp-stage" style={{ fontSize: `${settings.fontSize}rem` }}>
      <div className="rsvp-word">
        <span className="rsvp-pre" ref={preRef} />
        <span className="rsvp-anchor">
          <span className="rsvp-anchor-letter" ref={anchorRef} />
          <span className="rsvp-pause-tick" ref={tickRef} aria-hidden="true" />
        </span>
        <span className="rsvp-post" ref={postRef} />
      </div>

      {settings.showContext && (
        <RsvpContextStrip
          document={document}
          pacer={pacer}
          contextLines={settings.contextLines}
        />
      )}
    </div>
  );
}
