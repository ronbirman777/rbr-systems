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
 *   - Compete with the current screen. It starts only once the page has
 *     loaded and the main thread is idle, and every link carries
 *     fetchpriority=low, so it can never push the LCP image back.
 *   - Stampede. Two in flight at a time, each starting only when the
 *     previous finishes.
 *   - Preload the media library. MEDIA_PREFETCH_CAP is a hard ceiling
 *     on how many images one session will ever warm this way.
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
export function mediaPrefetchQueue(items: MediaPrefetchItem[], cap = MEDIA_PREFETCH_CAP) {
  const seen = new Set<string>();
  const out: { src: string; srcSet?: string; sizes?: string }[] = [];
  for (const item of items) {
    const src = item.src;
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push({ src, srcSet: mediaSrcSet(src, item.sizes), sizes: item.sizes });
    if (out.length >= cap) break;
  }
  return out;
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

  let next = 0;
  let cancelled = false;
  const pending = new Set<HTMLLinkElement>();

  const pump = () => {
    if (cancelled || next >= queue.length) return;
    const entry = queue[next++];
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
  };

  for (let i = 0; i < concurrency; i++) pump();

  return () => {
    cancelled = true;
    for (const link of pending) link.remove();
    pending.clear();
  };
}
