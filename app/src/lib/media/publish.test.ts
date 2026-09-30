import { describe, expect, it } from "vitest";
import { copyDraftToPublished, MediaPublishError } from "./publish";
import { makeFakeSupabase } from "./fakeSupabase.test-util";

const T = "tenant-1";

describe("copyDraftToPublished - only ever creates the published copy", () => {
  it("copies a versioned draft to the published key in the same upload folder", async () => {
    const f = makeFakeSupabase();
    f.put(`${T}/brand/hero/up-1/draft.webp`, "hero-A");
    const out = await copyDraftToPublished(f.supabase, `${T}/brand/hero/up-1/draft.webp`);
    expect(out).toBe(`${T}/brand/hero/up-1/published.webp`);
    expect(f.files.get(`${T}/brand/hero/up-1/published.webp`)?.bytes).toBe("hero-A");
  });

  it("never lists or removes anything - published cleanup is not its job", async () => {
    const f = makeFakeSupabase();
    f.put(`${T}/meals/i/up-1/draft.webp`, "new");
    f.put(`${T}/meals/i/up-0/published.webp`, "live-old");
    await copyDraftToPublished(f.supabase, `${T}/meals/i/up-1/draft.webp`);
    expect(f.storageApi.list).not.toHaveBeenCalled();
    expect(f.storageApi.remove).not.toHaveBeenCalled();
    expect(f.files.get(`${T}/meals/i/up-0/published.webp`)?.bytes).toBe("live-old");
  });

  it("a replacement (new uploadId) never overwrites the previous published object", async () => {
    const f = makeFakeSupabase();
    f.put(`${T}/meals/i/up-0/published.webp`, "A-live");
    f.put(`${T}/meals/i/up-1/draft.webp`, "B");
    await copyDraftToPublished(f.supabase, `${T}/meals/i/up-1/draft.webp`);
    expect(f.files.get(`${T}/meals/i/up-0/published.webp`)?.bytes).toBe("A-live");
    expect(f.files.get(`${T}/meals/i/up-1/published.webp`)?.bytes).toBe("B");
  });

  it("is idempotent - retrying the same draft rewrites identical bytes", async () => {
    const f = makeFakeSupabase();
    f.put(`${T}/meals/i/up-1/draft.webp`, "B");
    await copyDraftToPublished(f.supabase, `${T}/meals/i/up-1/draft.webp`);
    await copyDraftToPublished(f.supabase, `${T}/meals/i/up-1/draft.webp`);
    expect(f.files.get(`${T}/meals/i/up-1/published.webp`)?.bytes).toBe("B");
  });

  it("no draft (or a non draft-shaped ref) -> nothing to copy", async () => {
    const f = makeFakeSupabase();
    expect(await copyDraftToPublished(f.supabase, null)).toBeNull();
    expect(await copyDraftToPublished(f.supabase, `${T}/meals/i/photo.png`)).toBeNull();
    expect(f.storageApi.download).not.toHaveBeenCalled();
  });

  it("legacy single-path draft still maps to its stable published key", async () => {
    const f = makeFakeSupabase();
    f.put(`${T}/meals/i/draft.webp`, "legacy");
    expect(await copyDraftToPublished(f.supabase, `${T}/meals/i/draft.webp`)).toBe(`${T}/meals/i/published.webp`);
  });

  it("download failure -> MediaPublishError, nothing written", async () => {
    const f = makeFakeSupabase();
    f.put(`${T}/meals/i/up-1/draft.webp`, "B");
    f.setFailure("download", "network error");
    await expect(copyDraftToPublished(f.supabase, `${T}/meals/i/up-1/draft.webp`)).rejects.toThrow(MediaPublishError);
    expect(f.storageApi.upload).not.toHaveBeenCalled();
  });

  it("upload failure -> MediaPublishError", async () => {
    const f = makeFakeSupabase();
    f.put(`${T}/meals/i/up-1/draft.webp`, "B");
    f.setFailure("upload", "quota exceeded");
    await expect(copyDraftToPublished(f.supabase, `${T}/meals/i/up-1/draft.webp`)).rejects.toThrow(MediaPublishError);
  });

  it("missing draft object -> MediaPublishError (never a silent skip)", async () => {
    const f = makeFakeSupabase();
    await expect(copyDraftToPublished(f.supabase, `${T}/meals/i/up-1/draft.webp`)).rejects.toThrow(MediaPublishError);
  });
});
