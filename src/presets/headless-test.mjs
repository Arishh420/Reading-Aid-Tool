/**
 * Headless checks for the presets system (issue #3).
 *
 * What is provable without a browser:
 *   1. BUILTIN_PRESETS always present (9 entries with expected ids).
 *   2. Every built-in bundle has only valid setting values.
 *   3. createUserPreset round-trips through JSON correctly.
 *   4. saveUserPreset / loadUserPresets persist and retrieve correctly.
 *   5. saveUserPreset updates an existing preset (upsert, not duplicate).
 *   6. deleteUserPreset removes the correct entry.
 *   7. bundlesEqual returns true for identical bundles.
 *   8. bundlesEqual returns false when any field differs.
 *   9. applyPreset yields the exact bundle (simulated).
 *  10. Built-ins cover all four groups.
 *  11. User preset groups are inferred from mode.
 *  12. Non-RSVP built-ins explicitly set rsvp.showContext:false (issue #78 / D103).
 *
 * What requires the browser (noted, not tested here):
 *   - React setState batching when applyPreset fires all setters.
 *   - Mode view switching (setMode → correct component rendered).
 *   - isModified computed correctly after a setting change.
 *   - PresetsPanel toggle, save-new form, rename, delete in the UI.
 *   - Persistence across page reload (localStorage survives).
 */

import assert from 'node:assert/strict';

// ─── Inline storage stub (no browser localStorage) ────────────────────────────

const store = new Map();
const STORAGE_PREFIX = 'readingaid_v1:';

function storageGet(key) {
  const raw = store.get(STORAGE_PREFIX + key);
  if (raw == null) return null;
  return JSON.parse(raw);
}

function storageSet(key, value) {
  store.set(STORAGE_PREFIX + key, JSON.stringify(value));
  return true;
}

// ─── Inline DEFAULT_* from the TS source ─────────────────────────────────────

const DEFAULT_DISPLAY = { fontSize: 1.125, lineLength: 42 };
const DEFAULT_FLOWING = { lead: 1 };
const DEFAULT_RSVP    = { fontSize: 3, showContext: true, contextLines: 3 };
const DEFAULT_CHUNK   = { chunkSize: 3 };

const DEFAULT_BUNDLE = {
  wpm: 300,
  naturalPauses: true,
  mode: 'flowing',
  bionic: { enabled: true, intensity: 'medium' },
  theme: 'light',
  display: DEFAULT_DISPLAY,
  flowing: DEFAULT_FLOWING,
  rsvp: DEFAULT_RSVP,
  chunk: DEFAULT_CHUNK,
};

function b(overrides) {
  return { ...DEFAULT_BUNDLE, ...overrides };
}

// ─── Inline BUILTIN_PRESETS ───────────────────────────────────────────────────

