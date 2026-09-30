import { describe, expect, it } from "vitest";
import { publishedIdentityImageRefs } from "./publishedIdentity";

describe("publishedIdentityImageRefs - the pre-gate (code screen) media set", () => {
  it("returns exactly the hero and logo refs, never items, covers or the space image", () => {
    expect(
      publishedIdentityImageRefs({
        brand: { hero: { imageRef: "t/brand/hero/published.webp" }, logo: { imageRef: "t/brand/logo/published.webp" }, space: { imageRef: "t/brand/space/published.webp" } },
        moduleCovers: { meals: { imageRef: "t/meals/cover/published.webp" } },
        meals: [{ imageRef: "t/meals/a/published.webp" }],
      })
    ).toEqual({ heroImageRef: "t/brand/hero/published.webp", logoImageRef: "t/brand/logo/published.webp" });
  });

  it("is null-safe for snapshots published before brand media existed or with malformed brand data", () => {
    expect(publishedIdentityImageRefs(null)).toEqual({ heroImageRef: null, logoImageRef: null });
    expect(publishedIdentityImageRefs({})).toEqual({ heroImageRef: null, logoImageRef: null });
    expect(publishedIdentityImageRefs({ brand: { hero: "oops" } })).toEqual({ heroImageRef: null, logoImageRef: null });
  });
});
