import { describe, expect, it } from "vitest";
import { tenantMediaPath, publishedMediaPath, mediaItemFolder, isFileSizeAllowed, MAX_IMAGE_BYTES } from "./path";

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

describe("mediaItemFolder", () => {
  it("extracts the item folder from a draft path", () => {
    expect(mediaItemFolder("tenant-1/brand/hero/draft.webp")).toBe("tenant-1/brand/hero");
  });

  it("returns null for a malformed path", () => {
    expect(mediaItemFolder("not-a-path")).toBeNull();
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
