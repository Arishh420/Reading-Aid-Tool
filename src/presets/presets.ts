import type { BionicSettings, ReaderDisplay } from '../ui/Settings';
import { DEFAULT_DISPLAY } from '../ui/Settings';
import type { Theme } from '../ui/theme';
import type { PacerMode } from '../pacer/ModeSettings';
import { DEFAULT_FLOWING, type FlowingSettings } from '../pacer/modes/FlowingHighlight';
import { DEFAULT_RSVP, type RsvpSettings } from '../pacer/modes/Rsvp';
import { DEFAULT_CHUNK, type ChunkSettings } from '../pacer/modes/ChunkHighlight';
import { storageGet, storageSet } from '../storage/storage';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export interface PresetBundle {
  wpm: number;
  naturalPauses: boolean;
  mode: PacerMode;
  bionic: BionicSettings;
  theme: Theme;
  display: ReaderDisplay;
  flowing: FlowingSettings;
  rsvp: RsvpSettings;
  chunk: ChunkSettings;
}

export type PresetGroup = 'flowing' | 'rsvp' | 'chunk' | 'cross';

interface BasePreset {
  id: string;
  name: string;
  description: string;
  group: PresetGroup;
  bundle: PresetBundle;
}

export type BuiltinPreset = BasePreset & { builtin: true };
export type UserPreset   = BasePreset & { builtin: false; createdAt: number };
export type Preset = BuiltinPreset | UserPreset;

// ------------------------------------------------------------------
// Default bundle (mirrors App.tsx initial state)
// ------------------------------------------------------------------

