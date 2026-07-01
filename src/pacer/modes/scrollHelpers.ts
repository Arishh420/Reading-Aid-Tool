/**
 * Shared auto-scroll helpers for the in-place pacer modes (flowing, chunk).
 * Both keep the active line within a fixed band of the reader pane and only
 * scroll on line change.
 */

/** Keep the active line within this fraction of the pane height from the top. */
export const READING_BAND = 0.4;
/** Vertical delta (px) above which the active word counts as a new line. */
export const LINE_EPSILON = 4;

/**
 * Scroll the pane so `wordEl` sits at READING_BAND from the top. Computed from
 * the pane's own rect so it's exact regardless of pane padding / content offset.
 */
export function scrollWordToBand(
  scroll: HTMLElement,
  wordEl: HTMLElement,
  smooth: boolean,
) {
  const pRect = scroll.getBoundingClientRect();
  const wRect = wordEl.getBoundingClientRect();
  const delta = wRect.top - (pRect.top + scroll.clientHeight * READING_BAND);
  scroll.scrollTo({ top: scroll.scrollTop + delta, behavior: smooth ? 'smooth' : 'auto' });
}
