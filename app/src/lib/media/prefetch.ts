import { mediaSrcSet } from "./cachePolicy";

/**
 * Background warming of the media a Guest is LIKELY to want next.
 *
 * Both Guest Apps are one client bundle whose bottom nav is a React
 * state switch, so pressing a tab unmounts one screen's subtree and
 * mounts another's. CP4 measured what that costs on a Slow 4G phone:
 * revisiting a tab is already free (the per-document image cache covers
 * it), but the FIRST press of an image-heavy screen left it blank for
 * 923ms while seven covers were fetched one redirect at a time. Warming
 * them while the visitor is reading the screen they are already on
 * brought that to 5ms.
 *
 * The mechanism is `<link rel="preload" as="image">` rather than a fetch
 * or a detached Image(), for one specific reason: given `imagesrcset`
 * and `imagesizes` the BROWSER runs its own candidate selection, so the
 * URL warmed is provably the one the <img> will later ask for. Building
 * the URL by hand - picking a width ourselves - would warm a different
 * candidate and cost two downloads instead of one. Measured: 0 media
 * requests at press time, not 7 and not 14.
 *
 * What it will not do:
 *
 *   - Compete with the current screen. Since TASK 033 it runs in two
 *     stages: Stage 2 (the first image of each other tab) starts once
 *     the current screen's hero is DECODED (lib/guest/heroWait.ts) -
 *     earlier than the old load+idle, which left an early tab press
 *     waiting ~2.7s - and Stage 3 (the speculative tail) still waits for
 *     load and an idle main thread. Every link carries fetchpriority=low,
 *     so neither can push the LCP image back.
 *   - Stampede. Two in flight at a time, across both stages, each
 *     starting only when the previous finishes.
 *   - Preload the media library. MEDIA_PREFETCH_CAP (Stage 2) and
 *     MEDIA_PREFETCH_BACKGROUND_CAP (Stage 3) are hard ceilings on how
 *     many images one session will ever warm this way.
 *   - Spend a metered visitor's data. See mediaPrefetchAllowed.
 *
 * It is purely a cache warmer: it requests URLs the page is already
 * entitled to request, through the same authorized /api/media route,
 * with no credentials of its own. It cannot widen what a visitor can
 * see, and on a Space whose media is uncacheable the warmed response is
 * simply not reused - which is why the data-saving checks below matter.
 */
export type MediaPrefetchItem = {
  /** An already-resolved display URL, exactly as the <img> receives it. */
  src: string | null | undefined;
  /** The same `sizes` the <img> will carry, or omitted if it carries none. */
  sizes?: string;
  /**
   * TASK 033 (plan 4.6) - when it is warmed:
   *   2 (default, "high")   the first image of each other tab; starts as soon
   *                         as the current screen's hero is decoded.
   *   3 ("background")      everything else worth warming (remaining covers,
   *                         first images of Explore sub-screens, galleries);
   *                         starts only once the page has loaded and the main
   *                         thread is idle, and only on a capable connection.
   */
  stage?: 2 | 3;
};

/**
 * Never warm more than this many images in one Guest session.
 *
 * 12 rather than something smaller because CP4 priced the cap, and the
 * benefit turns out to be close to all-or-nothing - the slowest image
 * still outstanding is what the visitor waits for, so warming most of a
 * screen buys proportionally little. Flow's Explore, 7 covers, Slow 4G,
 * 390x844 at 3x, press-to-painted against bytes spent speculatively:
 *
 *   cap 0   1990ms   0 KB
 *   cap 4   1675ms  178 KB
 *   cap 6   1078ms  299 KB
 *   cap 8    713ms  371 KB
 *   cap 12    20ms  449 KB
 *
 * Those bytes are not extra for a visitor who opens the tab - they are
 * the same bytes, paid earlier - so the real cost is only borne by
 * someone who never opens it. The cap is what bounds THAT case, and the
 * data-saving checks below are what keep it off a metered connection
 * entirely. 12 covers both products' full inventory for a Space with
 * every module enabled, which is also the worst case.
 */
