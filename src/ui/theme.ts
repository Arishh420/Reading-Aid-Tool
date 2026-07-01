/**
 * Reader themes (§ user request). Each theme is purely a CSS-variable swap via
 * the `data-theme` attribute on <html> — see index.css. Light is the default
 * because bionic bolding reads with stronger contrast on a light background.
 */

export type Theme = 'light' | 'sepia' | 'dark' | 'dim';

export const THEMES: { id: Theme; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'dark', label: 'Dark' },
  { id: 'dim', label: 'Dim' },
];

export const DEFAULT_THEME: Theme = 'light';
