import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Document } from './model/types';
import { flattenWords } from './model/tokenize';
import { FileInput } from './ui/FileInput';
import { ResumePrompt } from './ui/ResumePrompt';
import {
  DEFAULT_BIONIC,
  DEFAULT_DISPLAY,
  Settings,
  type BionicSettings,
  type ReaderDisplay,
} from './ui/Settings';
import { ThemeSelector } from './ui/ThemeSelector';
import { PresetsPanel } from './ui/PresetsPanel';
import { DEFAULT_THEME, type Theme } from './ui/theme';
import { firstWordlikeFrom, usePacer } from './pacer/usePacer';
import { buildDwellMultipliers } from './pacer/dwell';
import { PacerControls } from './pacer/PacerControls';
import { ModeSettings, type PacerMode } from './pacer/ModeSettings';
import {
  DEFAULT_FLOWING,
  FlowingHighlight,
  type FlowingSettings,
} from './pacer/modes/FlowingHighlight';
import { DEFAULT_RSVP, Rsvp, type RsvpSettings } from './pacer/modes/Rsvp';
import {
  ChunkHighlight,
  DEFAULT_CHUNK,
  type ChunkSettings,
} from './pacer/modes/ChunkHighlight';
import { loadBookRecord, saveReadingPosition, type BookRecord } from './storage/readingPosition';
import {
  bundlesEqual,
  createUserPreset,
  deleteUserPreset,
  loadUserPresets,
  saveUserPreset,
  type Preset,
  type PresetBundle,
  type UserPreset,
} from './presets/presets';

/** App phases — drives what is rendered in the main area. */
type Phase = 'idle' | 'resume-prompt' | 'reading';

/**
 * Perf-hardened shell: a responsive full-height (100dvh) column. The reader is
 * a fixed-height, internally-scrolling pane (the virtualizer's scroll element);
 * the toolbar and pacer controls sit pinned above it.
 */
