/**
 * Space-key routing for the global keyboard transport (issue #38, D86).
 *
 * The reading-phase keydown handler yields entirely to focused controls for
 * arrows/Home (unchanged — don't hijack a slider/select). Space is narrower:
 * it only needs to yield where Space is either native activation (a focused
 * BUTTON, where the browser already fires a synthetic click — re-handling
 * would double-fire the pacer toggle, see D40) or genuine text entry (SELECT,
 * TEXTAREA, and text-type INPUTs, e.g. the preset-name field, where typing a
 * literal space must not pause the pacer). Number/range inputs (WPM, Word,
 * scrubber) treat Space as inert, so the pacer claims it there — this is what
 * closes the #38 focus trap.
 */

/** True if the pacer's Space handler should fire even though `el` has focus. */
export function spaceTogglesFrom(el: Element | null): boolean {
  if (!el) return true;
  if (el.tagName !== 'INPUT') return false;
  const type = (el as HTMLInputElement).type;
  return type === 'number' || type === 'range';
}
