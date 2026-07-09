/**
 * Space-key routing for the global keyboard transport (issue #38, D86 — revised
 * after browser testing surfaced two real bugs in the first pass, see D89).
 *
 * The contract is now: Space toggles the pacer UNLESS the focused element has
 * a genuine native action of its own that Space would otherwise trigger. The
 * yield set is deliberately narrow and enumerated by exclusion, not by "any
 * BUTTON/SELECT" — the first pass's `if (tag !== 'INPUT') return false`
 * defaulted to "yield" for *any* non-INPUT element, which silently broke two
 * things: (1) a clicked word span isn't focusable, so after a click-to-seek
 * the browser drops focus to <body> — a non-INPUT element — so the pacer
 * yielded there too, and the native Space-scroll fired instead (issue #38 bug
 * #2); (2) it yielded for *every* BUTTON/SELECT, not just Play/Pause, so
 * Space toggled the Presets-panel button or the Mode <select> instead of the
 * pacer (issue #38 bug #3). Only the Play/Pause button and genuine text entry
 * should yield; everything else — including a clicked word span, <body>, the
 * Presets toggle, the Mode dropdown, Restart, Load another — should reach the
 * pacer.
 */

/**
 * Marks the Play/Pause button so `spaceTogglesFrom` can identify it precisely
 * (by attribute, not by tag name) rather than yielding for every BUTTON. Its
 * native click already toggles the pacer; re-handling Space there would
 * double-fire (D40). Spread onto the button's JSX: `<button
 * {...pacerToggleButtonProps} ...>`.
 */
const PACER_TOGGLE_ATTR = 'data-pacer-toggle-button';
export const pacerToggleButtonProps = { [PACER_TOGGLE_ATTR]: 'true' } as const;

/** Input types with a genuine native action of their own on Space: typing a
 *  literal space character, or toggling checked/selected state. Yield here. */
const NATIVE_SPACE_INPUT_TYPES = new Set(['text', 'checkbox', 'radio', 'file']);

/** True if the pacer's Space handler should fire even though `el` has focus. */
export function spaceTogglesFrom(el: Element | null): boolean {
  if (!el) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return false;
  if (tag === 'BUTTON') {
    // Only the Play/Pause button competes with Space (native click). Every
    // other button (Presets toggle, Restart, Load another, a preset card, …)
    // has nothing else to lose by handing Space to the pacer.
    return !el.hasAttribute(PACER_TOGGLE_ATTR);
  }
  if (tag === 'INPUT') {
    // HTMLInputElement.type always resolves to a concrete value ("text" by
    // default), even when the JSX omits the `type` attribute — covers the
    // preset-name/rename fields without a special case for them.
    const type = (el as HTMLInputElement).type;
    return !NATIVE_SPACE_INPUT_TYPES.has(type);
  }
  // SELECT (the Mode dropdown's native "open on Space" is deliberately
  // overridden — issue #38 bug #3) and any other element (a clicked word
  // span, <body> after a click drops focus there, …) have no native Space
  // behavior worth protecting.
  return true;
}
