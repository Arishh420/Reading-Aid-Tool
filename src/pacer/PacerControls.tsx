import { useCallback, useEffect, useRef } from 'react';
import type { PacerApi } from './usePacer';

/**
 * Shared pacer transport (§7.2) + position UI (items 5–6 of the perf pass).
 *
 * Position, progress bar, percentage, and the scrubber all update imperatively
 * from the pacer subscription via refs — they never re-render this component per
 * tick. WPM and the play state are ordinary React state (user-driven, rare).
 * Both WPM and position are typeable, not just draggable.
 *
 * Minimal HUD (issue #38): `compact` swaps to a reduced layout (transport
 * + live WPM slider + read-only progress; scrubber/Word/WPM-number dropped)
 * without unmounting this component, so the imperative subscription above
 * never tears down across the play/pause boundary.
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
  /**
   * Minimal HUD mode (issue #38): drops the scrubber and the WPM/Word number
   * fields, keeping only transport + a live WPM slider + read-only progress.
   * PacerControls stays mounted across this switch — only the JSX inside it
   * changes — so the progress-bar/% subscription (fillRef/pctRef) is never
   * torn down. `pctRef`'s span is hoisted to a position rendered identically
   * in both layouts for the same reason (see D88).
   */
  compact?: boolean;
}

export function PacerControls({ pacer, count, wpm, onWpmChange, compact = false }: PacerControlsProps) {
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

        {/* Rendered unconditionally, in the same JSX position in both compact
            and full layouts, so the pacer.subscribe update (pctRef) is never
            writing into a torn-down/remounted node (D88). */}
        <span ref={pctRef} className="pacer-pct muted small">
          0%
        </span>

        {!compact && (
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
        )}

        {!compact && (
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
          </label>
        )}

        <label className="pacer-field">
          <span className="muted small">WPM</span>
          <input
            type="range"
            className={compact ? 'pacer-wpm-compact' : undefined}
            min={WPM_MIN}
            max={WPM_MAX}
            step={10}
            value={wpm}
            onChange={(e) => onWpmChange(Number(e.target.value))}
            aria-label="Words per minute"
          />
          {!compact && (
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
          )}
        </label>
      </div>
    </div>
  );
}
