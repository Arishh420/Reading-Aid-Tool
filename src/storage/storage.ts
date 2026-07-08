/**
 * Generic localStorage wrapper — the app's first and only persistence layer.
 * All keys are namespaced under STORAGE_PREFIX so future schema versions can
 * coexist with or migrate from the v1 layout.
 *
 * Designed to be thin and swappable: the three public functions are the only
 * calls that touch the platform API, so an Android port can substitute
 * AsyncStorage (or similar) behind the same interface with minimal friction.
 *
 * All operations are wrapped in try/catch because localStorage can throw in
 * private-browsing sessions and when the storage quota is exceeded.
 */

export const STORAGE_PREFIX = 'readingaid_v1:';

export function storageGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Returns false if the write fails (quota exceeded, unavailable). */
export function storageSet<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function storageRemove(key: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // ignore — key was absent or storage is unavailable
  }
}