export const MEDIA_PREFETCH_CAP = 12;
/** TASK 033: Stage 3 (background) has its own budget of the same size. */
export const MEDIA_PREFETCH_BACKGROUND_CAP = 12;
/** In flight at once. Low enough that it cannot saturate a phone link. */
export const MEDIA_PREFETCH_CONCURRENCY = 2;

/**
 * Whether this visitor's connection should be spent on speculative
 * media at all.
 *
 * Prefetching trades bandwidth for latency, and the trade is only ever
 * worth it when the bandwidth is cheap. Save-Data is an explicit request
 * not to spend it; 2g means the speculative fetch would itself be the
 * bottleneck; prefers-reduced-data is the same request expressed as a
 * media feature. Any of them and we do nothing at all - today's
 * behaviour, unchanged.
 *
 * Absent information is treated as permission: Safari exposes no
 * NetworkInformation, and refusing to prefetch there would mean the
 * feature never ran on iOS, which is most of the Guest audience.
 */
export function mediaPrefetchAllowed(signals: {
  saveData?: boolean;
  effectiveType?: string;
  prefersReducedData?: boolean;
}): boolean {
  if (signals.prefersReducedData) return false;
  if (signals.saveData) return false;
  if (signals.effectiveType === "slow-2g" || signals.effectiveType === "2g") return false;
  return true;
}

/**
 * TASK 033: whether the BACKGROUND stage (3) may run on top of Stage 2.
 * Stage 3 is the speculative tail - images two presses deep - so it is off
 * not only where all prefetching is off (mediaPrefetchAllowed) but also on a
 * 3g connection and on a low-memory device (deviceMemory <= 2 GB), where it
 * would compete with the screen the visitor is actually using. Absent
 * signals (Safari) are permission, as above.
 */
export function mediaPrefetchBackgroundAllowed(signals: {
  saveData?: boolean;
  effectiveType?: string;
  prefersReducedData?: boolean;
  deviceMemory?: number;
}): boolean {
  if (!mediaPrefetchAllowed(signals)) return false;
  if (signals.effectiveType === "3g") return false;
  if (typeof signals.deviceMemory === "number" && signals.deviceMemory <= 2) return false;
  return true;
}

/**
 * Only the stable, authorized /api/media URL is ever warmed - never a signed
 * Storage URL (those expire, and caching one would outlive its window) and
 * never anything else. Every Guest prefetch inventory already produces only
 * these; this makes it a rule rather than a habit. Expiry is then safe: a
 * warmed 307 older than its cache window simply re-resolves.
 */
export function isPrefetchableMediaUrl(src: string): boolean {
  return src.startsWith("/api/media/");
}

/**
 * The queue a given set of items produces: resolved, de-duplicated,
 * order preserved, capped.
 *
 * Order is the caller's: each Guest App lists its screens in the order
 * its own navigation shows them, so the tab a visitor is most likely to
 * reach next is warmed first and the cap bites on the least likely.
 * De-duplication is by URL, because one image reused across two screens
 * (a teacher's portrait in the header and again on About) must be warmed
 * once.
 */
export type MediaPrefetchEntry = { src: string; srcSet?: string; sizes?: string };

