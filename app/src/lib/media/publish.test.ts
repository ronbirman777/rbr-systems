import { describe, expect, it, vi } from "vitest";
import { copyDraftToPublished, MediaPublishError } from "./publish";

/**
 * A realistic in-memory fake of the Supabase Storage surface this module
 * touches (list/download/upload/remove) - tracks actual object bytes per
 * path so tests can prove real content actually changes, not just that a
 * particular method was called. Deliberately mirrors the one behavior
 * that caused the original bug: this fake's `upload` always succeeds
 * whether or not the path already exists (upsert semantics), matching
 * real Supabase Storage - there is no `copy` method at all here, since
 * the fixed implementation never calls it.
 */
function makeFakeBucket(initialFiles: Record<string, string> = {}) {
  const files = new Map(Object.entries(initialFiles));
  let downloadError: { message: string } | null = null;
  let uploadError: { message: string } | null = null;
  let removeError: { message: string } | null = null;
  let listError: { message: string } | null = null;

  const list = vi.fn(async (folder: string) => {
    if (listError) return { data: null, error: listError };
    const names = [...files.keys()]
      .filter((p) => p.startsWith(`${folder}/`))
      .map((p) => p.slice(folder.length + 1));
    return { data: names.map((name) => ({ name })), error: null };
  });

  const download = vi.fn(async (path: string) => {
    if (downloadError) return { data: null, error: downloadError };
    if (!files.has(path)) return { data: null, error: { message: "Object not found" } };
    return { data: files.get(path), error: null };
  });

  const upload = vi.fn(async (path: string, body: unknown) => {
    if (uploadError) return { data: null, error: uploadError };
    files.set(path, body as string);
    return { data: { path }, error: null };
  });

  const remove = vi.fn(async (paths: string[]) => {
    if (removeError) return { data: null, error: removeError };
    paths.forEach((p) => files.delete(p));
    return { data: paths.map((path) => ({ name: path })), error: null };
  });

  const from = vi.fn(() => ({ list, remove, download, upload }));

  return {
    supabase: { storage: { from } } as unknown as Parameters<typeof copyDraftToPublished>[0],
    files,
    list,
    download,
    upload,
    remove,
    setDownloadError: (msg: string | null) => (downloadError = msg ? { message: msg } : null),
    setUploadError: (msg: string | null) => (uploadError = msg ? { message: msg } : null),
    setRemoveError: (msg: string | null) => (removeError = msg ? { message: msg } : null),
    setListError: (msg: string | null) => (listError = msg ? { message: msg } : null),
  };
}

describe("copyDraftToPublished - A. first publish", () => {
  it("creates the published object when it doesn't exist yet", async () => {
    const bucket = makeFakeBucket({ "tenant-1/brand/hero/draft.webp": "hero-bytes-v1" });
    await copyDraftToPublished(bucket.supabase, "tenant-1/brand/hero/draft.webp", "tenant-1/brand/hero");
    expect(bucket.files.get("tenant-1/brand/hero/published.webp")).toBe("hero-bytes-v1");
  });
});

describe("copyDraftToPublished - B. republish replaces existing published bytes", () => {
  it("overwrites an already-published object with the new draft's bytes", async () => {
    const bucket = makeFakeBucket({
      "tenant-1/brand/hero/draft.webp": "hero-bytes-v2",
      "tenant-1/brand/hero/published.webp": "hero-bytes-v1", // stale, from a prior publish
    });
    await copyDraftToPublished(bucket.supabase, "tenant-1/brand/hero/draft.webp", "tenant-1/brand/hero");
    // This is the exact scenario that reproduced the original bug: storage
    // `copy()` would 409 here because the destination already exists, and
    // the old error was never checked, so published stayed at v1 forever.
    expect(bucket.files.get("tenant-1/brand/hero/published.webp")).toBe("hero-bytes-v2");
  });
});

describe("copyDraftToPublished - C. download/upload failure stops publishing, never partially succeeds", () => {
  it("throws MediaPublishError when the draft can't be downloaded, and does not touch the published object", async () => {
    const bucket = makeFakeBucket({
      "tenant-1/brand/hero/draft.webp": "hero-bytes-v2",
      "tenant-1/brand/hero/published.webp": "hero-bytes-v1",
    });
    bucket.setDownloadError("network error");
    await expect(
      copyDraftToPublished(bucket.supabase, "tenant-1/brand/hero/draft.webp", "tenant-1/brand/hero")
    ).rejects.toThrow(MediaPublishError);
    expect(bucket.files.get("tenant-1/brand/hero/published.webp")).toBe("hero-bytes-v1");
  });

  it("throws MediaPublishError when the upload/upsert fails, and does not touch the published object", async () => {
    const bucket = makeFakeBucket({
      "tenant-1/brand/hero/draft.webp": "hero-bytes-v2",
      "tenant-1/brand/hero/published.webp": "hero-bytes-v1",
    });
    bucket.setUploadError("quota exceeded");
    await expect(
      copyDraftToPublished(bucket.supabase, "tenant-1/brand/hero/draft.webp", "tenant-1/brand/hero")
    ).rejects.toThrow(MediaPublishError);
    expect(bucket.files.get("tenant-1/brand/hero/published.webp")).toBe("hero-bytes-v1");
  });
});

