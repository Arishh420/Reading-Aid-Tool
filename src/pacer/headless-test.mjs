/**
 * Headless checks for the Space-key routing predicate (issue #38, D86).
 *
 * Unlike the storage/presets headless tests (which reimplement pure logic
 * inline because they predate a bundling step), this one esbuild-bundles the
 * real src/pacer/keyboard.ts and imports it directly — so the test exercises
 * the actual shipped predicate, not a hand-copied restatement of it.
 *
 * What is provable without a browser:
 *   1. Space toggles from a focused number input (WPM/Word fields) — the #38 fix.
 *   2. Space toggles from a focused range input (WPM slider, scrubber) — the #38 fix.
 *   3. Space yields from a focused BUTTON (D40: avoids native-click double-fire).
 *   4. Space yields from SELECT, TEXTAREA, and text-type INPUT (preset-name field).
 *   5. Space yields from checkbox/radio INPUTs (not part of the trap; not a claimed fix).
 *   6. Space toggles when no element has focus (null target).
 *
 * What requires the browser (noted, not tested here):
 *   - The actual repro: play → focus/change WPM → Space pauses (all 3 modes).
 *   - No double-toggle when the play button itself has focus.
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
try {
  ({ spaceTogglesFrom } = await import(`${tmpPath}?t=${Date.now()}`));
} finally {
  await unlink(tmpPath);
}

// ─── Minimal fake DOM elements (no jsdom dependency) ──────────────────────────

function fakeEl(tagName, type) {
  return { tagName, type };
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
check('BUTTON -> yields (D40: no double-fire with native click)',
  spaceTogglesFrom(fakeEl('BUTTON', undefined)), false);
check('SELECT -> yields',
  spaceTogglesFrom(fakeEl('SELECT', undefined)), false);
check('TEXTAREA -> yields',
  spaceTogglesFrom(fakeEl('TEXTAREA', undefined)), false);
check('text input -> yields (preset-name field must accept literal spaces)',
  spaceTogglesFrom(fakeEl('INPUT', 'text')), false);
check('checkbox input -> yields (not a trap field)',
  spaceTogglesFrom(fakeEl('INPUT', 'checkbox')), false);
check('radio input -> yields (not a trap field)',
  spaceTogglesFrom(fakeEl('INPUT', 'radio')), false);
check('null target (no focused element) -> toggles',
  spaceTogglesFrom(null), true);

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed.\n`);

if (failed > 0) process.exit(1);
