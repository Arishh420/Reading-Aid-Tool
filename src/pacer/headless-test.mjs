/**
 * Headless checks for the Space-key routing predicate (issue #38, D86/D89).
 *
 * Unlike the storage/presets headless tests (which reimplement pure logic
 * inline because they predate a bundling step), this one esbuild-bundles the
 * real src/pacer/keyboard.ts and imports it directly — so the test exercises
 * the actual shipped predicate, not a hand-copied restatement of it.
 *
 * Revised after browser testing surfaced two real bugs in the first-pass
 * predicate (D86): it yielded for ANY non-INPUT element by default, which
 * broke Space after a word-click seek (focus drops to <body>, a non-INPUT —
 * bug #2) and yielded for every BUTTON/SELECT, not just Play/Pause (bug #3,
 * Space toggled the Presets panel / Mode dropdown instead of the pacer). The
 * corrected contract defaults to TOGGLE and only yields for a narrow,
 * enumerated set: the Play/Pause button specifically (by attribute, not tag
 * name) and genuine text/checkbox/radio/file entry.
 *
 * What is provable without a browser:
 *   1. Space toggles from a focused number input (WPM/Word fields) — the #38 fix.
 *   2. Space toggles from a focused range input (WPM slider, scrubber) — the #38 fix.
 *   3. Space yields from the Play/Pause button specifically, identified by its
 *      marker attribute (D40: avoids native-click double-fire).
 *   4. Space TOGGLES from every other BUTTON (Presets toggle, Restart, Load
 *      another, a preset card, …) — bug #3 fix.
 *   5. Space TOGGLES from a focused SELECT (the Mode dropdown) — bug #3 fix.
 *   6. Space TOGGLES from a generic non-form element (a clicked word <span>,
 *      or <body> after a click-to-seek drops focus there) — bug #2 fix.
 *   7. Space yields from TEXTAREA and text-type INPUT (preset-name field).
 *   8. Space yields from checkbox/radio/file INPUTs (genuine native Space action).
 *   9. Space toggles when no element has focus (null target).
 *
 * What requires the browser (noted, not tested here):
 *   - The actual repro: play → focus/change WPM → Space pauses (all 3 modes).
 *   - No double-toggle when the Play/Pause button itself has focus.
 *   - Space after click-to-seek (main reader and RSVP context strip) toggles
 *     the pacer instead of scrolling the page.
 *   - Space with the Presets panel open or the Mode dropdown focused toggles
 *     the pacer instead of opening/closing the control.
 *   - Typing a literal space into the preset-name field still inserts a space.
 */

import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const result = await build({
  entryPoints: [path.join(__dirname, 'keyboard.ts')],
  bundle: false,
  write: false,
  format: 'esm',
  target: 'node18',
});

const code = result.outputFiles[0].text;
const tmpPath = path.join(__dirname, `.headless-keyboard-${process.pid}.mjs`);
const { writeFile, unlink } = await import('node:fs/promises');
await writeFile(tmpPath, code);

let spaceTogglesFrom;
let pacerToggleButtonProps;
try {
  ({ spaceTogglesFrom, pacerToggleButtonProps } = await import(`${tmpPath}?t=${Date.now()}`));
} finally {
  await unlink(tmpPath);
}

// ─── Minimal fake DOM elements (no jsdom dependency) ──────────────────────────
// `attrs` mimics the subset of Element used by the predicate: hasAttribute().

function fakeEl(tagName, type, attrs = {}) {
  return {
    tagName,
    type,
    hasAttribute: (name) => Object.prototype.hasOwnProperty.call(attrs, name),
  };
}

/** The real Play/Pause button: tag BUTTON + the actual exported marker props. */
function fakePlayButton() {
  return fakeEl('BUTTON', undefined, pacerToggleButtonProps);
}

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  try {
    assert.equal(actual, expected);
    console.log(`  PASS  ${label}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${label}: ${err.message}`);
    failed++;
  }
}

console.log('\nSpace-key routing predicate — headless checks\n');

check('number input -> toggles (WPM/Word fields, the #38 fix)',
  spaceTogglesFrom(fakeEl('INPUT', 'number')), true);
check('range input -> toggles (WPM slider / scrubber, the #38 fix)',
  spaceTogglesFrom(fakeEl('INPUT', 'range')), true);
check('Play/Pause button (marker attribute) -> yields (D40: no double-fire)',
  spaceTogglesFrom(fakePlayButton()), false);
check('any OTHER button -> toggles (bug #3 fix: Presets toggle/Restart/etc.)',
  spaceTogglesFrom(fakeEl('BUTTON', undefined)), true);
check('SELECT -> toggles (bug #3 fix: Mode dropdown)',
  spaceTogglesFrom(fakeEl('SELECT', undefined)), true);
check('generic non-form element (clicked word span) -> toggles (bug #2 fix)',
  spaceTogglesFrom(fakeEl('SPAN', undefined)), true);
check('BODY (focus after a click-to-seek drops here) -> toggles (bug #2 fix)',
  spaceTogglesFrom(fakeEl('BODY', undefined)), true);
check('TEXTAREA -> yields',
  spaceTogglesFrom(fakeEl('TEXTAREA', undefined)), false);
check('text input -> yields (preset-name field must accept literal spaces)',
  spaceTogglesFrom(fakeEl('INPUT', 'text')), false);
check('checkbox input -> yields (native check-toggle on Space)',
  spaceTogglesFrom(fakeEl('INPUT', 'checkbox')), false);
check('radio input -> yields (native select-on-Space)',
  spaceTogglesFrom(fakeEl('INPUT', 'radio')), false);
check('file input -> yields (native picker-open-on-Space)',
  spaceTogglesFrom(fakeEl('INPUT', 'file')), false);
check('null target (no focused element) -> toggles',
  spaceTogglesFrom(null), true);

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed.\n`);

if (failed > 0) process.exit(1);
