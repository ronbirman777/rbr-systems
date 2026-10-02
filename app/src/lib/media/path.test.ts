import { describe, expect, it } from "vitest";
import { versionedMediaPath, parseVersionedMediaPath, collectImageRefs, collectMediaRefs, tenantMediaPath, publishedMediaPath, newUploadId, isDraftMediaPathForTenant, isPublishedMediaPath, isFileSizeAllowed, MAX_IMAGE_BYTES, isWellFormedMediaPath, MEDIA_SIGNED_URL_TTL_SECONDS } from "./path";

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

describe("versionedMediaPath / parseVersionedMediaPath", () => {
  const TID = "11111111-2222-4333-8444-555555555555";
  const U = "aaaaaaaa-1111-4111-8111-111111111111";
  const parts = { tenantId: TID, moduleKey: "teachAudioFile", itemId: "item-1", uploadId: U, ext: "mp3" };

  it("builds draft and published paths in one uploadId folder, matching tenantMediaPath", () => {
    expect(versionedMediaPath("draft", parts)).toBe(`${TID}/teachAudioFile/item-1/${U}/draft.mp3`);
    expect(versionedMediaPath("published", parts)).toBe(publishedMediaPath(versionedMediaPath("draft", parts)));
    expect(versionedMediaPath("draft", parts)).toBe(tenantMediaPath(TID, "teachAudioFile", "item-1", "mp3", U));
  });

  it("validates every segment", () => {
    for (const bad of [
      { tenantId: "not-a-uuid" },
      { tenantId: "" },
      { moduleKey: "a/b" },
      { moduleKey: ".." },
      { itemId: "../x" },
      { itemId: "" },
      { uploadId: "u/1" },
      { ext: "MP3" },
      { ext: "mp3/x" },
      { ext: "" },
    ]) {
      expect(() => versionedMediaPath("draft", { ...parts, ...bad })).toThrow();
    }
  });

  it("parse is the strict inverse and rejects legacy, traversal and wrong shapes", () => {
    expect(parseVersionedMediaPath(versionedMediaPath("draft", parts))).toEqual({ ...parts, kind: "draft" });
    expect(parseVersionedMediaPath(versionedMediaPath("published", parts))).toEqual({ ...parts, kind: "published" });
    for (const bad of [
      `${TID}/teachAudioFile/item-1/draft.mp3`,
      `${TID}/teachAudioFile/item-1/${U}/other.mp3`,
      `${TID}/teachAudioFile/item-1/../${U}/draft.mp3`,
      `${TID}/teachAudioFile/item-1/${U}/draft.mp3/extra`,
      `tenant-1/teachAudioFile/item-1/${U}/draft.mp3`,
      "",
    ]) {
      expect(parseVersionedMediaPath(bad), bad).toBeNull();
    }
  });
});

describe("collectMediaRefs vs collectImageRefs", () => {
  const modules = {
    brand: { hero: { imageRef: "t/brand/hero/u/published.webp" } },
    teachAudio: [{ id: "a", imageRef: "t/teachAudio/a/u/published.webp", audioRef: "t/teachAudioFile/a/u/published.mp3" }],
    nested: { deep: [{ audioRef: "t/x/y/u/published.ogg", note: { imageRef: "t/x/z/u/published.webp" } }] },
  };

  it("collectMediaRefs returns image and audio refs anywhere in the payload", () => {
    expect([...collectMediaRefs(modules)].sort()).toEqual([
      "t/brand/hero/u/published.webp",
      "t/teachAudio/a/u/published.webp",
      "t/teachAudioFile/a/u/published.mp3",
      "t/x/y/u/published.ogg",
      "t/x/z/u/published.webp",
    ]);
  });

  it("collectImageRefs stays image-only (no audioRef)", () => {
    expect([...collectImageRefs(modules)].sort()).toEqual([
      "t/brand/hero/u/published.webp",
      "t/teachAudio/a/u/published.webp",
      "t/x/z/u/published.webp",
    ]);
  });

  it("ignores non-string values and empty payloads", () => {
    expect(collectMediaRefs(null).size).toBe(0);
    expect(collectMediaRefs({ audioRef: 5, imageRef: null }).size).toBe(0);
  });
});
