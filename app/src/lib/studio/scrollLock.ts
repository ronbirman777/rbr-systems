/**
 * TASK 033 (mobile Studio menu): background scroll lock that keeps the
 * exact scroll position.
 *
 * `overflow: hidden` on <body> alone does not stop iOS Safari from
 * scrolling the page behind a fixed overlay. The iOS-safe technique is to
 * pin the body: `position: fixed; top: -scrollY; left: 0; right: 0`, which
 * freezes the page visually where it was, and on release put the styles
 * back and scroll to the saved position instantly (any smooth
 * `scroll-behavior` is suspended for that one jump, so the restore is
 * exact and invisible).
 *
 * Nested locks are counted: only the first lock pins and only the last
 * release restores. `releaseScrollLock()` lets a caller restore BEFORE it
 * navigates, so a following `scrollTo(0, 0)` for a new section is not
 * undone by the overlay's own cleanup (which is then a no-op).
 *
 * The environment is injectable so the rules are unit-tested without a DOM.
 */

type StyleLike = Record<string, string>;
export type ScrollLockEnv = {
  win: { scrollX: number; scrollY: number; scrollTo: (x: number, y: number) => void };
  doc: { documentElement: { style: StyleLike }; body: { style: StyleLike } };
};

const BODY_KEYS = ["position", "top", "left", "right", "width", "overflow"] as const;

type ActiveLock = { env: ScrollLockEnv; x: number; y: number; body: Record<string, string> };

let active: ActiveLock | null = null;
let depth = 0;

function browserEnv(): ScrollLockEnv | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  return { win: window, doc: document as unknown as ScrollLockEnv["doc"] };
}

/** Pins the page where it is. Returns this lock's own release function (idempotent). */
export function lockScroll(env: ScrollLockEnv | null = browserEnv()): () => void {
  if (!env) return () => {};
  depth += 1;
  if (depth === 1) {
    const { win, doc } = env;
    const x = win.scrollX;
    const y = win.scrollY;
    const body: Record<string, string> = {};
    for (const k of BODY_KEYS) body[k] = doc.body.style[k] ?? "";
    active = { env, x, y, body };
    const s = doc.body.style;
    s.position = "fixed";
    s.top = `-${y}px`;
    s.left = "0";
    s.right = "0";
    s.width = "100%";
    s.overflow = "hidden";
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (depth === 0) return; // already released by releaseScrollLock()
    depth -= 1;
    if (depth === 0) restore();
  };
}

/** Releases every lock now and restores the saved position (no-op when unlocked). */
export function releaseScrollLock(): void {
  if (depth === 0) return;
  depth = 0;
  restore();
}

export function isScrollLocked(): boolean {
  return depth > 0;
}

function restore() {
  const lock = active;
  active = null;
  if (!lock) return;
  const { win, doc } = lock.env;
  for (const k of BODY_KEYS) doc.body.style[k] = lock.body[k];
  const html = doc.documentElement.style;
  const previousBehavior = html.scrollBehavior ?? "";
  html.scrollBehavior = "auto";
  win.scrollTo(lock.x, lock.y);
  html.scrollBehavior = previousBehavior;
}

/**
 * Focus trap step: the index Tab (or Shift+Tab) moves to among `count`
 * focusable elements, wrapping at both ends. `current` -1 means focus is
 * outside the list (enter at the first / last).
 */
export function trapFocusIndex(current: number, count: number, shift: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return shift ? count - 1 : 0;
  return shift ? (current - 1 + count) % count : (current + 1) % count;
}