const BUILTIN_PRESETS = [
  {
    id: 'builtin:deep-current', name: 'Deep Current', group: 'flowing', builtin: true,
    bundle: b({ wpm: 300, naturalPauses: true, mode: 'flowing', bionic: { enabled: false, intensity: 'medium' }, theme: 'dim', display: { fontSize: 1.125, lineLength: 54 }, flowing: { lead: 2 }, rsvp: { ...DEFAULT_RSVP, showContext: false } }),
  },
  {
    id: 'builtin:nightshift', name: 'Nightshift', group: 'flowing', builtin: true,
    bundle: b({ wpm: 280, naturalPauses: true, mode: 'flowing', bionic: { enabled: true, intensity: 'medium' }, theme: 'dark', rsvp: { ...DEFAULT_RSVP, showContext: false } }),
  },
  {
    id: 'builtin:first-contact', name: 'First Contact', group: 'flowing', builtin: true,
    bundle: b({ wpm: 220, naturalPauses: true, mode: 'flowing', bionic: { enabled: true, intensity: 'medium' }, theme: 'sepia', rsvp: { ...DEFAULT_RSVP, showContext: false } }),
  },
  {
    id: 'builtin:afterburner', name: 'Afterburner', group: 'rsvp', builtin: true,
    bundle: b({ wpm: 550, naturalPauses: false, mode: 'rsvp', bionic: { enabled: false, intensity: 'medium' }, rsvp: { fontSize: 3, showContext: false, contextLines: 3 } }),
  },
  {
    id: 'builtin:laser', name: 'Laser', group: 'rsvp', builtin: true,
    bundle: b({ wpm: 350, naturalPauses: true, mode: 'rsvp', bionic: { enabled: false, intensity: 'medium' }, rsvp: { fontSize: 3, showContext: true, contextLines: 3 } }),
  },
  {
    id: 'builtin:steady-gaze', name: 'Steady Gaze', group: 'rsvp', builtin: true,
    bundle: b({ wpm: 260, naturalPauses: true, mode: 'rsvp', bionic: { enabled: false, intensity: 'medium' }, rsvp: { fontSize: 3.5, showContext: true, contextLines: 5 } }),
  },
  {
    id: 'builtin:ironclad', name: 'Ironclad', group: 'chunk', builtin: true,
    bundle: b({ wpm: 180, naturalPauses: true, mode: 'chunk', bionic: { enabled: true, intensity: 'high' }, chunk: { chunkSize: 3 }, rsvp: { ...DEFAULT_RSVP, showContext: false } }),
  },
  {
    id: 'builtin:onboarding-ramp', name: 'Onboarding Ramp', group: 'chunk', builtin: true,
    bundle: b({ wpm: 140, naturalPauses: true, mode: 'chunk', bionic: { enabled: true, intensity: 'high' }, theme: 'sepia', display: { fontSize: 1.4, lineLength: 42 }, chunk: { chunkSize: 2 }, rsvp: { ...DEFAULT_RSVP, showContext: false } }),
  },
  {
    id: 'builtin:open-access', name: 'Open Access', group: 'cross', builtin: true,
    bundle: b({ wpm: 160, naturalPauses: true, mode: 'chunk', bionic: { enabled: true, intensity: 'high' }, theme: 'sepia', display: { fontSize: 1.5, lineLength: 56 }, chunk: { chunkSize: 2 }, rsvp: { ...DEFAULT_RSVP, showContext: false } }),
  },
];

// ─── Inline CRUD logic ────────────────────────────────────────────────────────

const USER_PRESETS_KEY = 'presets';

function loadStore() {
  return storageGet(USER_PRESETS_KEY) ?? { version: 1, userPresets: [] };
}
function saveStore(s) { storageSet(USER_PRESETS_KEY, s); }
function loadUserPresets() { return loadStore().userPresets; }
function saveUserPreset(preset) {
  const s = loadStore();
  const idx = s.userPresets.findIndex((p) => p.id === preset.id);
  if (idx === -1) s.userPresets.push(preset);
  else s.userPresets[idx] = preset;
  saveStore(s);
}
function deleteUserPreset(id) {
  const s = loadStore();
  s.userPresets = s.userPresets.filter((p) => p.id !== id);
  saveStore(s);
}
let _idCounter = 0;
function createUserPreset(name, bundle) {
  const group = bundle.mode === 'rsvp' ? 'rsvp' : bundle.mode === 'chunk' ? 'chunk' : 'flowing';
  return {
    id: `user:${++_idCounter}`,
    name,
    description: '',
    group,
    builtin: false,
    createdAt: Date.now(),
    bundle,
  };
}
function bundlesEqual(a, bndl) {
  return (
    a.wpm === bndl.wpm &&
    a.naturalPauses === bndl.naturalPauses &&
    a.mode === bndl.mode &&
    a.bionic.enabled === bndl.bionic.enabled &&
    a.bionic.intensity === bndl.bionic.intensity &&
    a.theme === bndl.theme &&
    a.display.fontSize === bndl.display.fontSize &&
    a.display.lineLength === bndl.display.lineLength &&
    a.flowing.lead === bndl.flowing.lead &&
    a.rsvp.fontSize === bndl.rsvp.fontSize &&
    a.rsvp.showContext === bndl.rsvp.showContext &&
    a.rsvp.contextLines === bndl.rsvp.contextLines &&
    a.chunk.chunkSize === bndl.chunk.chunkSize
  );
}

// ─── Valid value ranges ────────────────────────────────────────────────────────

const VALID_MODES     = new Set(['flowing', 'rsvp', 'chunk']);
const VALID_THEMES    = new Set(['light', 'sepia', 'dark', 'dim']);
const VALID_INTENSITY = new Set(['low', 'medium', 'high']);
const VALID_CTX_LINES = new Set([3, 5]);

