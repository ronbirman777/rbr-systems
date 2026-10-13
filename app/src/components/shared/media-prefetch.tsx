"use client";

import { useEffect, useRef } from "react";
import {
  createMediaPrefetcher,
  mediaPrefetchAllowed,
  mediaPrefetchBackgroundAllowed,
  mediaPrefetchPlan,
  type MediaPrefetchEntry,
  type MediaPrefetcher,
  type MediaPrefetchItem,
} from "@/lib/media/prefetch";
import { waitForGuestHero } from "@/lib/guest/heroWait";

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

/** The visitor's data/network signals, read once. */
function prefetchSignals() {
  const conn = connection();
  return {
    saveData: conn?.saveData,
    effectiveType: conn?.effectiveType,
    prefersReducedData: window.matchMedia?.("(prefers-reduced-data: reduce)").matches,
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  };
}

/**
 * Step 4 of CP4's loading ladder, staged by TASK 033 (plan 4.6): warm the
 * media the next navigation is likely to need.
 *
 * Rendering it is declarative and side-effect-only - it draws nothing.
 * Each Guest App passes the images of the screens the visitor is NOT on,
 * in its own navigation order, each tagged with its stage, and this
 * decides WHEN and WHETHER they are fetched; the how - two at a time, at
 * low priority, through the browser's own candidate selection, each URL
 * once - is in lib/media/prefetch.ts.
 *
 *   Stage 2 (high)        starts when the current screen's hero is decoded
 *                         (or its 1.5s cap passes, or there is no hero).
 *   Stage 3 (background)  starts after `load` and an idle main thread, and
 *                         only where mediaPrefetchBackgroundAllowed says so.
 *   Neither               runs at all on Save-Data, 2g or reduced-data.
 *
 * `items` is read once, on mount: warming is a one-shot per session by
 * design. `activeKey` (the current tab) is the one live input - when it
 * changes, everything queued but not yet started is set aside, so the
 * destination screen's own images get the connection first, and is
 * re-offered once the main thread is idle again.
 *
 * It only ever sees URLs from the payload this visitor was served: a
 * code-protected Space renders its Guest App - and so this - only after
 * the access cookie was accepted, so nothing is warmed before access.
 */
export function MediaPrefetch({ items, activeKey }: { items: MediaPrefetchItem[]; activeKey?: string }) {
  const prefetcherRef = useRef<MediaPrefetcher | null>(null);
  const lastKey = useRef(activeKey);
  const setAside = useRef<MediaPrefetchEntry[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const signals = prefetchSignals();
    if (!mediaPrefetchAllowed(signals)) return;

    const plan = mediaPrefetchPlan(items);
    if (!plan.high.length && !plan.background.length) return;
    const prefetcher = createMediaPrefetcher(document);
    prefetcherRef.current = prefetcher;

    // Stage 2: as soon as the hero this screen is showing is ready.
    const cancelHero = waitForGuestHero(document, () => prefetcher.enqueue(plan.high));

    // Stage 3: only once the current screen has actually finished loading
    // and the main thread is idle - this must never be the reason an LCP
    // image waits.
    let cancelIdle: (() => void) | undefined;
    const afterLoad = () => {
      cancelIdle = idle(() => {
        if (mediaPrefetchBackgroundAllowed(signals)) prefetcher.enqueue(plan.background);
      });
    };
    if (document.readyState === "complete") afterLoad();
    else window.addEventListener("load", afterLoad, { once: true });

    return () => {
      cancelHero();
      window.removeEventListener("load", afterLoad);
      cancelIdle?.();
      prefetcher.cancel();
      prefetcherRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount by design; see the note above.
  }, []);

  useEffect(() => {
    if (activeKey === lastKey.current) return;
    lastKey.current = activeKey;
    const prefetcher = prefetcherRef.current;
    if (!prefetcher) return;
    // Accumulated, so a second press before the idle callback runs does
    // not lose what the first one set aside.
    setAside.current.push(...prefetcher.dropQueued());
    if (!setAside.current.length) return;
    return idle(() => prefetcher.enqueue(setAside.current.splice(0)));
  }, [activeKey]);

  return null;
}
