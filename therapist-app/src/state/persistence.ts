import type { AppState } from './store';

/**
 * Useful demo changes survive a refresh.
 *
 * The key carries a version: if the shape of the state changes, older payloads
 * are ignored rather than loaded into a build that cannot read them.
 */
const KEY = 'rbr-journey-hub/v2';

export function loadState(): AppState | undefined {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as AppState;
    // A cheap sanity check — anything unexpected falls back to a fresh demo.
    if (
      !parsed?.clients?.length ||
      !parsed?.practices?.length ||
      !parsed?.resources?.length ||
      !parsed?.availability?.length ||
      !parsed?.messages
    ) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export function saveState(state: AppState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* Private browsing, quota, or no storage — the demo still works. */
  }
}

export function clearState(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