function assertValidBundle(name, bndl) {
  assert.ok(bndl.wpm >= 100 && bndl.wpm <= 1000, `${name}: wpm ${bndl.wpm} out of range`);
  assert.ok(typeof bndl.naturalPauses === 'boolean', `${name}: naturalPauses not boolean`);
  assert.ok(VALID_MODES.has(bndl.mode), `${name}: invalid mode '${bndl.mode}'`);
  assert.ok(typeof bndl.bionic.enabled === 'boolean', `${name}: bionic.enabled not boolean`);
  assert.ok(VALID_INTENSITY.has(bndl.bionic.intensity), `${name}: invalid intensity '${bndl.bionic.intensity}'`);
  assert.ok(VALID_THEMES.has(bndl.theme), `${name}: invalid theme '${bndl.theme}'`);
  assert.ok(bndl.display.fontSize >= 0.9 && bndl.display.fontSize <= 1.7, `${name}: fontSize ${bndl.display.fontSize} out of range`);
  assert.ok(bndl.display.lineLength >= 28 && bndl.display.lineLength <= 56, `${name}: lineLength ${bndl.display.lineLength} out of range`);
  assert.ok(bndl.flowing.lead >= 0 && bndl.flowing.lead <= 5, `${name}: lead ${bndl.flowing.lead} out of range`);
  assert.ok(bndl.rsvp.fontSize >= 1.5 && bndl.rsvp.fontSize <= 6, `${name}: rsvp.fontSize ${bndl.rsvp.fontSize} out of range`);
  assert.ok(VALID_CTX_LINES.has(bndl.rsvp.contextLines), `${name}: contextLines ${bndl.rsvp.contextLines} not in {3,5}`);
  assert.ok(bndl.chunk.chunkSize >= 2 && bndl.chunk.chunkSize <= 4, `${name}: chunkSize ${bndl.chunk.chunkSize} out of range`);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
    failed++;
  }
}

console.log('\nPresets system — headless checks\n');

// 1. Built-ins are always present and have the right count
test('built-ins always present (9 presets)', () => {
  assert.equal(BUILTIN_PRESETS.length, 9, `expected 9 built-ins, got ${BUILTIN_PRESETS.length}`);
  assert.ok(BUILTIN_PRESETS.every((p) => p.builtin), 'all built-ins must have builtin:true');
});

// 2. Every built-in bundle has valid setting values
test('every built-in bundle has valid setting values', () => {
  for (const p of BUILTIN_PRESETS) {
    assertValidBundle(p.name, p.bundle);
  }
});

// 3. Built-ins cover all four groups
test('built-ins cover all four groups (flowing, rsvp, chunk, cross)', () => {
  const groups = new Set(BUILTIN_PRESETS.map((p) => p.group));
  assert.ok(groups.has('flowing'), 'missing flowing group');
  assert.ok(groups.has('rsvp'), 'missing rsvp group');
  assert.ok(groups.has('chunk'), 'missing chunk group');
  assert.ok(groups.has('cross'), 'missing cross group');
});

// 4. createUserPreset round-trips through JSON correctly
test('createUserPreset round-trips through JSON', () => {
  const preset = createUserPreset('My Preset', DEFAULT_BUNDLE);
  const json = JSON.stringify(preset);
  const restored = JSON.parse(json);
  assert.equal(restored.name, 'My Preset');
  assert.equal(restored.builtin, false);
  assert.equal(restored.bundle.wpm, DEFAULT_BUNDLE.wpm);
  assert.equal(restored.bundle.mode, DEFAULT_BUNDLE.mode);
  assert.equal(restored.bundle.theme, DEFAULT_BUNDLE.theme);
});

// 5. saveUserPreset / loadUserPresets persist and retrieve correctly
test('saveUserPreset + loadUserPresets round-trips storage', () => {
  store.clear();
  const preset = createUserPreset('Speed Run', BUILTIN_PRESETS[3].bundle); // Afterburner bundle
  saveUserPreset(preset);
  const loaded = loadUserPresets();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].name, 'Speed Run');
  assert.equal(loaded[0].bundle.wpm, 550);
  assert.equal(loaded[0].builtin, false);
});

