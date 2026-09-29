import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { removeAllTenantMedia } from "./tenantCleanup";

describe("removeAllTenantMedia pagination", () => {
  it("enumerates all pages and nested folders before deleting any files", async () => {
    const first = Array.from({ length: 1000 }, (_, i) => ({ id: `id-${i}`, name: `file-${i}` }));
    const list = vi.fn(async (prefix: string, { offset }: { offset: number }) => ({
      data: prefix === "tenant/nested" ? [{ id: "nested-id", name: "photo.jpg" }]
        : offset === 0 ? first : [{ id: null, name: "nested" }], error: null,
    }));
    const remove = vi.fn(async () => ({ error: null }));
    const client = { storage: { from: () => ({ list, remove }) } } as unknown as SupabaseClient;
    await removeAllTenantMedia(client, "tenant");
    expect(list).toHaveBeenCalledWith("tenant", expect.objectContaining({ offset: 1000 }));
    const deleted = remove.mock.calls.length;
    expect(deleted).toBe(11);
    expect(remove).toHaveBeenLastCalledWith(["tenant/nested/photo.jpg"]);
    expect(Math.max(...list.mock.invocationCallOrder)).toBeLessThan(remove.mock.invocationCallOrder[0]);
  });

  it("does not delete anything if a later listing page fails", async () => {
    const list = vi.fn().mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, i) => ({ id: `id-${i}`, name: `file-${i}` })), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
    const remove = vi.fn();
    const client = { storage: { from: () => ({ list, remove }) } } as unknown as SupabaseClient;
    await expect(removeAllTenantMedia(client, "tenant")).rejects.toThrow("unavailable");
    expect(remove).not.toHaveBeenCalled();
  });
});
