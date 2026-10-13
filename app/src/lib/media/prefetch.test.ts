import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MEDIA_PREFETCH_BACKGROUND_CAP,
  MEDIA_PREFETCH_CAP,
  createMediaPrefetcher,
  isPrefetchableMediaUrl,
  mediaPrefetchAllowed,
  mediaPrefetchBackgroundAllowed,
  mediaPrefetchPlan,
  mediaPrefetchQueue,
  prefetchMedia,
} from "./prefetch";
import { MEDIA_WIDTHS, mediaSrcSet } from "./cachePolicy";
import { BrandImage } from "@/components/shared/brand-image";

const SRC = "/api/media/11111111-1111-4111-8111-111111111111/meals/a/up-A/published.webp";
const SRC2 = "/api/media/11111111-1111-4111-8111-111111111111/meals/b/up-B/published.webp";

/**
 * A `<link>` as the prefetcher builds it. The test suite runs in a node
 * environment with no DOM, and prefetchMedia takes its Document as an
 * argument precisely so it can be driven by this instead - which also
 * lets a test decide exactly when each warm "finishes".
 */
type FakeLink = {
  rel: string;
  as: string;
  href?: string;
  attrs: Record<string, string>;
  removed: boolean;
  fire: (event: "load" | "error") => void;
};

function fakeDocument() {
  const links: FakeLink[] = [];
  const doc = {
    createElement() {
      const handlers: Record<string, (() => void)[]> = { load: [], error: [] };
      const link: FakeLink = {
        rel: "",
        as: "",
        attrs: {},
        removed: false,
        fire: (event) => handlers[event].splice(0).forEach((h) => h()),
      };
      return Object.assign(link, {
        setAttribute(name: string, value: string) {
          link.attrs[name] = value;
        },
        addEventListener(event: "load" | "error", handler: () => void) {
          handlers[event].push(handler);
        },
        remove() {
          link.removed = true;
        },
      });
    },
    head: {
      appendChild(link: FakeLink) {
        links.push(link);
      },
    },
  } as unknown as Document;
  return { doc, links, live: () => links.filter((l) => !l.removed) };
}

describe("mediaPrefetchAllowed", () => {
  it("prefetches when nothing says otherwise", () => {
    expect(mediaPrefetchAllowed({})).toBe(true);
    expect(mediaPrefetchAllowed({ effectiveType: "4g" })).toBe(true);
  });

  it("respects an explicit request not to spend data", () => {
    expect(mediaPrefetchAllowed({ saveData: true })).toBe(false);
    expect(mediaPrefetchAllowed({ prefersReducedData: true })).toBe(false);
  });

  it("does not speculate on a connection too slow to afford it", () => {
    expect(mediaPrefetchAllowed({ effectiveType: "2g" })).toBe(false);
    expect(mediaPrefetchAllowed({ effectiveType: "slow-2g" })).toBe(false);
    // 3g is slow but not hopeless, and this is where warming helps most.
    expect(mediaPrefetchAllowed({ effectiveType: "3g" })).toBe(true);
  });

  it("treats a missing NetworkInformation as permission, not refusal", () => {
    // Safari exposes none. Failing closed here would mean the feature
    // never ran on iOS, which is most of the Guest audience.
    expect(mediaPrefetchAllowed({ saveData: undefined, effectiveType: undefined })).toBe(true);
  });
});

describe("mediaPrefetchQueue", () => {
  it("drops absent images and keeps the caller's order", () => {
    const q = mediaPrefetchQueue([{ src: null }, { src: SRC }, { src: undefined }, { src: SRC2 }]);
    expect(q.map((e) => e.src)).toEqual([SRC, SRC2]);
  });

  it("warms one image once, however many screens show it", () => {
    const q = mediaPrefetchQueue([{ src: SRC, sizes: "100vw" }, { src: SRC }]);
    expect(q).toHaveLength(1);
  });

  it("never exceeds the cap, so one session cannot pull the whole library", () => {
    const many = Array.from({ length: MEDIA_PREFETCH_CAP + 9 }, (_, i) => ({ src: `${SRC}?i=${i}` }));
    expect(mediaPrefetchQueue(many)).toHaveLength(MEDIA_PREFETCH_CAP);
  });
});