export function mediaPrefetchQueue(items: MediaPrefetchItem[], cap = MEDIA_PREFETCH_CAP, seen = new Set<string>()) {
  const out: MediaPrefetchEntry[] = [];
  for (const item of items) {
    const src = item.src;
    if (!src || seen.has(src) || !isPrefetchableMediaUrl(src)) continue;
    seen.add(src);
    out.push({ src, srcSet: mediaSrcSet(src, item.sizes), sizes: item.sizes });
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * TASK 033: the two staged queues for one set of items - Stage 2 ("high")
 * and Stage 3 ("background") - each capped by its own budget, de-duplicated
 * ACROSS both (an image listed in both is warmed once, in the earlier
 * stage), order preserved within each.
 */
export function mediaPrefetchPlan(
  items: MediaPrefetchItem[],
  { highCap = MEDIA_PREFETCH_CAP, backgroundCap = MEDIA_PREFETCH_BACKGROUND_CAP } = {}
): { high: MediaPrefetchEntry[]; background: MediaPrefetchEntry[] } {
  const seen = new Set<string>();
  const high = mediaPrefetchQueue(
    items.filter((i) => (i.stage ?? 2) === 2),
    highCap,
    seen
  );
  const background = mediaPrefetchQueue(
    items.filter((i) => i.stage === 3),
    backgroundCap,
    seen
  );
  return { high, background };
}

export type MediaPrefetcher = {
  /** Append entries to the queue (already-seen URLs are skipped). */
  enqueue: (entries: MediaPrefetchEntry[]) => void;
  /**
   * Drop everything queued but NOT yet started and return it; in-flight
   * warms finish. Used on a tab press, so the destination screen's own
   * images get the connection first.
   */
  dropQueued: () => MediaPrefetchEntry[];
  /** Stop, and withdraw every warm still outstanding. */
  cancel: () => void;
};

/**
 * One pump for a Guest session: at most `concurrency` warms in flight, each
 * finishing (load or error) before the next starts, and a URL is never
 * warmed twice in the same session, whichever stage asked for it.
 */
export function createMediaPrefetcher(
  doc: Document,
  { concurrency = MEDIA_PREFETCH_CONCURRENCY } = {}
): MediaPrefetcher {
  const queue: MediaPrefetchEntry[] = [];
  const started = new Set<string>();
  const pending = new Set<HTMLLinkElement>();
  let cancelled = false;

  const pump = () => {
    while (!cancelled && pending.size < concurrency && queue.length) {
      const entry = queue.shift()!;
      if (started.has(entry.src)) continue;
      started.add(entry.src);
      const link = doc.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.setAttribute("fetchpriority", "low");
      if (entry.srcSet) {
        // The canonical responsive-preload form: imagesrcset + imagesizes
        // and NO href, so the browser runs its own candidate selection and
        // lands on the same URL the <img> will. Adding href alongside is
        // what produces a second, unused download.
        link.setAttribute("imagesrcset", entry.srcSet);
        if (entry.sizes) link.setAttribute("imagesizes", entry.sizes);
      } else {
        link.href = entry.src;
      }
      const done = () => {
        pending.delete(link);
        pump();
      };
      link.addEventListener("load", done, { once: true });
      link.addEventListener("error", done, { once: true });
      pending.add(link);
      doc.head.appendChild(link);
    }
  };

  return {
    enqueue(entries) {
      if (cancelled) return;
      for (const entry of entries) {
        if (!started.has(entry.src) && !queue.some((q) => q.src === entry.src)) queue.push(entry);
      }
      pump();
    },
    dropQueued() {
      return queue.splice(0);
    },
    cancel() {
      cancelled = true;
      queue.length = 0;
      for (const link of pending) link.remove();
      pending.clear();
    },
  };
}

/**
 * Warm the queue into `doc`, two at a time. Returns a cancel function
 * that stops the pump and removes any link that has not resolved yet -
 * so a visitor who navigates away mid-warm is not still paying for it.
 */
export function prefetchMedia(
  items: MediaPrefetchItem[],
  doc: Document,
  { cap = MEDIA_PREFETCH_CAP, concurrency = MEDIA_PREFETCH_CONCURRENCY } = {}
): () => void {
  const queue = mediaPrefetchQueue(items, cap);
  if (!queue.length) return () => {};
  const prefetcher = createMediaPrefetcher(doc, { concurrency });
  prefetcher.enqueue(queue);
  return prefetcher.cancel;
}
