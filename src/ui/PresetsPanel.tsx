import { useEffect, useRef, useState } from 'react';
import {
  BUILTIN_PRESETS,
  type Preset,
  type PresetBundle,
  type PresetGroup,
  type UserPreset,
} from '../presets/presets';

const GROUP_ORDER: PresetGroup[] = ['flowing', 'rsvp', 'chunk', 'cross'];
const GROUP_LABELS: Record<PresetGroup, string> = {
  flowing: 'Flowing',
  rsvp: 'RSVP',
  chunk: 'Chunk',
  cross: 'Accessibility',
};

interface PresetsPanelProps {
  userPresets: UserPreset[];
  activePresetId: string | null;
  isModified: boolean;
  currentBundle: PresetBundle;
  onApply: (preset: Preset) => void;
  onSaveNew: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function PresetsPanel({
  userPresets,
  activePresetId,
  isModified,
  currentBundle: _currentBundle,
  onApply,
  onSaveNew,
  onRename,
  onDelete,
}: PresetsPanelProps) {
  const [open, setOpen] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const newNameRef = useRef<HTMLInputElement>(null);
  const editNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (savingNew) newNameRef.current?.focus();
  }, [savingNew]);

  useEffect(() => {
    if (editingId) editNameRef.current?.focus();
  }, [editingId]);

  function commitSaveNew() {
    const name = newName.trim();
    if (!name) return;
    onSaveNew(name);
    setNewName('');
    setSavingNew(false);
  }

  function cancelSaveNew() {
    setNewName('');
    setSavingNew(false);
  }

  function startEdit(preset: UserPreset) {
    setEditingId(preset.id);
    setEditingName(preset.name);
  }

  function commitRename() {
    const name = editingName.trim();
    if (name && editingId) onRename(editingId, name);
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function handleDelete(id: string) {
    if (editingId === id) setEditingId(null);
    onDelete(id);
  }

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    items: BUILTIN_PRESETS.filter((p) => p.group === group),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="presets-panel">
      <div className="presets-header">
        <button
          type="button"
          className={`secondary presets-toggle-btn${open ? ' open' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          Presets {open ? '▴' : '▾'}
        </button>
        {open && !savingNew && (
          <button
            type="button"
            className="secondary presets-save-trigger"
            onClick={() => setSavingNew(true)}
          >
            + Save current…
          </button>
        )}
      </div>

      {open && (
        <div className="presets-body">
          {/* Built-in groups */}
          <div className="presets-groups">
            {grouped.map(({ group, label, items }) => (
              <div key={group} className="presets-group">
                <span className="presets-group-label">{label}</span>
                <div className="presets-row" role="group" aria-label={`${label} presets`}>
                  {items.map((preset) => {
                    const active = preset.id === activePresetId;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className={`preset-card${active ? ' active' : ''}`}
                        title={preset.description}
                        onClick={() => onApply(preset)}
                        aria-pressed={active}
                      >
                        {preset.name}
                        {active && isModified && (
                          <span className="preset-modified" aria-label="modified">
                            Modified
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* User presets */}
          {(userPresets.length > 0 || savingNew) && (
            <div className="presets-user-section">
              <span className="presets-group-label">Your Presets</span>
              <div className="presets-row presets-user-row" role="group" aria-label="Your presets">
                {userPresets.map((preset) => {
                  const active = preset.id === activePresetId;
                  if (editingId === preset.id) {
                    return (
                      <span key={preset.id} className="preset-user-editing">
                        <input
                          ref={editNameRef}
                          className="presets-save-input"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename();
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          aria-label="Rename preset"
                        />
                        <button
                          type="button"
                          className="secondary preset-icon-btn"
                          onClick={commitRename}
                          aria-label="Confirm rename"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          className="secondary preset-icon-btn"
                          onClick={cancelEdit}
                          aria-label="Cancel rename"
                        >
                          ✕
                        </button>
                      </span>
                    );
                  }
                  return (
                    <span key={preset.id} className="preset-user-card">
                      <button
                        type="button"
                        className={`preset-card${active ? ' active' : ''}`}
                        title={preset.description || preset.name}
                        onClick={() => onApply(preset)}
                        aria-pressed={active}
                      >
                        {preset.name}
                        {active && isModified && (
                          <span className="preset-modified" aria-label="modified">
                            Modified
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="secondary preset-icon-btn"
                        onClick={() => startEdit(preset)}
                        aria-label={`Rename ${preset.name}`}
                      >
                        ✏
                      </button>
                      <button
                        type="button"
                        className="secondary preset-icon-btn"
                        onClick={() => handleDelete(preset.id)}
                        aria-label={`Delete ${preset.name}`}
                      >
                        ✕
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Save-new form */}
          {savingNew && (
            <div className="presets-save-row">
              <input
                ref={newNameRef}
                className="presets-save-input"
                placeholder="Preset name…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitSaveNew();
                  if (e.key === 'Escape') cancelSaveNew();
                }}
                aria-label="New preset name"
              />
              <button type="button" onClick={commitSaveNew} disabled={!newName.trim()}>
                Save
              </button>
              <button type="button" className="secondary" onClick={cancelSaveNew}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
