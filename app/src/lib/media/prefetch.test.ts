import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MEDIA_PREFETCH_CAP,
  mediaPrefetchAllowed,
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
