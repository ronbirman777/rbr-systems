"use client";

import { useEffect } from "react";
import { mediaPrefetchAllowed, prefetchMedia, type MediaPrefetchItem } from "@/lib/media/prefetch";

type ConnectionLike = { saveData?: boolean; effectiveType?: string };

/** NetworkInformation, which is still not in lib.dom and absent on Safari. */
function connection(): ConnectionLike | undefined {
  return (navigator as Navigator & { connection?: ConnectionLike }).connection;
}

function idle(run: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (w.requestIdleCallback) {
    const handle = w.requestIdleCallback(run, { timeout: 3000 });
    return () => w.cancelIdleCallback?.(handle);
  }
  // Safari has no requestIdleCallback. A plain delay is a cruder way of
  // saying the same thing - let the current screen finish first.
  const timer = window.setTimeout(run, 1200);
  return () => window.clearTimeout(timer);
}

/**
 * Step 4 of CP4's loading ladder: after the shell, the current hero and
 * the current screen's own below-the-fold content, warm the media the
 * next navigation is likely to need.
 *
 * Rendering it is declarative and side-effect-only - it draws nothing.
 * Each Guest App passes the images of the screens the visitor is NOT on,
 * in its own navigation order, and this decides WHEN (never before load,
 * never while the main thread is busy) and WHETHER (never on a metered
 * or very slow connection) they are fetched. The how - two at a time, at
 * low priority, through the browser's own candidate selection - is in
 * lib/media/prefetch.ts.
 *
 * `items` is read once, on mount. Warming is a one-shot per session by
 * design: re-running it as the visitor moves between tabs would spend
 * data on screens they have already left, and the per-document image
 * cache has made those screens free anyway.
 */
export function MediaPrefetch({ items }: { items: MediaPrefetchItem[] }) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const conn = connection();
    if (
      !mediaPrefetchAllowed({
        saveData: conn?.saveData,
        effectiveType: conn?.effectiveType,
        prefersReducedData: window.matchMedia?.("(prefers-reduced-data: reduce)").matches,
      })
    ) {
      return;
    }

    let cancelPrefetch: (() => void) | undefined;
    const start = () => {
      cancelPrefetch = prefetchMedia(items, document);
    };

    // Only once the current screen has actually finished loading - this
    // must never be the reason an LCP image waits.
    let cancelIdle: (() => void) | undefined;
    const afterLoad = () => {
      cancelIdle = idle(start);
    };
    if (document.readyState === "complete") afterLoad();
    else window.addEventListener("load", afterLoad, { once: true });

    return () => {
      window.removeEventListener("load", afterLoad);
      cancelIdle?.();
      cancelPrefetch?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount by design; see the note above.
  }, []);

  return null;
}
