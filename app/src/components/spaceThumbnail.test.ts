import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SpaceThumbnail } from "./space-thumbnail";

const render = (props: Parameters<typeof SpaceThumbnail>[0]) => renderToStaticMarkup(createElement(SpaceThumbnail, props));

describe("SpaceThumbnail (My Spaces card image)", () => {
  it("with an image: object-cover, lazy, async-decoded, explicit size so nothing shifts or upscales", () => {
    const out = render({ imageUrl: "https://signed.test/a.webp", alt: "Lena cover", size: 80, className: "w-20 h-20 rounded-xl shrink-0" });
    expect(out).toContain('src="https://signed.test/a.webp"');
    expect(out).toContain("object-cover");
    expect(out).toContain('loading="lazy"');
    expect(out).toContain('decoding="async"');
    expect(out).toContain('width="80"');
    expect(out).toContain('height="80"');
    expect(out).toContain('alt="Lena cover"');
    expect(out).toContain("w-20 h-20");
  });

  it("applies the chosen image's focal point as object-position; centre when there is none", () => {
    expect(render({ imageUrl: "https://s.test/a.webp", alt: "x", focal: { x: 30, y: 15 } })).toContain("object-position:30% 15%");
    expect(render({ imageUrl: "https://s.test/a.webp", alt: "x" })).toContain("object-position:50% 50%");
  });

  it("sits on the brand surface while it loads, so the card is never an empty hole", () => {
    expect(render({ imageUrl: "https://s.test/a.webp", alt: "x" })).toContain("linear-gradient(160deg, #192B21, #3E5C4B)");
  });

  it("with no image: the generic InnerDweS fallback, labelled for assistive tech, with no <img> at all", () => {
    const out = render({ imageUrl: null, alt: "Lena cover", className: "w-20 h-20" });
    expect(out).not.toContain("<img");
    expect(out).toContain('role="img"');
    expect(out).toContain('aria-label="Lena cover"');
    expect(out).toContain("linear-gradient(160deg, #192B21, #3E5C4B)");
  });

  it("catches an image that failed BEFORE hydration (its error event is already gone) by checking the settled state on mount", async () => {
    // Server-rendered tests cannot see this; the real-browser harness proves the behaviour. This pins that the
    // mount check exists, so nobody "simplifies" the ref callback away and reintroduces a stuck broken-image icon.
    const src = (await import("node:fs")).readFileSync(new URL("./space-thumbnail.tsx", import.meta.url), "utf8");
    expect(src).toContain("el.complete && el.naturalWidth === 0");
    expect(src).toContain("ref={onMount}");
    expect(src).toContain("onError={() => setFailedUrl(imageUrl)}");
  });

  it("is backward compatible: the original three props still work", () => {
    expect(() => render({ imageUrl: null, alt: "x", className: "c" })).not.toThrow();
  });
});
