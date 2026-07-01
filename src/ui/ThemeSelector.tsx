import { THEMES, type Theme } from './theme';

/**
 * Compact theme selector — a small row of chips for the toolbar. Each chip
 * swaps the active theme; App applies it as data-theme on <html>.
 */
export function ThemeSelector({
  theme,
  onThemeChange,
}: {
  theme: Theme;
  onThemeChange: (next: Theme) => void;
}) {
  return (
    <div className="theme-selector" role="group" aria-label="Reader theme">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`chip chip-sm${theme === t.id ? ' active' : ''}`}
          aria-pressed={theme === t.id}
          onClick={() => onThemeChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
