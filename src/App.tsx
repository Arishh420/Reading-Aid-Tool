import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Document } from './model/types';
import { flattenWords } from './model/tokenize';
import { FileInput } from './ui/FileInput';
import {
  DEFAULT_BIONIC,
  DEFAULT_DISPLAY,
  Settings,
  type BionicSettings,
  type ReaderDisplay,
} from './ui/Settings';
import { ThemeSelector } from './ui/ThemeSelector';
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

/**
 * Perf-hardened shell: a responsive full-height (100dvh) column. The reader is
 * a fixed-height, internally-scrolling pane (the virtualizer's scroll element);
 * the toolbar and pacer controls sit pinned above it.
 */
export default function App() {
  const [doc, setDoc] = useState<Document | null>(null);
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
    if (!doc) return;
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
  }, [doc, pacer, words]);

  function handleLoad(loaded: Document) {
    if (loaded.blocks.length === 0) {
      setDoc(null);
      setError('No readable text was found in this file.');
      return;
    }
    setError(null);
    setDoc(loaded);
  }

  // Reader typography as CSS variables (M7); the laid-out reader reads these.
  const shellStyle = {
    '--reading-width': `${display.lineLength}rem`,
    '--reader-font-size': `${display.fontSize}rem`,
  } as CSSProperties;
  const layoutKey = `${display.fontSize}|${display.lineLength}`;

  return (
    <main className="app-shell" style={shellStyle}>
      {!doc && (
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

      {doc && (
        <>
          <div className="app-top">
            <div className="reader-toolbar">
              <div className="reader-title-row">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setDoc(null)}
                >
                  ← Load another
                </button>
                {doc.title && <span className="reader-doc-title">{doc.title}</span>}
              </div>
              <div className="reader-toolbar-controls">
                <Settings
                  bionic={bionic}
                  onBionicChange={setBionic}
                  naturalPauses={naturalPauses}
                  onNaturalPausesChange={setNaturalPauses}
                  display={display}
                  onDisplayChange={setDisplay}
                />
                <ThemeSelector theme={theme} onThemeChange={setTheme} />
              </div>
            </div>

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
