import { describe, expect, it } from "vitest";
import { tenantMediaPath, publishedMediaPath, newUploadId, isDraftMediaPathForTenant, isPublishedMediaPath, isFileSizeAllowed, MAX_IMAGE_BYTES, isWellFormedMediaPath, MEDIA_SIGNED_URL_TTL_SECONDS } from "./path";

describe("tenantMediaPath", () => {
  it("builds the draft path for a module_items-backed item", () => {
    expect(tenantMediaPath("tenant-1", "facilitators", "item-1", "webp")).toBe("tenant-1/facilitators/item-1/draft.webp");
  });

  it("builds the draft path for brand-level media using the same convention", () => {
    expect(tenantMediaPath("tenant-1", "brand", "hero", "webp")).toBe("tenant-1/brand/hero/draft.webp");
    expect(tenantMediaPath("tenant-1", "brand", "space", "webp")).toBe("tenant-1/brand/space/draft.webp");
    expect(tenantMediaPath("tenant-1", "brand", "logo", "webp")).toBe("tenant-1/brand/logo/draft.webp");
  });
});

describe("publishedMediaPath", () => {
  it("transforms a draft path to its published counterpart", () => {
    expect(publishedMediaPath("tenant-1/brand/hero/draft.webp")).toBe("tenant-1/brand/hero/published.webp");
  });

  it("preserves the extension", () => {
    expect(publishedMediaPath("tenant-1/facilitators/item-1/draft.jpg")).toBe("tenant-1/facilitators/item-1/published.jpg");
  });

  it("returns null for a path that isn't a draft path", () => {
    expect(publishedMediaPath("tenant-1/brand/hero/published.webp")).toBeNull();
    expect(publishedMediaPath("not-a-path")).toBeNull();
  });
});

describe("versioned upload paths", () => {
  it("puts each upload in its own uploadId folder, and publishes to the same folder", () => {
    const draft = tenantMediaPath("tenant-1", "meals", "item-1", "webp", "up-1");
    expect(draft).toBe("tenant-1/meals/item-1/up-1/draft.webp");
    expect(publishedMediaPath(draft)).toBe("tenant-1/meals/item-1/up-1/published.webp");
  });
  it("two uploads for the same slot never share a published key", () => {
    const a = publishedMediaPath(tenantMediaPath("t", "brand", "hero", "webp", newUploadId()));
    const b = publishedMediaPath(tenantMediaPath("t", "brand", "hero", "webp", newUploadId()));
    expect(a).not.toBe(b);
  });
  it("legacy single-path drafts still transform", () => {
    expect(publishedMediaPath("t/meals/item-1/draft.webp")).toBe("t/meals/item-1/published.webp");
  });
});

describe("isWellFormedMediaPath - versioned layout", () => {
  it("accepts the uploadId-nested path", () => {
    expect(isWellFormedMediaPath("11111111-1111-4111-8111-111111111111/meals/a/22222222-2222-4222-8222-222222222222/published.webp".split("/"))).toBe(true);
  });
});

describe("isDraftMediaPathForTenant", () => {
  it("accepts this tenant's draft objects, legacy and versioned", () => {
    expect(isDraftMediaPathForTenant("t1", "t1/meals/i/draft.webp")).toBe(true);
    expect(isDraftMediaPathForTenant("t1", "t1/meals/i/u/draft.webp")).toBe(true);
  });
  it("rejects published objects, other tenants, traversal and malformed paths", () => {
    expect(isDraftMediaPathForTenant("t1", "t1/meals/i/published.webp")).toBe(false);
    expect(isDraftMediaPathForTenant("t1", "t1/meals/i/u/published.webp")).toBe(false);
    expect(isDraftMediaPathForTenant("t1", "t2/meals/i/draft.webp")).toBe(false);
    expect(isDraftMediaPathForTenant("t1", "t1/../t2/meals/i/draft.webp")).toBe(false);
    expect(isDraftMediaPathForTenant("t1", "t1//draft.webp")).toBe(false);
    expect(isDraftMediaPathForTenant("", "/draft.webp")).toBe(false);
  });
});

describe("isPublishedMediaPath", () => {
  it("matches only published copies", () => {
    expect(isPublishedMediaPath("t/meals/i/u/published.webp")).toBe(true);
    expect(isPublishedMediaPath("t/meals/i/published.webp")).toBe(true);
    expect(isPublishedMediaPath("t/meals/i/u/draft.webp")).toBe(false);
  });
});

describe("isFileSizeAllowed", () => {
  it("accepts a file under the limit", () => {
    expect(isFileSizeAllowed(1024)).toBe(true);
  });

  it("rejects a zero-byte file", () => {
    expect(isFileSizeAllowed(0)).toBe(false);
  });

  it("rejects a file over MAX_IMAGE_BYTES", () => {
    expect(isFileSizeAllowed(MAX_IMAGE_BYTES + 1)).toBe(false);
  });

  it("accepts a file at exactly MAX_IMAGE_BYTES", () => {
    expect(isFileSizeAllowed(MAX_IMAGE_BYTES)).toBe(true);
  });
});

describe("isWellFormedMediaPath", () => {
  const T = "11111111-1111-4111-8111-111111111111";
  it("accepts a tenant-rooted published path", () => {
    expect(isWellFormedMediaPath([T, "meals", "a", "published.webp"])).toBe(true);
  });
  it("rejects a non-uuid tenant, too-short paths, empty/dot segments, separators and control characters", () => {
    expect(isWellFormedMediaPath(["nope", "x"])).toBe(false);
    expect(isWellFormedMediaPath([T])).toBe(false);
    expect(isWellFormedMediaPath([T, "", "x"])).toBe(false);
    expect(isWellFormedMediaPath([T, ".", "x"])).toBe(false);
    expect(isWellFormedMediaPath([T, "..", "x"])).toBe(false);
    expect(isWellFormedMediaPath([T, "a/b", "x"])).toBe(false);
    expect(isWellFormedMediaPath([T, "a\\b", "x"])).toBe(false);
    expect(isWellFormedMediaPath([T, "a" + String.fromCharCode(10) + "b", "x"])).toBe(false);
  });
  it("signed URLs are short-lived (residual window for already-issued URLs)", () => {
    expect(MEDIA_SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(60);
  });
});