describe("the warmed URL is the one the <img> will ask for", () => {
  it("offers the browser the same candidate set BrandImage does", () => {
    // The whole point of the hint. If these two sets differed by one
    // character the browser would select from different ladders, warm a
    // render the <img> never asks for, and the visitor would pay twice -
    // which is worse than not prefetching at all.
    const sizes = "(min-width: 640px) 390px, 100vw";
    const [entry] = mediaPrefetchQueue([{ src: SRC, sizes }]);
    const rendered = renderToStaticMarkup(createElement(BrandImage, { src: SRC, alt: "", sizes }));
    expect(entry.srcSet).toBe(mediaSrcSet(SRC, sizes));
    for (const w of MEDIA_WIDTHS) {
      expect(entry.srcSet, String(w)).toContain(`?w=${w} ${w}w`);
      expect(rendered, String(w)).toContain(`?w=${w} ${w}w`);
    }
  });

  it("carries no srcset when the <img> will not have one either", () => {
    const [entry] = mediaPrefetchQueue([{ src: SRC }]);
    expect(entry.srcSet).toBeUndefined();
  });
});

describe("prefetchMedia", () => {
  it("hands the browser the candidate set and no href, so only one render is fetched", () => {
    const { doc, links } = fakeDocument();
    prefetchMedia([{ src: SRC, sizes: "100vw" }], doc);
    const [link] = links;
    expect(link.rel).toBe("preload");
    expect(link.as).toBe("image");
    expect(link.attrs.fetchpriority).toBe("low");
    expect(link.attrs.imagesrcset).toBe(mediaSrcSet(SRC, "100vw"));
    expect(link.attrs.imagesizes).toBe("100vw");
    // An href alongside imagesrcset is the duplicate-download trap.
    expect(link.href).toBeUndefined();
  });

  it("falls back to a plain href when there is nothing to choose between", () => {
    const { doc, links } = fakeDocument();
    prefetchMedia([{ src: SRC }], doc);
    expect(links[0].href).toBe(SRC);
    expect(links[0].attrs.imagesrcset).toBeUndefined();
  });

  it("never has more than two warms in flight", () => {
    const { doc, links } = fakeDocument();
    const items = Array.from({ length: 5 }, (_, i) => ({ src: `${SRC}?i=${i}` }));
    prefetchMedia(items, doc);
    expect(links).toHaveLength(2);

    links[0].fire("load");
    expect(links).toHaveLength(3);
    // A failed warm must not stall the queue behind it.
    links[1].fire("error");
    expect(links).toHaveLength(4);
  });

  it("stops, and withdraws what is still outstanding, when cancelled", () => {
    const { doc, links, live } = fakeDocument();
    const items = Array.from({ length: 6 }, (_, i) => ({ src: `${SRC}?i=${i}` }));
    const cancel = prefetchMedia(items, doc);
    expect(links).toHaveLength(2);
    cancel();
    expect(live()).toHaveLength(0);
    // And nothing new is started afterwards.
    links[0].fire("load");
    expect(links).toHaveLength(2);
  });

  it("does nothing at all when there is nothing to warm", () => {
    const { doc, links } = fakeDocument();
    prefetchMedia([{ src: null }, { src: undefined }], doc);
    expect(links).toHaveLength(0);
  });

  it("respects the cap", () => {
    const { doc, links } = fakeDocument();
    const items = Array.from({ length: 30 }, (_, i) => ({ src: `${SRC}?i=${i}` }));
    prefetchMedia(items, doc, { concurrency: 30 });
    expect(links).toHaveLength(MEDIA_PREFETCH_CAP);
  });
});

describe("TASK 033 staged prefetch: rules", () => {
  it("skips everything on Save-Data, 2g/slow-2g and reduced-data - both stages", () => {
    for (const signals of [{ saveData: true }, { effectiveType: "2g" }, { effectiveType: "slow-2g" }, { prefersReducedData: true }]) {
      expect(mediaPrefetchAllowed(signals), JSON.stringify(signals)).toBe(false);
      expect(mediaPrefetchBackgroundAllowed(signals), JSON.stringify(signals)).toBe(false);
    }
  });

  it("keeps Stage 3 (background) off on 3g and on low-memory devices, Stage 2 still on", () => {
    expect(mediaPrefetchAllowed({ effectiveType: "3g" })).toBe(true);
    expect(mediaPrefetchBackgroundAllowed({ effectiveType: "3g" })).toBe(false);
    expect(mediaPrefetchBackgroundAllowed({ deviceMemory: 2 })).toBe(false);
    expect(mediaPrefetchBackgroundAllowed({ deviceMemory: 1 })).toBe(false);
    expect(mediaPrefetchBackgroundAllowed({ deviceMemory: 4, effectiveType: "4g" })).toBe(true);
    // Absent signals (Safari) are permission.
    expect(mediaPrefetchBackgroundAllowed({})).toBe(true);
  });

  it("only ever warms the stable /api/media URL - never a signed Storage URL", () => {
    const signed = "https://x.supabase.co/storage/v1/object/sign/tenant-media/a.webp?token=abc";
    expect(isPrefetchableMediaUrl(SRC)).toBe(true);
    expect(isPrefetchableMediaUrl(signed)).toBe(false);
    expect(mediaPrefetchQueue([{ src: signed }, { src: SRC }]).map((e) => e.src)).toEqual([SRC]);
  });
});

