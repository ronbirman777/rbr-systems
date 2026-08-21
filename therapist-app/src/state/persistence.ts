import type { EcosystemState } from './ecosystemReducer';

/**
 * The demo keeps its state for the length of a browser tab.
 *
 * A live demo should survive an accidental refresh half-way through the story,
 * but should still open clean in a new tab — so this uses `sessionStorage`
 * rather than `localStorage`, and the "reset demo" control clears it outright.
 *
 * The key carries a version: if the shape of the state changes, older payloads
 * are ignored instead of being loaded into a build that cannot read them.
 */
const KEY = 'rbr-companion-demo/v1';

export function loadState(): EcosystemState | undefined {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as EcosystemState;
    // A cheap sanity check — anything unexpected falls back to a fresh demo.
    if (!parsed?.clients?.length || !parsed?.practices?.length) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function saveState(state: EcosystemState): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* Private browsing, quota, or no storage at all — the demo still works. */
  }
}

export function clearState(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
