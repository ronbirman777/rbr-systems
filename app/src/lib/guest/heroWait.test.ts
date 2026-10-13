import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GUEST_HERO_SELECTOR, GUEST_LOGO_SELECTOR, HERO_WAIT_CAP_MS, waitForGuestHero, type HeroImageLike } from "./heroWait";

/**
 * TASK 033 (D-LD1): the hero-wait decides when the branded overlay lifts
 * and when Stage 2 prefetching starts. Its one hard promise is "never
 * stuck": every path ends in exactly one onReady, by 1.5s at the latest.
 */

function img(over: Partial<HeroImageLike> = {}): HeroImageLike & { settle: (ok: boolean) => void } {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const decoding = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    complete: false,
    naturalWidth: 0,
    decode: () => decoding,
    settle: (ok) => (ok ? resolve() : reject(new Error("EncodingError"))),
    ...over,
  };
}

function root(found: Record<string, HeroImageLike | null>) {
  return { querySelector: (sel: string) => found[sel] ?? null };
}

const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("waitForGuestHero", () => {
  it("is ready at once when there is no hero and no logo (the gradient needs no download)", () => {
    const onReady = vi.fn();
    waitForGuestHero(root({}), onReady);
    expect(onReady).toHaveBeenCalledExactlyOnceWith("none");
  });

  it("is ready at once when the hero already loaded before hydration", () => {
    const onReady = vi.fn();
    waitForGuestHero(root({ [GUEST_HERO_SELECTOR]: img({ complete: true, naturalWidth: 1200 }) }), onReady);
    expect(onReady).toHaveBeenCalledExactlyOnceWith("decoded");
  });

  it("treats an already-failed hero as an error, never a wait", () => {
    const onReady = vi.fn();
    waitForGuestHero(root({ [GUEST_HERO_SELECTOR]: img({ complete: true, naturalWidth: 0 }) }), onReady);
    expect(onReady).toHaveBeenCalledExactlyOnceWith("error");
  });

  it("waits for img.decode() and reveals as soon as it resolves", async () => {
    const hero = img();
    const onReady = vi.fn();
    waitForGuestHero(root({ [GUEST_HERO_SELECTOR]: hero }), onReady);
    await flush();
    expect(onReady).not.toHaveBeenCalled();
    hero.settle(true);
    await flush();
    expect(onReady).toHaveBeenCalledExactlyOnceWith("decoded");
    // The cap firing later changes nothing.
    vi.advanceTimersByTime(HERO_WAIT_CAP_MS * 2);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("reveals immediately on an image error", async () => {
    const hero = img();
    const onReady = vi.fn();
    waitForGuestHero(root({ [GUEST_HERO_SELECTOR]: hero }), onReady);
    hero.settle(false);
    await flush();
    expect(onReady).toHaveBeenCalledExactlyOnceWith("error");
  });

  it("is hard-capped at 1.5s when the hero never arrives", async () => {
    expect(HERO_WAIT_CAP_MS).toBe(1500);
    const onReady = vi.fn();
    waitForGuestHero(root({ [GUEST_HERO_SELECTOR]: img() }), onReady);
    vi.advanceTimersByTime(1499);
    expect(onReady).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onReady).toHaveBeenCalledExactlyOnceWith("cap");
  });

  it("falls back to the logo when there is no hero photo", async () => {
    const logo = img();
    const onReady = vi.fn();
    waitForGuestHero(root({ [GUEST_LOGO_SELECTOR]: logo }), onReady);
    logo.settle(true);
    await flush();
    expect(onReady).toHaveBeenCalledExactlyOnceWith("decoded");
  });

  it("prefers the hero over the logo", async () => {
    const hero = img();
    const logo = img({ complete: true, naturalWidth: 96 });
    const onReady = vi.fn();
    waitForGuestHero(root({ [GUEST_HERO_SELECTOR]: hero, [GUEST_LOGO_SELECTOR]: logo }), onReady);
    expect(onReady).not.toHaveBeenCalled();
    hero.settle(true);
    await flush();
    expect(onReady).toHaveBeenCalledExactlyOnceWith("decoded");
  });

  it("never calls back after it was cancelled (unmount)", async () => {
    const hero = img();
    const onReady = vi.fn();
    const cancel = waitForGuestHero(root({ [GUEST_HERO_SELECTOR]: hero }), onReady);
    cancel();
    hero.settle(true);
    await flush();
    vi.advanceTimersByTime(HERO_WAIT_CAP_MS);
    expect(onReady).not.toHaveBeenCalled();
  });

  it("treats a decode() that throws synchronously as an error", () => {
    const onReady = vi.fn();
    waitForGuestHero(
      root({
        [GUEST_HERO_SELECTOR]: img({
          decode: () => {
            throw new Error("not supported");
          },
        }),
      }),
      onReady
    );
    expect(onReady).toHaveBeenCalledExactlyOnceWith("error");
  });
});