describe("copyDraftToPublished - D. removal failure (stale-sibling cleanup) also fails loudly", () => {
  it("throws MediaPublishError when the stale-sibling remove fails, after the new image was already published", async () => {
    const bucket = makeFakeBucket({
      "tenant-1/brand/hero/draft.webp": "hero-bytes-v2",
      "tenant-1/brand/hero/published.jpg": "stale-old-extension",
    });
    bucket.setRemoveError("permission denied");
    await expect(
      copyDraftToPublished(bucket.supabase, "tenant-1/brand/hero/draft.webp", "tenant-1/brand/hero")
    ).rejects.toThrow(MediaPublishError);
    // The new object still got published (write-before-cleanup ordering) -
    // only the best-effort stale-sibling cleanup failed.
    expect(bucket.files.get("tenant-1/brand/hero/published.webp")).toBe("hero-bytes-v2");
  });

  it("throws MediaPublishError when list() itself fails", async () => {
    const bucket = makeFakeBucket({ "tenant-1/brand/hero/draft.webp": "hero-bytes-v1" });
    bucket.setListError("service unavailable");
    await expect(
      copyDraftToPublished(bucket.supabase, "tenant-1/brand/hero/draft.webp", "tenant-1/brand/hero")
    ).rejects.toThrow(MediaPublishError);
  });
});

describe("copyDraftToPublished - E. stale sibling cleanup", () => {
  it("removes an old published.* file with a different extension after the new one is published", async () => {
    const bucket = makeFakeBucket({
      "tenant-1/brand/hero/draft.webp": "hero-bytes-v2",
      "tenant-1/brand/hero/published.jpg": "stale-old-extension",
    });
    await copyDraftToPublished(bucket.supabase, "tenant-1/brand/hero/draft.webp", "tenant-1/brand/hero");
    expect(bucket.files.has("tenant-1/brand/hero/published.jpg")).toBe(false);
    expect(bucket.files.get("tenant-1/brand/hero/published.webp")).toBe("hero-bytes-v2");
  });

  it("does not remove the current published.* file when it already matches the target path", async () => {
    const bucket = makeFakeBucket({
      "tenant-1/brand/hero/draft.webp": "hero-bytes-v2",
      "tenant-1/brand/hero/published.webp": "hero-bytes-v1",
    });
    await copyDraftToPublished(bucket.supabase, "tenant-1/brand/hero/draft.webp", "tenant-1/brand/hero");
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it("when draftPath is null (photo removed), removes every published.* file and never uploads", async () => {
    const bucket = makeFakeBucket({ "tenant-1/brand/hero/published.webp": "hero-bytes-v1" });
    await copyDraftToPublished(bucket.supabase, null, "tenant-1/brand/hero");
    expect(bucket.files.has("tenant-1/brand/hero/published.webp")).toBe(false);
    expect(bucket.upload).not.toHaveBeenCalled();
  });

  it("no-ops entirely when there is no draft and no fallback folder can be derived", async () => {
    const bucket = makeFakeBucket({});
    await copyDraftToPublished(bucket.supabase, null, "");
    expect(bucket.list).not.toHaveBeenCalled();
    expect(bucket.upload).not.toHaveBeenCalled();
  });
});

describe("copyDraftToPublished - F. module-item image republish (facilitator/meal/treatment/facility path shape)", () => {
  it("republishes a facilitator photo correctly", async () => {
    const bucket = makeFakeBucket({
      "tenant-1/facilitators/item-1/draft.webp": "facilitator-photo-v2",
      "tenant-1/facilitators/item-1/published.webp": "facilitator-photo-v1",
    });
    await copyDraftToPublished(bucket.supabase, "tenant-1/facilitators/item-1/draft.webp", "tenant-1/facilitators/item-1");
    expect(bucket.files.get("tenant-1/facilitators/item-1/published.webp")).toBe("facilitator-photo-v2");
  });

  it("republishes a meal photo correctly", async () => {
    const bucket = makeFakeBucket({
      "tenant-1/meals/item-2/draft.webp": "meal-photo-v2",
      "tenant-1/meals/item-2/published.webp": "meal-photo-v1",
    });
    await copyDraftToPublished(bucket.supabase, "tenant-1/meals/item-2/draft.webp", "tenant-1/meals/item-2");
    expect(bucket.files.get("tenant-1/meals/item-2/published.webp")).toBe("meal-photo-v2");
  });
});

describe("copyDraftToPublished - G. brand image republish (hero/space/logo path shape)", () => {
  it("republishes Space Image correctly", async () => {
    const bucket = makeFakeBucket({
      "tenant-1/brand/space/draft.webp": "space-photo-v2",
      "tenant-1/brand/space/published.webp": "space-photo-v1",
    });
    await copyDraftToPublished(bucket.supabase, "tenant-1/brand/space/draft.webp", "tenant-1/brand/space");
    expect(bucket.files.get("tenant-1/brand/space/published.webp")).toBe("space-photo-v2");
  });

  it("republishes Logo correctly", async () => {
    const bucket = makeFakeBucket({
      "tenant-1/brand/logo/draft.webp": "logo-v2",
      "tenant-1/brand/logo/published.webp": "logo-v1",
    });
    await copyDraftToPublished(bucket.supabase, "tenant-1/brand/logo/draft.webp", "tenant-1/brand/logo");
    expect(bucket.files.get("tenant-1/brand/logo/published.webp")).toBe("logo-v2");
  });
});
