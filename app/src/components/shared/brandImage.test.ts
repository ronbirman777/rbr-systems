import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandImage } from "./brand-image";
import { MEDIA_WIDTHS } from "@/lib/media/cachePolicy";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const SRC = "/api/media/11111111-1111-4111-8111-111111111111/meals/a/up-A/published.webp";

describe("BrandImage loading priority", () => {
  it("is lazy by default - only the LCP candidate opts out", () => {
    const out = html(createElement(BrandImage, { src: SRC, alt: "" }));
    expect(out).toContain('loading="lazy"');
    expect(out).toContain('decoding="async"');
    expect(out).not.toContain("fetchPriority");
  });

  it("loads the priority image eagerly, at high fetch priority, decoded synchronously", () => {
    const out = html(createElement(BrandImage, { src: SRC, alt: "", priority: true }));
    expect(out).toContain('loading="eager"');
    expect(out).toContain('fetchPriority="high"');
    expect(out).toContain('decoding="sync"');
  });
});

describe("BrandImage width-aware delivery", () => {
  it("emits no srcset unless the caller asks for one", () => {
    // Opt-in: a call site that has not thought about its box must not
    // start advertising widths that do not match it.
    expect(html(createElement(BrandImage, { src: SRC, alt: "" }))).not.toContain("srcset");
  });

  it("offers the whole ladder, and the sizes the caller declared", () => {
    const out = html(createElement(BrandImage, { src: SRC, alt: "", sizes: "100vw" }));
    for (const w of MEDIA_WIDTHS) expect(out, String(w)).toContain(`?w=${w} ${w}w`);
    expect(out).toContain('sizes="100vw"');
  });

  it("never rewrites a URL it did not recognise", () => {
    // It parameterises a /api/media URL; anything else is passed through
    // untouched, because only that route validates `w`.
    const out = html(createElement(BrandImage, { src: "https://cdn.example/x.jpg", alt: "", sizes: "100vw" }));
    expect(out).not.toContain("srcset");
    expect(out).toContain("https://cdn.example/x.jpg");
  });
});

describe("BrandImage preserves what the rollout must not change", () => {
  it("applies the organizer's focal point as object-position", () => {
    const out = html(createElement(BrandImage, { src: SRC, alt: "", focal: { x: 20, y: 80 } }));
    expect(out).toContain("object-position:20% 80%");
  });

  it("lets a caller override the focal point, for a product with its own default", () => {
    // Flow's facilitator photos anchor to the top so faces stay in frame.
    const out = html(
      createElement(BrandImage, { src: SRC, alt: "", focal: { x: 50, y: 50 }, style: { objectPosition: "50% 15%" } })
    );
    expect(out).toContain("object-position:50% 15%");
  });

  it("renders the branded fallback surface, not a hole, when there is no image", () => {
    const out = html(createElement(BrandImage, { src: null, alt: "Pool", fallback: "var(--rbr-sand)" }));
    expect(out).toContain("var(--rbr-sand)");
    expect(out).toContain('aria-label="Pool"');
    expect(out).not.toContain("<img");
  });
});
