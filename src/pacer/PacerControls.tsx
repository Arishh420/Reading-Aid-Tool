import { useCallback, useEffect, useRef } from 'react';
import type { PacerApi } from './usePacer';

/**
 * Shared pacer transport (§7.2) + position UI (items 5–6 of the perf pass).
 *
 * Position, progress bar, percentage, and the scrubber all update imperatively
 * from the pacer subscription via refs — they never re-render this component per
 * tick. WPM and the play state are ordinary React state (user-driven, rare).
 * Both WPM and position are typeable, not just draggable.
 */

export const WPM_MIN = 100;
export const WPM_MAX = 1000;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

interface PacerControlsProps {
  pacer: PacerApi;
  /** Total tokens (word-like + punctuation) — scrubber span and % denominator. */
  count: number;
  wpm: number;
  onWpmChange: (wpm: number) => void;
}

export function PacerControls({ pacer, count, wpm, onWpmChange }: PacerControlsProps) {
  const fillRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const scrubRef = useRef<HTMLInputElement>(null);
  const posRef = useRef<HTMLInputElement>(null);

  const update = useCallback(
    (index: number) => {
      const pct = count > 1 ? index / (count - 1) : 0;
      if (fillRef.current) fillRef.current.style.width = `${(pct * 100).toFixed(3)}%`;
      if (pctRef.current) pctRef.current.textContent = `${Math.round(pct * 100)}%`;
      // Don't fight the user while they're dragging/typing into these.
      if (scrubRef.current && document.activeElement !== scrubRef.current) {
        scrubRef.current.value = String(index);
      }
      if (posRef.current && document.activeElement !== posRef.current) {
        posRef.current.value = String(index + 1);
      }
    },
    [count],
  );

  useEffect(() => {
    update(pacer.indexRef.current);
    return pacer.subscribe(update);
  }, [pacer, update]);

  const commitPosition = useCallback(() => {
    if (!posRef.current) return;
    const n = Number(posRef.current.value);
    if (Number.isNaN(n)) return;
    pacer.seek(clamp(Math.round(n) - 1, 0, Math.max(0, count - 1)));
  }, [pacer, count]);

  const onWpmInput = useCallback(
    (raw: string) => {
      if (raw === '') return;
      const n = Number(raw);
      if (Number.isNaN(n)) return;
      onWpmChange(clamp(Math.round(n), WPM_MIN, WPM_MAX));
    },
    [onWpmChange],
  );

  return (
    <div className="pacer-controls">
      <div className="pacer-progressbar" aria-hidden="true">
        <div className="pacer-progressbar-fill" ref={fillRef} />
      </div>

      <div className="pacer-row">
        <div className="pacer-transport">
          <button
            type="button"
            className="pacer-play"
            onClick={pacer.toggle}
            disabled={pacer.atEnd && !pacer.playing}
          >
            {pacer.playing ? '❚❚ Pause' : '▶ Play'}
          </button>
          <button type="button" className="secondary" onClick={pacer.restart}>
            ↺ Restart
          </button>
        </div>

        <input
          ref={scrubRef}
          className="pacer-scrub"
          type="range"
          min={0}
          max={Math.max(0, count - 1)}
          step={1}
          defaultValue={pacer.indexRef.current}
          onChange={(e) => pacer.seek(Number(e.target.value))}
          aria-label="Seek"
        />

        <label className="pacer-field">
          <span className="muted small">Word</span>
          <input
            ref={posRef}
            type="number"
            className="num"
            min={1}
            max={count}
            defaultValue={pacer.indexRef.current + 1}
            onKeyDown={(e) => e.key === 'Enter' && commitPosition()}
            onBlur={commitPosition}
            aria-label="Go to word number"
          />
          <span ref={pctRef} className="pacer-pct muted small">
            0%
          </span>
        </label>

        <label className="pacer-field">
          <span className="muted small">WPM</span>
          <input
            type="range"
            min={WPM_MIN}
            max={WPM_MAX}
            step={10}
            value={wpm}
            onChange={(e) => onWpmChange(Number(e.target.value))}
            aria-label="Words per minute"
          />
          <input
            type="number"
            className="num"
            min={WPM_MIN}
            max={WPM_MAX}
            step={10}
            value={wpm}
            onChange={(e) => onWpmInput(e.target.value)}
            aria-label="Words per minute (exact)"
          />
        </label>
      </div>
    </div>
  );
}