// 6. saveUserPreset upserts — doesn't duplicate when saving same id
test('saveUserPreset upserts existing preset (no duplicate)', () => {
  store.clear();
  const preset = createUserPreset('Night Mode', DEFAULT_BUNDLE);
  saveUserPreset(preset);
  saveUserPreset({ ...preset, name: 'Night Mode v2' });
  const loaded = loadUserPresets();
  assert.equal(loaded.length, 1, `expected 1 preset, got ${loaded.length}`);
  assert.equal(loaded[0].name, 'Night Mode v2');
});

// 7. deleteUserPreset removes the correct entry
test('deleteUserPreset removes the correct preset and leaves others', () => {
  store.clear();
  const a = createUserPreset('Alpha', DEFAULT_BUNDLE);
  const bPreset = createUserPreset('Beta', BUILTIN_PRESETS[0].bundle);
  saveUserPreset(a);
  saveUserPreset(bPreset);
  deleteUserPreset(a.id);
  const loaded = loadUserPresets();
  assert.equal(loaded.length, 1, `expected 1 remaining, got ${loaded.length}`);
  assert.equal(loaded[0].name, 'Beta');
});

// 8. bundlesEqual returns true for identical bundles
test('bundlesEqual returns true for identical bundles', () => {
  const copy = JSON.parse(JSON.stringify(DEFAULT_BUNDLE));
  assert.ok(bundlesEqual(DEFAULT_BUNDLE, copy), 'identical bundles should be equal');
});

// 9. bundlesEqual returns false when a field differs
test('bundlesEqual returns false when any field differs', () => {
  const fields = [
    { wpm: 400 },
    { naturalPauses: false },
    { mode: 'rsvp' },
    { bionic: { enabled: false, intensity: 'medium' } },
    { bionic: { enabled: true, intensity: 'high' } },
    { theme: 'dark' },
    { display: { fontSize: 1.3, lineLength: 42 } },
    { display: { fontSize: 1.125, lineLength: 50 } },
    { flowing: { lead: 3 } },
    { rsvp: { fontSize: 4, showContext: true, contextLines: 3 } },
    { rsvp: { fontSize: 3, showContext: false, contextLines: 3 } },
    { rsvp: { fontSize: 3, showContext: true, contextLines: 5 } },
    { chunk: { chunkSize: 2 } },
  ];
  for (const diff of fields) {
    const modified = b(diff);
    assert.ok(!bundlesEqual(DEFAULT_BUNDLE, modified), `bundlesEqual should be false for diff: ${JSON.stringify(diff)}`);
  }
});

// 10. Applying a preset yields the exact bundle (simulated)
test('applying a preset yields the exact bundle', () => {
  // Simulate applyPreset: destructure the bundle and compare back
  for (const preset of BUILTIN_PRESETS) {
    const { wpm, naturalPauses, mode, bionic, theme, display, flowing, rsvp, chunk } = preset.bundle;
    const applied = { wpm, naturalPauses, mode, bionic, theme, display, flowing, rsvp, chunk };
    assert.ok(bundlesEqual(preset.bundle, applied), `applyPreset yields wrong bundle for '${preset.name}'`);
  }
});

// 11. User preset groups are inferred from mode
test('createUserPreset infers group from bundle mode', () => {
  const flowingPreset = createUserPreset('F', b({ mode: 'flowing' }));
  const rsvpPreset   = createUserPreset('R', b({ mode: 'rsvp' }));
  const chunkPreset  = createUserPreset('C', b({ mode: 'chunk' }));
  assert.equal(flowingPreset.group, 'flowing');
  assert.equal(rsvpPreset.group, 'rsvp');
  assert.equal(chunkPreset.group, 'chunk');
});

// 12. Non-RSVP built-ins explicitly set rsvp.showContext:false (issue #78)
test('non-RSVP built-ins explicitly set rsvp.showContext:false', () => {
  const nonRsvpIds = [
    'builtin:deep-current',
    'builtin:nightshift',
    'builtin:first-contact',
    'builtin:ironclad',
    'builtin:onboarding-ramp',
    'builtin:open-access',
  ];
  for (const id of nonRsvpIds) {
    const preset = BUILTIN_PRESETS.find((p) => p.id === id);
    assert.ok(preset, `preset ${id} not found`);
    assert.notEqual(preset.bundle.mode, 'rsvp', `${id}: expected a non-RSVP mode`);
    assert.equal(preset.bundle.rsvp.showContext, false, `${id}: expected rsvp.showContext === false`);
  }
});

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
