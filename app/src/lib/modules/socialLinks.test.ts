import { describe, expect, it } from "vitest";
import { socialLinkSchema, socialLinksSchema, SOCIAL_PLATFORMS, SOCIAL_PLATFORM_LABEL } from "./socialLinks";

describe("socialLinkSchema", () => {
  it("accepts a valid platform + URL", () => {
    const result = socialLinkSchema.safeParse({ platform: "instagram", url: "https://instagram.com/example" });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown platform", () => {
    const result = socialLinkSchema.safeParse({ platform: "myspace", url: "https://example.com" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed URL", () => {
    const result = socialLinkSchema.safeParse({ platform: "website", url: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("trims surrounding whitespace from the URL", () => {
    const result = socialLinkSchema.safeParse({ platform: "website", url: "  https://example.com  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.url).toBe("https://example.com");
  });
});

describe("socialLinksSchema", () => {
  it("accepts an empty array", () => {
    expect(socialLinksSchema.safeParse([]).success).toBe(true);
  });

  it("accepts multiple valid links", () => {
    const result = socialLinksSchema.safeParse([
      { platform: "instagram", url: "https://instagram.com/a" },
      { platform: "website", url: "https://example.com" },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects if any single link is invalid", () => {
    const result = socialLinksSchema.safeParse([
      { platform: "instagram", url: "https://instagram.com/a" },
      { platform: "instagram", url: "not-a-url" },
    ]);
    expect(result.success).toBe(false);
  });
});

describe("SOCIAL_PLATFORMS / SOCIAL_PLATFORM_LABEL", () => {
  it("has exactly the 6 approved platforms", () => {
    expect(SOCIAL_PLATFORMS).toEqual(["instagram", "facebook", "youtube", "tiktok", "linkedin", "website"]);
  });

  it("has a label for every platform", () => {
    for (const platform of SOCIAL_PLATFORMS) {
      expect(SOCIAL_PLATFORM_LABEL[platform]).toBeTruthy();
    }
  });
});
