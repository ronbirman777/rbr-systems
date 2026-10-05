/**
 * The client half of the fixture.
 *
 * It imports the SHIPPED prefetcher - lib/media/prefetch.ts - and
 * reproduces only MediaPrefetch's thin timing wrapper (wait for load,
 * then for an idle main thread, and honour the data-saving signals).
 * That wrapper is covered by unit tests; what needs a real browser is
 * the link-building and queueing below it, and that is the real module.
 *
 * The inventory arrives as data, computed at render time by the app's
 * own guestPrefetchItems / teachPrefetchItems, so what gets warmed here
 * is exactly what the app would warm.
 */
import { mediaPrefetchAllowed, prefetchMedia, type MediaPrefetchItem } from "@/lib/media/prefetch";

const node = document.getElementById("prefetch-items");
const items: MediaPrefetchItem[] = node ? JSON.parse(node.textContent || "[]") : [];

type ConnectionLike = { saveData?: boolean; effectiveType?: string };
const conn = (navigator as Navigator & { connection?: ConnectionLike }).connection;

declare global {
  interface Window {
    __prefetchItems?: MediaPrefetchItem[];
    __prefetchStarted?: number;
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  }
}
window.__prefetchItems = items;

if (
  mediaPrefetchAllowed({
    saveData: conn?.saveData,
    effectiveType: conn?.effectiveType,
    prefersReducedData: window.matchMedia?.("(prefers-reduced-data: reduce)").matches,
  })
) {
  const start = () => {
    window.__prefetchStarted = Math.round(performance.now());
    prefetchMedia(items, document);
  };
  const afterLoad = () => {
    if (window.requestIdleCallback) window.requestIdleCallback(start, { timeout: 3000 });
    else window.setTimeout(start, 1200);
  };
  if (document.readyState === "complete") afterLoad();
  else window.addEventListener("load", afterLoad, { once: true });
}