export const DEFAULT_BUNDLE: PresetBundle = {
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

// ------------------------------------------------------------------
// Built-in presets
// ------------------------------------------------------------------

function b(overrides: Partial<PresetBundle>): PresetBundle {
  return { ...DEFAULT_BUNDLE, ...overrides };
}

export const BUILTIN_PRESETS: BuiltinPreset[] = [
  // ── FLOWING ──────────────────────────────────────────────────────
  {
    id: 'builtin:deep-current',
    name: 'Deep Current',
    description: 'Immersive flowing read — dim theme, wide line, lead 2, pauses on.',
    group: 'flowing',
    builtin: true,
    bundle: b({
      wpm: 300,
      naturalPauses: true,
      mode: 'flowing',
      bionic: { enabled: false, intensity: 'medium' },
      theme: 'dim',
      display: { fontSize: 1.125, lineLength: 54 },
      flowing: { lead: 2 },
      rsvp: { ...DEFAULT_RSVP, showContext: false },
    }),
  },
  {
    id: 'builtin:nightshift',
    name: 'Nightshift',
    description: 'Dark-theme evening reading with medium bionic bolding.',
    group: 'flowing',
    builtin: true,
    bundle: b({
      wpm: 280,
      naturalPauses: true,
      mode: 'flowing',
      bionic: { enabled: true, intensity: 'medium' },
      theme: 'dark',
      rsvp: { ...DEFAULT_RSVP, showContext: false },
    }),
  },
  {
    id: 'builtin:first-contact',
    name: 'First Contact',
    description: 'Gentle intro — sepia, moderate pace, bionic on, pauses on.',
    group: 'flowing',
    builtin: true,
    bundle: b({
      wpm: 220,
      naturalPauses: true,
      mode: 'flowing',
      bionic: { enabled: true, intensity: 'medium' },
      theme: 'sepia',
      rsvp: { ...DEFAULT_RSVP, showContext: false },
    }),
  },
  // ── RSVP ─────────────────────────────────────────────────────────
  {
    id: 'builtin:afterburner',
    name: 'Afterburner',
    description: 'Demo blast — 550 WPM, pauses off, no bionic, pure metronomic RSVP.',
    group: 'rsvp',
    builtin: true,
    bundle: b({
      wpm: 550,
      naturalPauses: false,
      mode: 'rsvp',
      bionic: { enabled: false, intensity: 'medium' },
      rsvp: { fontSize: 3, showContext: false, contextLines: 3 },
    }),
  },
  {
    id: 'builtin:laser',
    name: 'Laser',
    description: 'Focused RSVP with context strip on — speed with a safety net.',
    group: 'rsvp',
    builtin: true,
    bundle: b({
      wpm: 350,
      naturalPauses: true,
      mode: 'rsvp',
      bionic: { enabled: false, intensity: 'medium' },
      rsvp: { fontSize: 3, showContext: true, contextLines: 3 },
    }),
  },
  {
    id: 'builtin:steady-gaze',
    name: 'Steady Gaze',
    description: 'Calm RSVP — slower pace, larger word, wide context, strong pauses.',
    group: 'rsvp',
    builtin: true,
    bundle: b({
      wpm: 260,
      naturalPauses: true,
      mode: 'rsvp',
      bionic: { enabled: false, intensity: 'medium' },
      rsvp: { fontSize: 3.5, showContext: true, contextLines: 5 },
    }),
  },
  // ── CHUNK ─────────────────────────────────────────────────────────
  {
    id: 'builtin:ironclad',
    name: 'Ironclad',
    description: 'Comprehension mode — slow pace, chunk 3, high bionic.',
    group: 'chunk',
    builtin: true,
    bundle: b({
      wpm: 180,
      naturalPauses: true,
      mode: 'chunk',
      bionic: { enabled: true, intensity: 'high' },
      chunk: { chunkSize: 3 },
      rsvp: { ...DEFAULT_RSVP, showContext: false },
    }),
  },
  {
    id: 'builtin:onboarding-ramp',
    name: 'Onboarding Ramp',
    description: 'Confidence builder — tiny chunks, all aids on, comfortable pace.',
    group: 'chunk',
    builtin: true,
    bundle: b({
      wpm: 140,
      naturalPauses: true,
      mode: 'chunk',
      bionic: { enabled: true, intensity: 'high' },
      theme: 'sepia',
      display: { fontSize: 1.4, lineLength: 42 },
      chunk: { chunkSize: 2 },
      rsvp: { ...DEFAULT_RSVP, showContext: false },
    }),
  },
  // ── CROSS-CUTTING ─────────────────────────────────────────────────
  {
    id: 'builtin:open-access',
    name: 'Open Access',
    description: 'Accessibility — large text, widest line, sepia, high bionic, slow chunks.',
    group: 'cross',
    builtin: true,
    bundle: b({
      wpm: 160,
      naturalPauses: true,
      mode: 'chunk',
      bionic: { enabled: true, intensity: 'high' },
      theme: 'sepia',
      display: { fontSize: 1.5, lineLength: 56 },
      chunk: { chunkSize: 2 },
      rsvp: { ...DEFAULT_RSVP, showContext: false },
    }),
  },
];

// ------------------------------------------------------------------
// User preset CRUD (localStorage)
// ------------------------------------------------------------------

const USER_PRESETS_KEY = 'presets';

interface PresetsStore {
  version: 1;
  userPresets: UserPreset[];
}

function loadStore(): PresetsStore {
  return storageGet<PresetsStore>(USER_PRESETS_KEY) ?? { version: 1, userPresets: [] };
}

function saveStore(store: PresetsStore): void {
  storageSet(USER_PRESETS_KEY, store);
}

export function loadUserPresets(): UserPreset[] {
  return loadStore().userPresets;
}

export function saveUserPreset(preset: UserPreset): void {
  const store = loadStore();
  const idx = store.userPresets.findIndex((p) => p.id === preset.id);
  if (idx === -1) {
    store.userPresets.push(preset);
  } else {
    store.userPresets[idx] = preset;
  }
  saveStore(store);
}

export function deleteUserPreset(id: string): void {
  const store = loadStore();
  store.userPresets = store.userPresets.filter((p) => p.id !== id);
  saveStore(store);
}

export function createUserPreset(name: string, bundle: PresetBundle): UserPreset {
  const group: PresetGroup =
    bundle.mode === 'rsvp' ? 'rsvp' : bundle.mode === 'chunk' ? 'chunk' : 'flowing';
  return {
    id: `user:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
    name,
    description: '',
    group,
    builtin: false,
    createdAt: Date.now(),
    bundle,
  };
}

// ------------------------------------------------------------------
// Shallow equality check for isModified tracking
// ------------------------------------------------------------------

export function bundlesEqual(a: PresetBundle, b: PresetBundle): boolean {
  return (
    a.wpm === b.wpm &&
    a.naturalPauses === b.naturalPauses &&
    a.mode === b.mode &&
    a.bionic.enabled === b.bionic.enabled &&
    a.bionic.intensity === b.bionic.intensity &&
    a.theme === b.theme &&
    a.display.fontSize === b.display.fontSize &&
    a.display.lineLength === b.display.lineLength &&
    a.flowing.lead === b.flowing.lead &&
    a.rsvp.fontSize === b.rsvp.fontSize &&
    a.rsvp.showContext === b.rsvp.showContext &&
    a.rsvp.contextLines === b.rsvp.contextLines &&
    a.chunk.chunkSize === b.chunk.chunkSize
  );
}
