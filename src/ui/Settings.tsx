import type { BionicIntensity } from '../reader/bionic';

/**
 * Global reader settings (§8). Milestone 3 covers the bionic on/off toggle and
 * intensity. Font size / line length join here in the polish milestone (§9.7).
 */

export interface BionicSettings {
  enabled: boolean;
  intensity: BionicIntensity;
}

export const DEFAULT_BIONIC: BionicSettings = {
  enabled: true,
  intensity: 'medium',
};

/** Reader typography (M7): applied as CSS variables on the laid-out reader. */
export interface ReaderDisplay {
  /** Body font size in rem. */
  fontSize: number;
  /** Reading column max width in rem (line length / measure). */
  lineLength: number;
}

export const DEFAULT_DISPLAY: ReaderDisplay = { fontSize: 1.125, lineLength: 42 };

const INTENSITIES: BionicIntensity[] = ['low', 'medium', 'high'];

interface SettingsProps {
  bionic: BionicSettings;
  onBionicChange: (next: BionicSettings) => void;
  /**
   * Whether to render the bionic controls. Hidden in RSVP mode (one ORP-anchored
   * word — bionic doesn't apply). State is untouched, so the toggle/intensity
   * return unchanged when switching back to a laid-out mode.
   */
  showBionic: boolean;
  /**
   * Whether to render the global Text size slider. Hidden in RSVP mode, where it
   * does nothing (RSVP has its own Font size); Line width stays, since it does
   * size the RSVP word grid + context strip. State is untouched either way.
   */
  showTextSize: boolean;
  /** Punctuation-aware pacing toggle (refinement A) — applies to every mode. */
  naturalPauses: boolean;
  onNaturalPausesChange: (next: boolean) => void;
  display: ReaderDisplay;
  onDisplayChange: (next: ReaderDisplay) => void;
}

export function Settings({
  bionic,
  onBionicChange,
  showBionic,
  showTextSize,
  naturalPauses,
  onNaturalPausesChange,
  display,
  onDisplayChange,
}: SettingsProps) {
  return (
    <div className="settings">
      {showBionic && (
        <>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={bionic.enabled}
              onChange={(e) => onBionicChange({ ...bionic, enabled: e.target.checked })}
            />
            Bionic reading
          </label>

          <div
            className={`settings-intensity${bionic.enabled ? '' : ' disabled'}`}
            role="group"
            aria-label="Bionic intensity"
          >
            {INTENSITIES.map((level) => (
              <button
                key={level}
                type="button"
                className={`chip${bionic.intensity === level ? ' active' : ''}`}
                disabled={!bionic.enabled}
                onClick={() => onBionicChange({ ...bionic, intensity: level })}
              >
                {level[0].toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
        </>
      )}

      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={naturalPauses}
          onChange={(e) => onNaturalPausesChange(e.target.checked)}
        />
        Natural pauses
      </label>

      {showTextSize && (
        <label className="mode-setting">
          <span className="muted small">Text size</span>
          <input
            type="range"
            min={0.9}
            max={1.7}
            step={0.05}
            value={display.fontSize}
            onChange={(e) =>
              onDisplayChange({ ...display, fontSize: Number(e.target.value) })
            }
            aria-label="Reader text size"
          />
        </label>
      )}

      <label className="mode-setting">
        <span className="muted small">Line width</span>
        <input
          type="range"
          min={28}
          max={56}
          step={2}
          value={display.lineLength}
          onChange={(e) =>
            onDisplayChange({ ...display, lineLength: Number(e.target.value) })
          }
          aria-label="Reader line width"
        />
      </label>
    </div>
  );
}
