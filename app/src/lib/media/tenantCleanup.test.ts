import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { removeAllTenantMedia } from "./tenantCleanup";

const T = "11111111-1111-4111-8111-111111111111";

describe("removeAllTenantMedia pagination", () => {
  it("enumerates all pages and nested folders before deleting any files", async () => {
    const first = Array.from({ length: 1000 }, (_, i) => ({ id: `id-${i}`, name: `file-${i}` }));
    const list = vi.fn(async (prefix: string, { offset }: { offset: number }) => ({
      data: prefix === `${T}/nested` ? [{ id: "nested-id", name: "photo.jpg" }]
        : offset === 0 ? first : [{ id: null, name: "nested" }], error: null,
    }));
    const remove = vi.fn(async () => ({ error: null }));
    const client = { storage: { from: () => ({ list, remove }) } } as unknown as SupabaseClient;
    await removeAllTenantMedia(client, T);
    expect(list).toHaveBeenCalledWith(T, expect.objectContaining({ offset: 1000 }));
    const deleted = remove.mock.calls.length;
    expect(deleted).toBe(11);
    expect(remove).toHaveBeenLastCalledWith([`${T}/nested/photo.jpg`]);
    expect(Math.max(...list.mock.invocationCallOrder)).toBeLessThan(remove.mock.invocationCallOrder[0]);
  });

  it("does not delete anything if a later listing page fails", async () => {
    const list = vi.fn().mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, i) => ({ id: `id-${i}`, name: `file-${i}` })), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
    const remove = vi.fn();
    const client = { storage: { from: () => ({ list, remove }) } } as unknown as SupabaseClient;
    await expect(removeAllTenantMedia(client, T)).rejects.toThrow("unavailable");
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("removeAllTenantMedia tenant scoping (TASK 024)", () => {
  it.each(["", ".", "..", "../x", "a/b", "tenant", `${T}/`, `${T}/meals`, `${T}x`, ` ${T}`, `${T}\n`])(
    "refuses %j without any Storage call",
    async (bad) => {
      const list = vi.fn();
      const remove = vi.fn();
      const client = { storage: { from: () => ({ list, remove }) } } as unknown as SupabaseClient;
      await expect(removeAllTenantMedia(client, bad)).rejects.toThrow("malformed tenant id");
      expect(list).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    }
  );

  it("lists and removes only paths inside the tenant's own folder, at every depth, including non-DB-shaped objects", async () => {
    const tree: Record<string, { id: string | null; name: string }[]> = {
      [T]: [{ id: null, name: "brand" }, { id: null, name: "meals" }, { id: null, name: "deep" }, { id: "r", name: "stray.png" }],
      [`${T}/brand`]: [{ id: null, name: "hero" }],
      [`${T}/brand/hero`]: [{ id: "h1", name: "draft.webp" }, { id: "h2", name: "published.webp" }],
      [`${T}/meals`]: [{ id: null, name: "cover" }, { id: null, name: "item" }],
      [`${T}/meals/cover`]: [{ id: "c1", name: "published.png" }],
      [`${T}/meals/item`]: [{ id: null, name: "upload-1" }, { id: "l1", name: "draft.png" }],
      [`${T}/meals/item/upload-1`]: [{ id: "v1", name: "draft.webp" }, { id: "v2", name: "published.webp" }],
      [`${T}/deep`]: [{ id: null, name: "a" }],
      [`${T}/deep/a`]: [{ id: null, name: "b" }],
      [`${T}/deep/a/b`]: [{ id: "d1", name: "x.bin" }],
    };
    const list = vi.fn(async (prefix: string) => ({ data: tree[prefix] ?? [], error: null }));
    const remove = vi.fn(async () => ({ error: null }));
    const client = { storage: { from: () => ({ list, remove }) } } as unknown as SupabaseClient;
    await removeAllTenantMedia(client, T);
    for (const [prefix] of list.mock.calls) expect(prefix === T || prefix.startsWith(`${T}/`)).toBe(true);
    const removed = (remove.mock.calls as unknown as string[][][]).flatMap((c) => c[0]).sort();
    expect(removed).toEqual(
      [
        `${T}/stray.png`,
        `${T}/brand/hero/draft.webp`,
        `${T}/brand/hero/published.webp`,
        `${T}/meals/cover/published.png`,
        `${T}/meals/item/draft.png`,
        `${T}/meals/item/upload-1/draft.webp`,
        `${T}/meals/item/upload-1/published.webp`,
        `${T}/deep/a/b/x.bin`,
      ].sort()
    );
    for (const p of removed) expect(p.startsWith(`${T}/`)).toBe(true);
  });
});

describe("removeAllTenantMedia silent partial removal (TASK 024)", () => {
  it("throws when Storage reports fewer removed objects than requested, without an error", async () => {
    const list = vi.fn(async () => ({ data: [{ id: "1", name: "a.png" }, { id: "2", name: "b.png" }], error: null }));
    const remove = vi.fn(async () => ({ data: [{ name: "a.png" }], error: null }));
    const client = { storage: { from: () => ({ list, remove }) } } as unknown as SupabaseClient;
    await expect(removeAllTenantMedia(client, T)).rejects.toThrow("Could not remove all Space media");
  });

  it("accepts a chunk when every requested object was reported removed", async () => {
    const list = vi.fn(async () => ({ data: [{ id: "1", name: "a.png" }, { id: "2", name: "b.png" }], error: null }));
    const remove = vi.fn(async () => ({ data: [{ name: "a.png" }, { name: "b.png" }], error: null }));
    const client = { storage: { from: () => ({ list, remove }) } } as unknown as SupabaseClient;
    await expect(removeAllTenantMedia(client, T)).resolves.toBeUndefined();
  });
});
