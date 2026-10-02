import { describe, expect, it } from "vitest";
import { copyDraftAudioToPublished, copyDraftToPublished, MediaPublishError } from "./publish";
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

describe("copyDraftAudioToPublished - immutable, create-only audio publish copy", () => {
  const TID = "11111111-2222-4333-8444-555555555555";
  const U1 = "aaaaaaaa-1111-4111-8111-111111111111";
  const draft = `${TID}/teachAudioFile/item-1/${U1}/draft.mp3`;
  const published = `${TID}/teachAudioFile/item-1/${U1}/published.mp3`;

  it("copies to the published key in the same uploadId folder, preserving content type, via server-side copy", async () => {
    const f = makeFakeSupabase();
    f.put(draft, "track", undefined, "audio/mpeg");
    expect(await copyDraftAudioToPublished(f.supabase, draft)).toBe(published);
    expect(f.files.get(published)).toMatchObject({ bytes: "track", contentType: "audio/mpeg" });
    expect(f.storageApi.copy).toHaveBeenCalledWith(draft, published);
    expect(f.storageApi.download).not.toHaveBeenCalled();
    expect(f.storageApi.upload).not.toHaveBeenCalled();
    expect(f.storageApi.remove).not.toHaveBeenCalled();
    expect(f.storageApi.list).not.toHaveBeenCalled();
  });

  it("is idempotent: retrying when the identical published object exists succeeds and writes nothing", async () => {
    const f = makeFakeSupabase();
    f.put(draft, "track", undefined, "audio/mpeg");
    await copyDraftAudioToPublished(f.supabase, draft);
    expect(await copyDraftAudioToPublished(f.supabase, draft)).toBe(published);
    expect(f.files.get(published)?.bytes).toBe("track");
    expect(f.storageApi.upload).not.toHaveBeenCalled();
  });

  it("a destination collision with different content fails and leaves the existing object alone", async () => {
    const f = makeFakeSupabase();
    f.put(draft, "new-recording", undefined, "audio/mpeg");
    f.put(published, "live-recording", undefined, "audio/mpeg");
    await expect(copyDraftAudioToPublished(f.supabase, draft)).rejects.toThrow(MediaPublishError);
    expect(f.files.get(published)?.bytes).toBe("live-recording");
    expect(f.storageApi.upload).not.toHaveBeenCalled();
  });

  it("same size but different bytes is still a collision (byte comparison fallback)", async () => {
    const f = makeFakeSupabase();
    f.put(draft, "aaaa", undefined, "audio/mpeg");
    f.put(published, "bbbb", undefined, "audio/mpeg");
    f.setFailure("info", "metadata unavailable");
    await expect(copyDraftAudioToPublished(f.supabase, draft)).rejects.toThrow(/refusing to overwrite/);
    f.put(published, "aaaa", undefined, "audio/mpeg");
    expect(await copyDraftAudioToPublished(f.supabase, draft)).toBe(published);
  });

  it("no draft -> nothing to copy; malformed, legacy, published or non-audio refs throw", async () => {
    const f = makeFakeSupabase();
    expect(await copyDraftAudioToPublished(f.supabase, null)).toBeNull();
    for (const bad of [
      `${TID}/teachAudioFile/item-1/draft.mp3`,
      published,
      `${TID}/teachAudioFile/item-1/${U1}/draft.webp`,
      `${TID}/teachAudioFile/item-1/${U1}/draft.exe`,
      `${TID}/teachAudioFile/../${U1}/draft.mp3`,
      "not-a-path",
    ]) {
      await expect(copyDraftAudioToPublished(f.supabase, bad), bad).rejects.toThrow(MediaPublishError);
    }
    expect(f.storageApi.copy).not.toHaveBeenCalled();
  });

  it("a missing draft or storage failure -> MediaPublishError", async () => {
    const f = makeFakeSupabase();
    await expect(copyDraftAudioToPublished(f.supabase, draft)).rejects.toThrow(MediaPublishError);
    f.put(draft, "track", undefined, "audio/mpeg");
    f.setFailure("copy", "storage unavailable");
    await expect(copyDraftAudioToPublished(f.supabase, draft)).rejects.toThrow(/storage unavailable/);
    expect(f.files.has(published)).toBe(false);
  });

  it("the image copy is unchanged: it still overwrites with upsert", async () => {
    const f = makeFakeSupabase();
    f.put(`${T}/meals/i/up-1/draft.webp`, "B");
    f.put(`${T}/meals/i/up-1/published.webp`, "stale");
    await copyDraftToPublished(f.supabase, `${T}/meals/i/up-1/draft.webp`);
    expect(f.storageApi.upload).toHaveBeenCalledWith(`${T}/meals/i/up-1/published.webp`, expect.anything(), { upsert: true, contentType: "image/webp" });
    expect(f.storageApi.copy).not.toHaveBeenCalled();
  });
});
