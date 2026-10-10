import { describe, expect, it } from "vitest";
import { AUDIO_PUBLISH_CONCURRENCY, copyDraftAudioToPublished, copyDraftToPublished, fingerprintStoredObject, MediaPublishError } from "./publish";
import { sha256Hex } from "./fingerprint";
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

  it("copy failure on a versioned image -> MediaPublishError, nothing written", async () => {
    const f = makeFakeSupabase();
    f.put(`${T}/meals/i/up-1/draft.webp`, "B");
    f.setFailure("copy", "network error");
    await expect(copyDraftToPublished(f.supabase, `${T}/meals/i/up-1/draft.webp`)).rejects.toThrow(MediaPublishError);
    expect(f.storageApi.upload).not.toHaveBeenCalled();
    expect(f.files.has(`${T}/meals/i/up-1/published.webp`)).toBe(false);
  });

  it("legacy image: download failure -> MediaPublishError, nothing written", async () => {
    const f = makeFakeSupabase();
    f.put(`${T}/meals/i/draft.webp`, "B");
    f.setFailure("download", "network error");
    await expect(copyDraftToPublished(f.supabase, `${T}/meals/i/draft.webp`)).rejects.toThrow(MediaPublishError);
    expect(f.storageApi.upload).not.toHaveBeenCalled();
  });

  it("legacy image: upload failure -> MediaPublishError", async () => {
    const f = makeFakeSupabase();
    f.put(`${T}/meals/i/draft.webp`, "B");
    f.setFailure("upload", "quota exceeded");
    await expect(copyDraftToPublished(f.supabase, `${T}/meals/i/draft.webp`)).rejects.toThrow(MediaPublishError);
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

  it("a versioned image publishes with a server-side copy, never upload/upsert", async () => {
    const f = makeFakeSupabase();
    f.put(`${T}/meals/i/up-1/draft.webp`, "B");
    await copyDraftToPublished(f.supabase, `${T}/meals/i/up-1/draft.webp`);
    expect(f.storageApi.copy).toHaveBeenCalledWith(`${T}/meals/i/up-1/draft.webp`, `${T}/meals/i/up-1/published.webp`);
    expect(f.storageApi.upload).not.toHaveBeenCalled();
    expect(f.storageApi.download).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything());
  });
});

describe("copyDraftToPublished - Phase 3C create-only image publish", () => {
  const D = `${T}/meals/i/up-1/draft.webp`;
  const P = `${T}/meals/i/up-1/published.webp`;

  it("first publish creates the destination in the same uploadId folder", async () => {
    const f = makeFakeSupabase();
    f.put(D, "B");
    expect(await copyDraftToPublished(f.supabase, D)).toBe(P);
    expect(f.files.get(P)?.bytes).toBe("B");
    expect(f.files.get(D)?.bytes).toBe("B");
  });

  it("uploadId is unchanged between the draft and its published sibling", async () => {
    const f = makeFakeSupabase();
    f.put(D, "B");
    const out = (await copyDraftToPublished(f.supabase, D)) as string;
    expect(out.split("/").slice(0, 4)).toEqual(D.split("/").slice(0, 4));
  });

  it("content type is preserved by the copy", async () => {
    const f = makeFakeSupabase();
    f.put(D, "B", undefined, "image/webp");
    await copyDraftToPublished(f.supabase, D);
    expect(f.files.get(P)?.contentType).toBe("image/webp");
  });

  it("identical retry is idempotent success (destination untouched)", async () => {
    const f = makeFakeSupabase();
    f.put(D, "B");
    await copyDraftToPublished(f.supabase, D);
    expect(await copyDraftToPublished(f.supabase, D)).toBe(P);
    expect(f.files.get(P)?.bytes).toBe("B");
    expect(f.storageApi.upload).not.toHaveBeenCalled();
  });

  it("a different-content collision fails closed and leaves the existing object", async () => {
    const f = makeFakeSupabase();
    f.put(D, "NEW-BYTES");
    f.put(P, "OTHER-BYTE");
    await expect(copyDraftToPublished(f.supabase, D)).rejects.toThrow(MediaPublishError);
    expect(f.files.get(P)?.bytes).toBe("OTHER-BYTE");
    expect(f.storageApi.upload).not.toHaveBeenCalled();
  });

  it("a same-size but different-bytes collision also fails closed", async () => {
    const f = makeFakeSupabase();
    f.put(D, "AAAA");
    f.put(P, "BBBB");
    await expect(copyDraftToPublished(f.supabase, D)).rejects.toThrow(MediaPublishError);
    expect(f.files.get(P)?.bytes).toBe("BBBB");
  });

  it("legacy stable-path draft keeps its overwrite semantics (the only upsert left)", async () => {
    const f = makeFakeSupabase();
    f.put(`${T}/meals/i/draft.webp`, "new");
    f.put(`${T}/meals/i/published.webp`, "stale");
    await copyDraftToPublished(f.supabase, `${T}/meals/i/draft.webp`);
    expect(f.storageApi.upload).toHaveBeenCalledWith(`${T}/meals/i/published.webp`, expect.anything(), { upsert: true, contentType: "image/webp" });
    expect(f.storageApi.copy).not.toHaveBeenCalled();
    expect(f.files.get(`${T}/meals/i/published.webp`)?.bytes).toBe("new");
  });
});