describe("TASK 033 staged prefetch: plan", () => {
  const many = (n: number, stage: 2 | 3, tag: string) =>
    Array.from({ length: n }, (_, i) => ({ src: `${SRC}?${tag}=${i}`, stage }));

  it("splits by stage (default Stage 2) and applies each stage's own budget", () => {
    expect(MEDIA_PREFETCH_CAP).toBe(12);
    expect(MEDIA_PREFETCH_BACKGROUND_CAP).toBe(12);
    const plan = mediaPrefetchPlan([...many(20, 2, "h"), ...many(20, 3, "b"), { src: `${SRC}?default` }]);
    expect(plan.high).toHaveLength(12);
    expect(plan.background).toHaveLength(12);
    expect(plan.high.every((e) => e.src.includes("?h=") || e.src.endsWith("?default"))).toBe(true);
    expect(plan.background.every((e) => e.src.includes("?b="))).toBe(true);
  });

  it("de-duplicates identical URLs across stages - the earlier stage keeps it", () => {
    const plan = mediaPrefetchPlan([
      { src: SRC, stage: 3 },
      { src: SRC, stage: 2 },
      { src: SRC2, stage: 3 },
      { src: SRC2, stage: 3 },
    ]);
    expect(plan.high.map((e) => e.src)).toEqual([SRC]);
    expect(plan.background.map((e) => e.src)).toEqual([SRC2]);
  });
});

describe("TASK 033 staged prefetch: one session pump", () => {
  it("never warms the same URL twice, whichever stage asks", () => {
    const { doc, links } = fakeDocument();
    const p = createMediaPrefetcher(doc, { concurrency: 5 });
    p.enqueue([{ src: SRC }]);
    p.enqueue([{ src: SRC }, { src: SRC2 }]);
    expect(links.map((l) => l.href)).toEqual([SRC, SRC2]);
  });

  it("keeps at most two in flight across stages", () => {
    const { doc, links } = fakeDocument();
    const p = createMediaPrefetcher(doc);
    p.enqueue(Array.from({ length: 3 }, (_, i) => ({ src: `${SRC}?h=${i}` })));
    p.enqueue(Array.from({ length: 3 }, (_, i) => ({ src: `${SRC}?b=${i}` })));
    expect(links).toHaveLength(2);
    links[0].fire("load");
    expect(links).toHaveLength(3);
  });

  it("on a tab press, drops what has not started (in-flight warms finish) and can re-offer it", () => {
    const { doc, links, live } = fakeDocument();
    const p = createMediaPrefetcher(doc);
    p.enqueue(Array.from({ length: 5 }, (_, i) => ({ src: `${SRC}?i=${i}` })));
    expect(links).toHaveLength(2);
    const setAside = p.dropQueued();
    expect(setAside.map((e) => e.src)).toEqual([`${SRC}?i=2`, `${SRC}?i=3`, `${SRC}?i=4`]);
    // In flight keep going; nothing new starts when they finish.
    links[0].fire("load");
    links[1].fire("load");
    expect(links).toHaveLength(2);
    expect(live()).toHaveLength(2);
    // Re-offered later (MediaPrefetch does this on idle).
    p.enqueue(setAside);
    expect(links).toHaveLength(4);
  });

  it("cancel stops everything and withdraws outstanding links", () => {
    const { doc, links, live } = fakeDocument();
    const p = createMediaPrefetcher(doc);
    p.enqueue(Array.from({ length: 4 }, (_, i) => ({ src: `${SRC}?i=${i}` })));
    p.cancel();
    expect(live()).toHaveLength(0);
    p.enqueue([{ src: SRC2 }]);
    expect(links).toHaveLength(2);
  });
});
