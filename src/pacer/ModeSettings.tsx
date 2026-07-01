import type { FlowingSettings } from './modes/FlowingHighlight';
import type { RsvpSettings } from './modes/Rsvp';
import type { ChunkSettings } from './modes/ChunkHighlight';

/**
 * Pacer mode selector + the per-mode settings panel that swaps with it (§7.3).
 * The dropdown picks the mode; the panel below shows only that mode's settings.
 */

export type PacerMode = 'flowing' | 'rsvp' | 'chunk';

export const MODES: { id: PacerMode; label: string }[] = [
  { id: 'flowing', label: 'Flowing highlight' },
  { id: 'rsvp', label: 'RSVP' },
  { id: 'chunk', label: 'Chunk highlight' },
];

const clampInt = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.round(Number.isNaN(n) ? lo : n)));

interface ModeSettingsProps {
  mode: PacerMode;
  onModeChange: (mode: PacerMode) => void;
  flowing: FlowingSettings;
  onFlowingChange: (s: FlowingSettings) => void;
  rsvp: RsvpSettings;
  onRsvpChange: (s: RsvpSettings) => void;
  chunk: ChunkSettings;
  onChunkChange: (s: ChunkSettings) => void;
}

export function ModeSettings({
  mode,
  onModeChange,
  flowing,
  onFlowingChange,
  rsvp,
  onRsvpChange,
  chunk,
  onChunkChange,
}: ModeSettingsProps) {
  return (
    <div className="mode-settings">
      <label className="mode-setting">
        <span className="muted small">Mode</span>
        <select
          className="mode-select"
          value={mode}
          onChange={(e) => onModeChange(e.target.value as PacerMode)}
        >
          {MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      {mode === 'flowing' && (
        <label className="mode-setting">
          <span className="muted small">Lead words</span>
          <input
            type="number"
            className="num"
            min={0}
            max={5}
            value={flowing.lead}
            onChange={(e) =>
              onFlowingChange({ lead: clampInt(Number(e.target.value), 0, 5) })
            }
          />
        </label>
      )}

      {mode === 'rsvp' && (
        <label className="mode-setting">
          <span className="muted small">Font size</span>
          <input
            type="range"
            min={1.5}
            max={6}
            step={0.5}
            value={rsvp.fontSize}
            onChange={(e) => onRsvpChange({ fontSize: Number(e.target.value) })}
          />
          <span className="muted small">{rsvp.fontSize}rem</span>
        </label>
      )}

      {mode === 'chunk' && (
        <label className="mode-setting">
          <span className="muted small">Chunk size</span>
          <input
            type="number"
            className="num"
            min={2}
            max={4}
            value={chunk.chunkSize}
            onChange={(e) =>
              onChunkChange({ chunkSize: clampInt(Number(e.target.value), 2, 4) })
            }
          />
        </label>
      )}
    </div>
  );
}