/**
 * TASK 032 (0046): on the trusted (paid Space, service-role) path the published audio copy must hold exactly the
 * bytes the server measured at attach (size + sha256 recorded in billing_audio_verifications). This closes the
 * window in which a member deletes its measured draft and uploads different bytes at the same path.
 */
describe("copyDraftAudioToPublished - trusted path re-checks the measured fingerprint (0046)", () => {
  const TID = "11111111-2222-4333-8444-555555555555";
  const U1 = "aaaaaaaa-1111-4111-8111-111111111111";
  const draft = `${TID}/teachAudioFile/item-1/${U1}/draft.mp3`;
  const published = `${TID}/teachAudioFile/item-1/${U1}/published.mp3`;
  const fp = (s: string) => ({ sizeBytes: Buffer.byteLength(s), sha256: sha256Hex(new TextEncoder().encode(s)) });
  const trusted = (s: string | null) => ({ trustedTenantId: TID, audioFingerprint: s === null ? null : fp(s) });

  it("the measured file publishes", async () => {
    const f = makeFakeSupabase();
    f.put(draft, "measured-track", undefined, "audio/mpeg");
    expect(await copyDraftAudioToPublished(f.supabase, draft, trusted("measured-track"))).toBe(published);
    expect(f.files.get(published)?.bytes).toBe("measured-track");
  });

  it("no recorded fingerprint (never measured by the server) is refused before anything is copied", async () => {
    const f = makeFakeSupabase();
    f.put(draft, "track", undefined, "audio/mpeg");
    await expect(copyDraftAudioToPublished(f.supabase, draft, trusted(null))).rejects.toThrow(/not been verified by the server; upload it again/);
    expect(f.storageApi.copy).not.toHaveBeenCalled();
    expect(f.files.has(published)).toBe(false);
  });

  it("a draft swapped after measurement (same path, different bytes) is refused and the new copy removed", async () => {
    const f = makeFakeSupabase();
    // Measured "short" at attach; the member then deleted the draft and uploaded a long file at the same path.
    f.put(draft, "an-hour-long-recording", undefined, "audio/mpeg");
    await expect(copyDraftAudioToPublished(f.supabase, draft, trusted("short"))).rejects.toThrow(/not the file that was measured/);
    expect(f.files.has(published)).toBe(false);
    expect(f.files.get(draft)?.bytes).toBe("an-hour-long-recording"); // the draft is left for the owner to replace
  });

  it("same size, different bytes is still a mismatch (sha256, not size)", async () => {
    const f = makeFakeSupabase();
    f.put(draft, "bbbb", undefined, "audio/mpeg");
    await expect(copyDraftAudioToPublished(f.supabase, draft, trusted("aaaa"))).rejects.toThrow(MediaPublishError);
    expect(f.files.has(published)).toBe(false);
  });

  it("an existing published copy that does not match is refused but NEVER removed (the live snapshot may use it)", async () => {
    const f = makeFakeSupabase();
    f.put(draft, "other", undefined, "audio/mpeg");
    f.put(published, "other", undefined, "audio/mpeg");
    await expect(copyDraftAudioToPublished(f.supabase, draft, trusted("measured"))).rejects.toThrow(/not the file that was measured/);
    expect(f.files.get(published)?.bytes).toBe("other");
    expect(f.storageApi.remove).not.toHaveBeenCalled();
  });

  it("an idempotent retry over a matching published copy succeeds", async () => {
    const f = makeFakeSupabase();
    f.put(draft, "measured", undefined, "audio/mpeg");
    await copyDraftAudioToPublished(f.supabase, draft, trusted("measured"));
    expect(await copyDraftAudioToPublished(f.supabase, draft, trusted("measured"))).toBe(published);
    expect(f.storageApi.remove).not.toHaveBeenCalled();
  });

  it("legacy/exempt (untrusted) copies are unchanged: no fingerprint needed, nothing re-read", async () => {
    const f = makeFakeSupabase();
    f.put(draft, "anything", undefined, "audio/mpeg");
    expect(await copyDraftAudioToPublished(f.supabase, draft)).toBe(published);
    expect(f.storageApi.download).not.toHaveBeenCalled();
  });

  it("records the published copy's ETag after hashing it equal, and a later publish of the unchanged copy skips the download", async () => {
    const f = makeFakeSupabase();
    f.put(draft, "measured", undefined, "audio/mpeg");
    const recorded: [string, string][] = [];
    const onAudioPublishedVerified = (ref: string, etag: string) => void recorded.push([ref, etag]);
    await copyDraftAudioToPublished(f.supabase, draft, { ...trusted("measured"), onAudioPublishedVerified });
    expect(recorded).toEqual([[draft, "etag:measured"]]);
    f.storageApi.download.mockClear();
    const known = { ...fp("measured"), published: { sizeBytes: Buffer.byteLength("measured"), etag: "etag:measured" } };
    expect(await copyDraftAudioToPublished(f.supabase, draft, { trustedTenantId: TID, audioFingerprint: known })).toBe(published);
    expect(f.storageApi.download).not.toHaveBeenCalled();
  });

  it("a changed (or unknown) ETag on the published copy is re-hashed - and a swapped copy is still refused", async () => {
    const f = makeFakeSupabase();
    f.put(draft, "other", undefined, "audio/mpeg");
    f.put(published, "other", undefined, "audio/mpeg");
    // Recorded ETag is for the measured bytes; Storage now reports another one.
    const stale = { ...fp("measured"), published: { sizeBytes: Buffer.byteLength("measured"), etag: "etag:measured" } };
    await expect(copyDraftAudioToPublished(f.supabase, draft, { trustedTenantId: TID, audioFingerprint: stale })).rejects.toThrow(/not the file that was measured/);
    expect(f.storageApi.download).toHaveBeenCalled();
    // ETag forged to match but the size differs from the measurement: re-hashed, refused.
    const forged = { ...fp("measured"), published: { sizeBytes: Buffer.byteLength("other"), etag: "etag:other" } };
    await expect(copyDraftAudioToPublished(f.supabase, draft, { trustedTenantId: TID, audioFingerprint: forged })).rejects.toThrow(/not the file that was measured/);
    // Storage metadata unreadable: re-hashed (fail closed), refused.
    f.setFailure("info", "boom");
    await expect(copyDraftAudioToPublished(f.supabase, draft, { trustedTenantId: TID, audioFingerprint: stale })).rejects.toThrow(MediaPublishError);
    expect(f.files.get(published)?.bytes).toBe("other");
  });

  it("a freshly created copy is always hashed, even when an ETag was recorded before", async () => {
    const f = makeFakeSupabase();
    f.put(draft, "measured", undefined, "audio/mpeg");
    const known = { ...fp("measured"), published: { sizeBytes: Buffer.byteLength("measured"), etag: "etag:measured" } };
    await copyDraftAudioToPublished(f.supabase, draft, { trustedTenantId: TID, audioFingerprint: known });
    expect(f.storageApi.download).toHaveBeenCalledWith(published, {}, { cache: "no-store" });
  });

  it(`at most AUDIO_PUBLISH_CONCURRENCY (${AUDIO_PUBLISH_CONCURRENCY}) audio copies download at once`, async () => {
    const f = makeFakeSupabase();
    const impl = f.storageApi.download.getMockImplementation()!;
    let active = 0;
    let peak = 0;
    f.storageApi.download.mockImplementation(async (...args: Parameters<typeof impl>) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return impl(...args);
    });
    const refs = Array.from({ length: 6 }, (_, i) => `${TID}/teachAudioFile/item-${i}/${U1}/draft.mp3`);
    refs.forEach((r) => f.put(r, "measured", undefined, "audio/mpeg"));
    const out = await Promise.all(refs.map((r) => copyDraftAudioToPublished(f.supabase, r, trusted("measured"))));
    expect(out).toHaveLength(6);
    expect(peak).toBeLessThanOrEqual(AUDIO_PUBLISH_CONCURRENCY);
    expect(peak).toBeGreaterThan(0);
  });

  it("fingerprintStoredObject: size + lowercase sha256 hex of the stored bytes", async () => {
    const f = makeFakeSupabase();
    f.put(draft, "abc", undefined, "audio/mpeg");
    expect(await fingerprintStoredObject(f.supabase, draft)).toEqual({
      sizeBytes: 3,
      sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    });
    await expect(fingerprintStoredObject(f.supabase, `${draft}.missing`)).rejects.toThrow(MediaPublishError);
  });
});
