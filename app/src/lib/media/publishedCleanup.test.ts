import { describe, expect, it } from "vitest";
import { cleanupStalePublishedMedia, PublishedMediaCleanupError, ORPHAN_GRACE_MS } from "./publishedCleanup";
import { collectImageRefs, collectMediaRefs } from "./path";
import { makeFakeSupabase } from "./fakeSupabase.test-util";

const T = "tenant-1";
const NOW = Date.parse("2026-06-01T00:00:00Z");
const OLD = "2026-05-01T00:00:00Z";
const FRESH = new Date(NOW - 60_000).toISOString();

describe("cleanupStalePublishedMedia", () => {
  it("removes objects the previous snapshot had and the new one dropped, keeps everything current", async () => {
    const f = makeFakeSupabase();
    f.put(`${T}/meals/i/a/published.webp`, "A", FRESH);
    f.put(`${T}/meals/i/b/published.webp`, "B", FRESH);
    const cur = new Set([`${T}/meals/i/b/published.webp`]);
    const { removed } = await cleanupStalePublishedMedia(f.supabase, T, [`${T}/meals/i/a/published.webp`, `${T}/meals/i/b/published.webp`], cur, { now: NOW });
    expect(removed).toEqual([`${T}/meals/i/a/published.webp`]);
    expect(f.files.has(`${T}/meals/i/a/published.webp`)).toBe(false);
    expect(f.files.has(`${T}/meals/i/b/published.webp`)).toBe(true);
  });

  it("never touches draft objects, even unreferenced ones", async () => {
    const f = makeFakeSupabase();
    f.put(`${T}/meals/i/a/draft.webp`, "draft", OLD);
    await cleanupStalePublishedMedia(f.supabase, T, [], new Set(), { now: NOW });
    expect(f.files.has(`${T}/meals/i/a/draft.webp`)).toBe(true);
  });

  it("orphans (in no snapshot) are kept while younger than the grace period and reclaimed after", async () => {
    const f = makeFakeSupabase();
    f.put(`${T}/meals/i/fresh/published.webp`, "in-flight", FRESH);
    f.put(`${T}/meals/i/old/published.webp`, "orphan", OLD);
    await cleanupStalePublishedMedia(f.supabase, T, [], new Set(), { now: NOW, graceMs: ORPHAN_GRACE_MS });
    expect(f.files.has(`${T}/meals/i/fresh/published.webp`)).toBe(true);
    expect(f.files.has(`${T}/meals/i/old/published.webp`)).toBe(false);
  });

  it("refuses to remove a ref that is not this tenant's published object", async () => {
    const f = makeFakeSupabase();
    f.put(`other/meals/i/a/published.webp`, "x", FRESH);
    f.put(`${T}/meals/i/a/draft.webp`, "y", FRESH);
    await cleanupStalePublishedMedia(f.supabase, T, [`other/meals/i/a/published.webp`, `${T}/meals/i/a/draft.webp`], new Set(), { now: NOW });
    expect(f.files.has(`other/meals/i/a/published.webp`)).toBe(true);
    expect(f.files.has(`${T}/meals/i/a/draft.webp`)).toBe(true);
  });

  it("remove failure -> throws, deletes nothing, and a retry then succeeds (idempotent)", async () => {
    const f = makeFakeSupabase();
    f.put(`${T}/meals/i/a/published.webp`, "A", FRESH);
    const prev = [`${T}/meals/i/a/published.webp`];
    f.setFailure("remove", "storage down");
    await expect(cleanupStalePublishedMedia(f.supabase, T, prev, new Set(), { now: NOW })).rejects.toThrow(PublishedMediaCleanupError);
    expect(f.files.has(`${T}/meals/i/a/published.webp`)).toBe(true);
    f.setFailure("remove", null);
    await cleanupStalePublishedMedia(f.supabase, T, prev, new Set(), { now: NOW });
    expect(f.files.has(`${T}/meals/i/a/published.webp`)).toBe(false);
    // running it again on already-clean storage is a no-op, not an error
    await expect(cleanupStalePublishedMedia(f.supabase, T, prev, new Set(), { now: NOW })).resolves.toBeDefined();
  });

  it("list failure still performs the precise previous-snapshot removal, then reports the failure", async () => {
    const f = makeFakeSupabase();
    f.put(`${T}/meals/i/a/published.webp`, "A", FRESH);
    f.setFailure("list", "boom");
    await expect(
      cleanupStalePublishedMedia(f.supabase, T, [`${T}/meals/i/a/published.webp`], new Set(), { now: NOW })
    ).rejects.toThrow(PublishedMediaCleanupError);
    expect(f.files.has(`${T}/meals/i/a/published.webp`)).toBe(false);
  });

  it("finds published objects at any depth (versioned and legacy layouts)", async () => {
    const f = makeFakeSupabase();
    f.put(`${T}/brand/hero/u1/published.webp`, "v", OLD);
    f.put(`${T}/meals/i/published.webp`, "legacy-orphan", OLD);
    await cleanupStalePublishedMedia(f.supabase, T, [], new Set([`${T}/meals/i/published.webp`]), { now: NOW });
    expect(f.files.has(`${T}/brand/hero/u1/published.webp`)).toBe(false);
    expect(f.files.has(`${T}/meals/i/published.webp`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TASK 027.5 Phase 3B - the sweep is reference-aware for audio
// ---------------------------------------------------------------------------
describe("cleanupStalePublishedMedia - Teach audio", () => {
  const A1 = `${T}/teachAudioFile/item/up-1/published.mp3`;
  const A2 = `${T}/teachAudioFile/item/up-2/published.mp3`;
  const IMG = `${T}/teachAbout/profile/up-9/published.webp`;
  const snapshot = (audio: string) => ({ teachAudio: [{ id: "item", audioRef: audio }], teachAbout: { profile: { imageRef: IMG } } });

  it("15. referenced published audio is preserved - including as an aged orphan candidate", async () => {
    const f = makeFakeSupabase();
    f.put(A2, "audio", OLD);
    f.put(IMG, "img", OLD);
    const cur = collectMediaRefs(snapshot(A2));
    const { removed } = await cleanupStalePublishedMedia(f.supabase, T, cur, cur, { now: NOW });
    expect(removed).toEqual([]);
    expect(f.files.has(A2)).toBe(true);
    expect(f.files.has(IMG)).toBe(true);
  });

  it("16. audio replaced in the snapshot is identified as stale and removed; the new one stays; drafts are never touched", async () => {
    const f = makeFakeSupabase();
    f.put(A1, "old", FRESH);
    f.put(A2, "new", FRESH);
    f.put(`${T}/teachAudioFile/item/up-2/draft.mp3`, "draft", OLD);
    f.put(`${T}/teachAudioFile/item/up-3/draft.mp3`, "unattached", OLD);
    const { removed } = await cleanupStalePublishedMedia(f.supabase, T, collectMediaRefs(snapshot(A1)), collectMediaRefs(snapshot(A2)), { now: NOW });
    expect(removed).toEqual([A1]);
    expect(f.files.has(A2)).toBe(true);
    expect(f.files.has(`${T}/teachAudioFile/item/up-2/draft.mp3`)).toBe(true);
    expect(f.files.has(`${T}/teachAudioFile/item/up-3/draft.mp3`)).toBe(true);
  });

  it("an aged unreferenced published audio object is reclaimed as an orphan; a fresh one is not", async () => {
    const f = makeFakeSupabase();
    f.put(A1, "orphan", OLD);
    f.put(A2, "in-flight", FRESH);
    await cleanupStalePublishedMedia(f.supabase, T, [], new Set(), { now: NOW });
    expect(f.files.has(A1)).toBe(false);
    expect(f.files.has(A2)).toBe(true);
  });

  it("why callers must use collectMediaRefs: an image-only ref set would make live audio look orphaned", async () => {
    const f = makeFakeSupabase();
    f.put(A2, "live audio", OLD);
    const live = snapshot(A2);
    expect(collectImageRefs(live).has(A2)).toBe(false);
    expect(collectMediaRefs(live).has(A2)).toBe(true);
    const safe = collectMediaRefs(live);
    await cleanupStalePublishedMedia(f.supabase, T, safe, safe, { now: NOW });
    expect(f.files.has(A2)).toBe(true);
  });

  it("17. retreat-shaped snapshots: collectMediaRefs equals collectImageRefs, so the retreat sweep behaves exactly as before", async () => {
    const retreat = {
      brand: { hero: { imageRef: `${T}/brand/hero/up-1/published.webp` }, logo: { imageRef: null } },
      moduleCovers: { meals: { imageRef: `${T}/meals/cover/published.webp` } },
      meals: [{ id: "a", imageRef: `${T}/meals/a/up-2/published.webp` }],
      facilitators: [{ id: "f", imageRef: `${T}/facilitators/f/published.webp` }],
    };
    expect([...collectMediaRefs(retreat)].sort()).toEqual([...collectImageRefs(retreat)].sort());
    const f = makeFakeSupabase();
    f.put(`${T}/meals/a/up-1/published.webp`, "old", FRESH);
    f.put(`${T}/meals/a/up-2/published.webp`, "new", FRESH);
    const { removed } = await cleanupStalePublishedMedia(
      f.supabase,
      T,
      [`${T}/meals/a/up-1/published.webp`, `${T}/meals/a/up-2/published.webp`],
      collectMediaRefs(retreat),
      { now: NOW }
    );
    expect(removed).toEqual([`${T}/meals/a/up-1/published.webp`]);
  });
});
