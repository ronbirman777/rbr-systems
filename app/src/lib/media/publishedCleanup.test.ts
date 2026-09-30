import { describe, expect, it } from "vitest";
import { cleanupStalePublishedMedia, PublishedMediaCleanupError, ORPHAN_GRACE_MS } from "./publishedCleanup";
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