export default function App() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [doc, setDoc] = useState<Document | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [resumeRecord, setResumeRecord] = useState<BookRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bionic, setBionic] = useState<BionicSettings>(DEFAULT_BIONIC);
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [wpm, setWpm] = useState(300);
  const [naturalPauses, setNaturalPauses] = useState(true);
  const [mode, setMode] = useState<PacerMode>('flowing');
  const [flowing, setFlowing] = useState<FlowingSettings>(DEFAULT_FLOWING);
  const [rsvp, setRsvp] = useState<RsvpSettings>(DEFAULT_RSVP);
  const [chunk, setChunk] = useState<ChunkSettings>(DEFAULT_CHUNK);
  const [display, setDisplay] = useState<ReaderDisplay>(DEFAULT_DISPLAY);

  // Presets
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [userPresets, setUserPresets] = useState<UserPreset[]>(() => loadUserPresets());
  const lastAppliedBundle = useRef<PresetBundle | null>(null);

  const currentBundle: PresetBundle = {
    wpm, naturalPauses, mode, bionic, theme, display, flowing, rsvp, chunk,
  };
  const isModified =
    activePresetId !== null &&
    lastAppliedBundle.current !== null &&
    !bundlesEqual(currentBundle, lastAppliedBundle.current);

  function applyPreset(preset: Preset) {
    const bundle = preset.bundle;
    setWpm(bundle.wpm);
    setNaturalPauses(bundle.naturalPauses);
    setMode(bundle.mode);
    setBionic(bundle.bionic);
    setTheme(bundle.theme);
    setDisplay(bundle.display);
    setFlowing(bundle.flowing);
    setRsvp(bundle.rsvp);
    setChunk(bundle.chunk);
    setActivePresetId(preset.id);
    lastAppliedBundle.current = bundle;
  }

  function handleSaveNewPreset(name: string) {
    const preset = createUserPreset(name, currentBundle);
    saveUserPreset(preset);
    setUserPresets((prev) => [...prev, preset]);
    setActivePresetId(preset.id);
    lastAppliedBundle.current = currentBundle;
  }

  function handleRenamePreset(id: string, name: string) {
    setUserPresets((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, name } : p));
      const changed = next.find((p) => p.id === id);
      if (changed) saveUserPreset(changed);
      return next;
    });
  }

  function handleDeleteUserPreset(id: string) {
    deleteUserPreset(id);
    setUserPresets((prev) => prev.filter((p) => p.id !== id));
    if (activePresetId === id) {
      setActivePresetId(null);
      lastAppliedBundle.current = null;
    }
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // The flattened reading-order spine the pacer walks (§6). Stable per document.
  const words = useMemo(() => (doc ? flattenWords(doc) : []), [doc]);
  // Per-word dwell multipliers for punctuation-aware pacing (refinement A).
  const dwell = useMemo(() => (doc ? buildDwellMultipliers(doc) : []), [doc]);
  // Only Chunk mode advances by more than one word per step.
  const chunkSize = mode === 'chunk' ? chunk.chunkSize : 1;
  const pacer = usePacer(words, wpm, { dwell, naturalPauses, chunkSize });

  // Keyboard transport / seeking (M7). Ignored while typing into a control.
  useEffect(() => {
    if (phase !== 'reading') return;
    const onKey = (e: KeyboardEvent) => {
      // Let focused controls handle their own keys (avoids double-firing Space
      // on a focused button, or hijacking arrows on a slider/select).
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        pacer.toggle();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const n = firstWordlikeFrom(words, pacer.indexRef.current + 1);
        if (n !== -1) pacer.seek(n);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        for (let j = pacer.indexRef.current - 1; j >= 0; j--) {
          if (words[j].isWordlike) {
            pacer.seek(j);
            break;
          }
        }
      } else if (e.key === 'Home') {
        e.preventDefault();
        pacer.restart();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, pacer, words]);

  // Position persistence: save on a 30-second interval, on visibility change,
  // and on pagehide (more reliable than beforeunload). Only active while reading.
  //
  // latest is always saved regardless of movement (it is the resume bookmark).
  // The >2 % history-gate is enforced inside saveReadingPosition, not here.
  useEffect(() => {
    if (phase !== 'reading' || !doc || !fingerprint) return;

    const save = () => {
      const wordIndex = pacer.indexRef.current;
      // Don't record a 0-position on initial load — wait until the user has
      // actually moved past the first word.
      if (wordIndex === 0) return;
      saveReadingPosition(fingerprint, doc.title ?? 'Untitled', wordIndex, words.length);
    };

    const intervalId = setInterval(save, 30_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') save();
    };
    const onPageHide = () => save();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [phase, doc, fingerprint, words, pacer]);

  function handleLoad(loaded: Document, fp: string) {
    if (loaded.blocks.length === 0) {
      setDoc(null);
      setFingerprint(null);
      setError('No readable text was found in this file.');
      return;
    }
    setError(null);

    const record = loadBookRecord(fp);
    setDoc(loaded);
    setFingerprint(fp);

    // Only offer resume when there is a saved position past the very beginning.
    if (record && record.latest.wordIndex > 0) {
      setResumeRecord(record);
      setPhase('resume-prompt');
    } else {
      setResumeRecord(null);
      setPhase('reading');
    }
  }

  // When the user chooses Resume from the interstitial, the pacer has already
  // been reset to 0 (that happened when doc/words changed in handleLoad). We
  // can seek directly — no deferred ref needed.
  function handleResume(wordIndex: number) {
    // Guard against a stale record whose index exceeds the current word count.
    const safe = wordIndex < words.length ? wordIndex : 0;
    pacer.seek(safe);
    setPhase('reading');
  }

  function handleStartOver() {
    // Pacer is already at 0 from the usePacer reset. History is preserved.
    setPhase('reading');
  }

  function handleLoadAnother() {
    // Save position before leaving the reader (mirroring the pagehide save).
    if (phase === 'reading' && fingerprint && doc) {
      const wordIndex = pacer.indexRef.current;
      if (wordIndex > 0) {
        saveReadingPosition(fingerprint, doc.title ?? 'Untitled', wordIndex, words.length);
      }
    }
    setDoc(null);
    setFingerprint(null);
    setResumeRecord(null);
    setPhase('idle');
  }

  // Reader typography as CSS variables (M7); the laid-out reader reads these.
  const shellStyle = {
    '--reading-width': `${display.lineLength}rem`,
    '--reader-font-size': `${display.fontSize}rem`,
  } as CSSProperties;
  const layoutKey = `${display.fontSize}|${display.lineLength}`;

  return (
    <main className="app-shell" style={shellStyle}>
      {phase === 'idle' && (
        <div className="app-intro">
          <header className="app-header">
            <h1>Reading Aid Tool</h1>
            <p className="muted">Bionic reading + WPM pacer.</p>
          </header>
          <FileInput
            onLoad={handleLoad}
            onError={(message) => {
              setDoc(null);
              setError(message);
            }}
          />
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {phase === 'resume-prompt' && doc && resumeRecord && (
        <div className="app-intro">
          <ResumePrompt
            record={resumeRecord}
            onResume={handleResume}
            onStartOver={handleStartOver}
          />
        </div>
      )}

      {phase === 'reading' && doc && (
        <>
          <div className="app-top">
            <div className="reader-toolbar">
              <div className="reader-title-row">
                <button
                  type="button"
                  className="secondary"
                  onClick={handleLoadAnother}
                >
                  ← Load another
                </button>
                {doc.title && <span className="reader-doc-title">{doc.title}</span>}
              </div>
              <div className="reader-toolbar-controls">
                <Settings
                  bionic={bionic}
                  onBionicChange={setBionic}
                  showBionic={mode !== 'rsvp'}
                  showTextSize={mode !== 'rsvp'}
                  naturalPauses={naturalPauses}
                  onNaturalPausesChange={setNaturalPauses}
                  display={display}
                  onDisplayChange={setDisplay}
                />
                <ThemeSelector theme={theme} onThemeChange={setTheme} />
              </div>
            </div>

            <PresetsPanel
              userPresets={userPresets}
              activePresetId={activePresetId}
              isModified={isModified}
              currentBundle={currentBundle}
              onApply={applyPreset}
              onSaveNew={handleSaveNewPreset}
              onRename={handleRenamePreset}
              onDelete={handleDeleteUserPreset}
            />

            <PacerControls
              pacer={pacer}
              count={words.length}
              wpm={wpm}
              onWpmChange={setWpm}
            />

            <ModeSettings
              mode={mode}
              onModeChange={setMode}
              flowing={flowing}
              onFlowingChange={setFlowing}
              rsvp={rsvp}
              onRsvpChange={setRsvp}
              chunk={chunk}
              onChunkChange={setChunk}
            />

            <p className="muted small kbd-hint">
              Space play/pause · ←/→ word · Home restart · click a word to jump
            </p>
          </div>

          {mode === 'flowing' && (
            <FlowingHighlight
              document={doc}
              words={words}
              bionic={bionic}
              pacer={pacer}
              wpm={wpm}
              settings={flowing}
              layoutKey={layoutKey}
              onSeekWord={pacer.seek}
            />
          )}

          {mode === 'rsvp' && (
            <Rsvp
              document={doc}
              words={words}
              pacer={pacer}
              wpm={wpm}
              dwell={dwell}
              naturalPauses={naturalPauses}
              settings={rsvp}
            />
          )}

          {mode === 'chunk' && (
            <ChunkHighlight
              document={doc}
              words={words}
              bionic={bionic}
              pacer={pacer}
              settings={chunk}
              layoutKey={layoutKey}
              onSeekWord={pacer.seek}
            />
          )}
        </>
      )}
    </main>
  );
}
