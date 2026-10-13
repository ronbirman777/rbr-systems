/**
 * TASK 033 (D-LD1) - "is the Guest App's first image ready to be seen?"
 *
 * One definition, two consumers: the branded hero-wait overlay (which stays
 * up until this resolves) and the media prefetcher (whose Stage 2 starts
 * when it resolves, so speculative downloads never compete with the hero).
 *
 * The target is the first image in the Guest column marked as the screen's
 * LCP candidate (`data-guest-hero`, set by BrandImage for `priority` images),
 * else the Space logo (`data-guest-logo`). No target at all - a Space with
 * no hero photo renders its gradient fallback, which needs no download - is
 * "ready" immediately.
 *
 * Never stuck, by construction:
 *   - decoded   the image loaded and decoded (img.decode() resolved, or it
 *               was already complete when we looked);
 *   - error     the image failed (decode() rejected, or it is complete with
 *               no pixels) - BrandImage's gradient/alt state shows instead;
 *   - cap       HERO_WAIT_CAP_MS passed first - content is revealed anyway
 *               and the image simply fades in when it arrives;
 *   - none      there was nothing to wait for.
 * `onReady` fires exactly once, and never after the returned cancel().
 */

export const HERO_WAIT_CAP_MS = 1500;

export type HeroReadyReason = "decoded" | "error" | "cap" | "none";

export const GUEST_HERO_SELECTOR = "img[data-guest-hero]";
export const GUEST_LOGO_SELECTOR = "img[data-guest-logo]";

/** The minimal image surface this needs - an HTMLImageElement satisfies it. */
export type HeroImageLike = {
  complete: boolean;
  naturalWidth: number;
  decode: () => Promise<void>;
};

export type HeroRootLike = {
  querySelector: (selector: string) => unknown;
};

export function findGuestHero(root: HeroRootLike): HeroImageLike | null {
  return ((root.querySelector(GUEST_HERO_SELECTOR) ?? root.querySelector(GUEST_LOGO_SELECTOR)) as HeroImageLike | null) ?? null;
}

type Timers = {
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

const DEFAULT_TIMERS: Timers = {
  setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function waitForGuestHero(
  root: HeroRootLike,
  onReady: (reason: HeroReadyReason) => void,
  { capMs = HERO_WAIT_CAP_MS, timers = DEFAULT_TIMERS }: { capMs?: number; timers?: Timers } = {}
): () => void {
  let settled = false;
  let timer: unknown = null;
  const finish = (reason: HeroReadyReason) => {
    if (settled) return;
    settled = true;
    if (timer !== null) timers.clearTimeout(timer);
    onReady(reason);
  };

  const img = findGuestHero(root);
  if (!img) {
    finish("none");
    return () => {};
  }
  if (img.complete) {
    // Already settled before we looked (cached, or loaded before hydration).
    finish(img.naturalWidth > 0 ? "decoded" : "error");
    return () => {};
  }

  timer = timers.setTimeout(() => finish("cap"), capMs);
  let decoding: Promise<void>;
  try {
    decoding = img.decode();
  } catch {
    finish("error");
    return () => {};
  }
  decoding.then(
    () => finish("decoded"),
    () => finish("error")
  );

  return () => {
    settled = true;
    if (timer !== null) timers.clearTimeout(timer);
  };
}
