import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Task 011: structural/orchestration coverage for the lifecycle Server
 * Actions. Real authorization (is_tenant_owner()) and capacity
 * enforcement live in the database (0017_space_management_slots.sql,
 * verified in isolated local Postgres - see
 * 011/evidence/local-verification.md) and are NOT re-proven with mocks
 * here; these tests only prove the thin Server Action layer forwards
 * input/errors correctly and never fabricates success.
 */

const mockGetUser = vi.fn();
const mockRpc = vi.fn();
const mockRevalidatePath = vi.fn();
const mockFromSelect = vi.fn();
const mockFromCountSelect = vi.fn();
const mockStorageList = vi.fn();
const mockStorageRemove = vi.fn();
const mockTenantSelect = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (table: string) => {
      if (table === "user_space_slots") {
        return { select: () => ({ eq: () => ({ maybeSingle: mockFromSelect }) }) };
      }
      if (table === "tenants") {
        return { select: () => ({ eq: () => ({ maybeSingle: mockTenantSelect }) }) };
      }
      if (table === "tenant_members") {
        return { select: () => ({ eq: () => ({ eq: mockFromCountSelect }) }) };
      }
      throw new Error(`unexpected table in test: ${table}`);
    },
    storage: {
      from: () => ({
        list: (...args: unknown[]) => mockStorageList(...args),
        remove: (...args: unknown[]) => mockStorageRemove(...args),
      }),
    },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args) }));

async function loadActions() {
  return import("./lifecycleActions");
}

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("lifecycleActions - Task 011", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    // Task 017 default: an empty media listing, so tests that don't care
    // about Storage cleanup specifics reach delete_space() unimpeded.
    mockStorageList.mockResolvedValue({ data: [], error: null });
    mockTenantSelect.mockResolvedValue({ data: { product_type: "retreat" } });
  });

  describe("getSpaceSlotSummary", () => {
    it("derives used/available from allowed and owned-tenant count, never persisting a separate count", async () => {
      mockFromSelect.mockResolvedValue({ data: { slots_allowed: 3 } });
      mockFromCountSelect.mockResolvedValue({ count: 2 });

      const { getSpaceSlotSummary } = await loadActions();
      const summary = await getSpaceSlotSummary();

      expect(summary).toEqual({ slotsAllowed: 3, slotsUsed: 2, slotsAvailable: 1 });
    });

    it("fails closed (0/0/0) for a signed-out caller rather than assuming unlimited access", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const { getSpaceSlotSummary } = await loadActions();
      const summary = await getSpaceSlotSummary();

      expect(summary).toEqual({ slotsAllowed: 0, slotsUsed: 0, slotsAvailable: 0 });
    });

    it("fails closed (0 allowed) rather than unlimited when the allowance row is missing/unreadable", async () => {
      mockFromSelect.mockResolvedValue({ data: null });
      mockFromCountSelect.mockResolvedValue({ count: 0 });

      const { getSpaceSlotSummary } = await loadActions();
      const summary = await getSpaceSlotSummary();

      expect(summary.slotsAllowed).toBe(0);
      expect(summary.slotsAvailable).toBe(0);
    });

    it("Task 021: a freshly provisioned account (default row of 1, no Spaces) can enter Create New Space", async () => {
      mockFromSelect.mockResolvedValue({ data: { slots_allowed: 1 } });
      mockFromCountSelect.mockResolvedValue({ count: 0 });

      const { getSpaceSlotSummary } = await loadActions();
      const summary = await getSpaceSlotSummary();

      expect(summary).toEqual({ slotsAllowed: 1, slotsUsed: 0, slotsAvailable: 1 });
    });

    it("Task 021: an existing zero-capacity row is honoured as 0 (it is not 'missing' and is never upgraded)", async () => {
      mockFromSelect.mockResolvedValue({ data: { slots_allowed: 0 } });
      mockFromCountSelect.mockResolvedValue({ count: 0 });

      const { getSpaceSlotSummary } = await loadActions();
      const summary = await getSpaceSlotSummary();

      expect(summary).toEqual({ slotsAllowed: 0, slotsUsed: 0, slotsAvailable: 0 });
    });

    it("Task 021: a full-capacity account stays blocked (used == allowed -> 0 available)", async () => {
      mockFromSelect.mockResolvedValue({ data: { slots_allowed: 1 } });
      mockFromCountSelect.mockResolvedValue({ count: 1 });

      const { getSpaceSlotSummary } = await loadActions();
      const summary = await getSpaceSlotSummary();

      expect(summary).toEqual({ slotsAllowed: 1, slotsUsed: 1, slotsAvailable: 0 });
    });

    it("never reports a negative slotsAvailable when used exceeds allowed", async () => {
      mockFromSelect.mockResolvedValue({ data: { slots_allowed: 1 } });
      mockFromCountSelect.mockResolvedValue({ count: 5 });

      const { getSpaceSlotSummary } = await loadActions();
      const summary = await getSpaceSlotSummary();

      expect(summary.slotsAvailable).toBe(0);
    });
  });

  describe("archiveSpace", () => {
    it("forwards to the archive_space RPC and revalidates My Spaces on success", async () => {
      mockRpc.mockResolvedValue({ error: null });
      const { archiveSpace } = await loadActions();

      const result = await archiveSpace({ error: null }, formData({ tenantId: "11111111-1111-4111-8111-111111111111" }));

      expect(mockRpc).toHaveBeenCalledWith("archive_space", { p_tenant_id: "11111111-1111-4111-8111-111111111111" });
      expect(result.success).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/space");
    });

    it("never claims success when the RPC (e.g. non-owner) rejects", async () => {
      mockRpc.mockResolvedValue({ error: { message: "not authorized" } });
      const { archiveSpace } = await loadActions();

      const result = await archiveSpace({ error: null }, formData({ tenantId: "11111111-1111-4111-8111-111111111111" }));

      expect(result.success).toBeUndefined();
      expect(result.error).toBeTruthy();
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });

  describe("restoreSpace", () => {
    it("distinguishes a slot-limit rejection from every other failure", async () => {
      mockRpc.mockResolvedValue({ error: { hint: "SLOT_LIMIT_REACHED" } });
      const { restoreSpace } = await loadActions();

      const result = await restoreSpace({ error: null }, formData({ tenantId: "11111111-1111-4111-8111-111111111111" }));

      expect(result.slotLimitReached).toBe(true);
    });
  });

  describe("replaceSpace", () => {
    const confirmed = { tenantId: "11111111-1111-4111-8111-111111111111", expectedName: "Real Name", confirmName: "Real Name", newName: "New" };

    it("refuses to call the RPC at all unless the typed confirmation matches the Space's current name", async () => {
      const { replaceSpace } = await loadActions();

      const result = await replaceSpace(
        { error: null },
        formData({ tenantId: "11111111-1111-4111-8111-111111111111", expectedName: "Real Name", confirmName: "wrong" })
      );

      expect(result.error).toBeTruthy();
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockStorageList).not.toHaveBeenCalled();
      expect(mockStorageRemove).not.toHaveBeenCalled();
    });

    it("calls replace_space only once the typed name matches exactly", async () => {
      mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
      mockRpc.mockResolvedValue({ error: null });
      const { replaceSpace } = await loadActions();

      const result = await replaceSpace({ error: null }, formData(confirmed));

      expect(mockRpc).toHaveBeenCalledWith("replace_space", { p_tenant_id: "11111111-1111-4111-8111-111111111111", p_new_name: "New" });
      expect(result.success).toBe(true);
    });

    /**
     * TASK 024: Replace keeps the tenant id, so before this fix the old
     * content's Storage objects were never removed. It now runs the same
     * Storage-first routine as Space deletion.
     */
    it("removes every discovered media object (at any depth) before calling replace_space", async () => {
      mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
      mockStorageList.mockImplementation((prefix: string) => {
        if (prefix === "11111111-1111-4111-8111-111111111111") return Promise.resolve({ data: [{ id: null, name: "meals" }, { id: "o0", name: "stray.png" }], error: null });
        if (prefix === "11111111-1111-4111-8111-111111111111/meals") return Promise.resolve({ data: [{ id: null, name: "item" }], error: null });
        if (prefix === "11111111-1111-4111-8111-111111111111/meals/item") return Promise.resolve({ data: [{ id: null, name: "upload" }, { id: "o1", name: "draft.png" }], error: null });
        if (prefix === "11111111-1111-4111-8111-111111111111/meals/item/upload") return Promise.resolve({ data: [{ id: "o2", name: "draft.webp" }, { id: "o3", name: "published.webp" }], error: null });
        throw new Error(`unexpected prefix in test: ${prefix}`);
      });
      mockStorageRemove.mockResolvedValue({ error: null });
      mockRpc.mockResolvedValue({ error: null });
      const { replaceSpace } = await loadActions();

      const result = await replaceSpace({ error: null }, formData(confirmed));

      const removed = mockStorageRemove.mock.calls.flatMap((c) => c[0] as string[]).sort();
      expect(removed).toEqual([
        "11111111-1111-4111-8111-111111111111/meals/item/draft.png",
        "11111111-1111-4111-8111-111111111111/meals/item/upload/draft.webp",
        "11111111-1111-4111-8111-111111111111/meals/item/upload/published.webp",
        "11111111-1111-4111-8111-111111111111/stray.png",
      ]);
      expect(mockStorageRemove.mock.invocationCallOrder[0]).toBeLessThan(mockRpc.mock.invocationCallOrder[0]);
      expect(result.success).toBe(true);
    });

    it("never touches Storage or the RPC for a non-owner member", async () => {
      mockFromCountSelect.mockResolvedValue({ data: [{ role: "practitioner" }], error: null });
      const { replaceSpace } = await loadActions();

      const result = await replaceSpace({ error: null }, formData(confirmed));

      expect(result.error).toBeTruthy();
      expect(mockStorageList).not.toHaveBeenCalled();
      expect(mockStorageRemove).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("never touches Storage or the RPC when membership cannot be verified", async () => {
      mockFromCountSelect.mockResolvedValue({ data: null, error: { message: "boom" } });
      const { replaceSpace } = await loadActions();

      const result = await replaceSpace({ error: null }, formData(confirmed));

      expect(result.error).toBeTruthy();
      expect(mockStorageList).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("does not reset the Space when listing fails, leaving it intact and retryable", async () => {
      mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
      mockStorageList.mockResolvedValue({ data: null, error: { message: "network error" } });
      const { replaceSpace } = await loadActions();

      const result = await replaceSpace({ error: null }, formData(confirmed));

      expect(result.error).toBeTruthy();
      expect(result.success).toBeUndefined();
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it("does not reset the Space when only PART of the removal succeeds (second chunk fails)", async () => {
      mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
      mockStorageList.mockResolvedValue({
        data: Array.from({ length: 150 }, (_, i) => ({ id: `id-${i}`, name: `f-${i}.png` })),
        error: null,
      });
      mockStorageRemove.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "partial" } });
      const { replaceSpace } = await loadActions();

      const result = await replaceSpace({ error: null }, formData(confirmed));

      expect(mockStorageRemove).toHaveBeenCalledTimes(2);
      expect(result.error).toBeTruthy();
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it("a retry after a partial failure only removes what is left and then completes the reset", async () => {
      mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
      mockStorageList.mockResolvedValueOnce({ data: [{ id: "a", name: "x.png" }], error: null });
      mockStorageRemove.mockResolvedValueOnce({ error: { message: "transient" } });
      const { replaceSpace } = await loadActions();
      const first = await replaceSpace({ error: null }, formData(confirmed));
      expect(first.error).toBeTruthy();
      expect(mockRpc).not.toHaveBeenCalled();

      mockStorageList.mockResolvedValueOnce({ data: [], error: null });
      mockRpc.mockResolvedValue({ error: null });
      const second = await replaceSpace({ error: null }, formData(confirmed));
      expect(second.success).toBe(true);
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });

    it("never claims success when the reset fails AFTER Storage was cleaned (retryable, documented window)", async () => {
      mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
      mockStorageList.mockResolvedValue({ data: [{ id: "a", name: "x.png" }], error: null });
      mockStorageRemove.mockResolvedValue({ error: null });
      mockRpc.mockResolvedValue({ error: { message: "db down" } });
      const { replaceSpace } = await loadActions();

      const result = await replaceSpace({ error: null }, formData(confirmed));

      expect(result.error).toBeTruthy();
      expect(result.success).toBeUndefined();
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it("refuses a malformed tenant id without any Storage call", async () => {
      mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
      const { replaceSpace } = await loadActions();

      const result = await replaceSpace({ error: null }, formData({ ...confirmed, tenantId: "../other" }));

      expect(result.error).toBeTruthy();
      expect(mockStorageList).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe("replaceSpace - Space Type Registry (TASK 027.5 Phase 2B)", () => {
    const T = "11111111-1111-4111-8111-111111111111";
    const unnamed = { tenantId: T, expectedName: "Real Name", confirmName: "Real Name" };

    it("a Retreat Replace with no new name still defaults to 'Untitled Retreat' (unchanged)", async () => {
      mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
      mockRpc.mockResolvedValue({ error: null });
      const { replaceSpace } = await loadActions();

      const result = await replaceSpace({ error: null }, formData(unnamed));

      expect(mockRpc).toHaveBeenCalledWith("replace_space", { p_tenant_id: T, p_new_name: "Untitled Retreat" });
      expect(result.success).toBe(true);
    });

    it("a Teach Replace defaults from the Space's own type and keeps product_type (the RPC is only ever given id + name)", async () => {
      mockTenantSelect.mockResolvedValue({ data: { product_type: "teach" } });
      mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
      mockRpc.mockResolvedValue({ error: null });
      const { replaceSpace } = await loadActions();

      const result = await replaceSpace({ error: null }, formData(unnamed));

      // replace_space() never writes product_type (0027); the action sends
      // nothing that could change it and performs no tenants write itself.
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith("replace_space", { p_tenant_id: T, p_new_name: "My Teaching Space" });
      expect(result.success).toBe(true);
    });

    it("a Teach Replace removes audio and every other object under the tenant folder, Storage first", async () => {
      mockTenantSelect.mockResolvedValue({ data: { product_type: "teach" } });
      mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
      mockStorageList.mockImplementation((prefix: string) => {
        if (prefix === T) return Promise.resolve({ data: [{ id: null, name: "teachAudio" }], error: null });
        if (prefix === `${T}/teachAudio`) return Promise.resolve({ data: [{ id: null, name: "item" }], error: null });
        if (prefix === `${T}/teachAudio/item`) return Promise.resolve({ data: [{ id: "a1", name: "draft.mp3" }, { id: "a2", name: "published.mp3" }], error: null });
        throw new Error(`unexpected prefix in test: ${prefix}`);
      });
      mockStorageRemove.mockResolvedValue({ error: null });
      mockRpc.mockResolvedValue({ error: null });
      const { replaceSpace } = await loadActions();

      const result = await replaceSpace({ error: null }, formData(unnamed));

      const removed = mockStorageRemove.mock.calls.flatMap((c) => c[0] as string[]).sort();
      expect(removed).toEqual([`${T}/teachAudio/item/draft.mp3`, `${T}/teachAudio/item/published.mp3`]);
      expect(mockStorageRemove.mock.invocationCallOrder[0]).toBeLessThan(mockRpc.mock.invocationCallOrder[0]);
      expect(result.success).toBe(true);
    });

    it("a Teach Replace whose Storage cleanup fails never resets the database (fail closed, retryable)", async () => {
      mockTenantSelect.mockResolvedValue({ data: { product_type: "teach" } });
      mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
      mockStorageList.mockResolvedValue({ data: null, error: { message: "boom" } });
      const { replaceSpace } = await loadActions();

      const result = await replaceSpace({ error: null }, formData(unnamed));

      expect(result.error).toBeTruthy();
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it.each([["mystery"], [""], [null]])("refuses product_type %j before any Storage or database change", async (product_type) => {
      mockTenantSelect.mockResolvedValue({ data: { product_type } });
      mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
      const { replaceSpace } = await loadActions();

      const result = await replaceSpace({ error: null }, formData(unnamed));

      expect(result.error).toBeTruthy();
      expect(mockStorageList).not.toHaveBeenCalled();
      expect(mockStorageRemove).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("refuses when the tenant cannot be read (not a member / not found) before any Storage or database change", async () => {
      mockTenantSelect.mockResolvedValue({ data: null });
      const { replaceSpace } = await loadActions();

      const result = await replaceSpace({ error: null }, formData(unnamed));

      expect(result.error).toBeTruthy();
      expect(mockStorageList).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe("deleteSpace (Task 014, item B)", () => {
    it("refuses to call the RPC at all unless the typed confirmation matches the Space's current name", async () => {
      const { deleteSpace } = await loadActions();

      const result = await deleteSpace(
        { error: null },
        formData({ tenantId: "11111111-1111-4111-8111-111111111111", expectedName: "Real Name", confirmName: "wrong" })
      );

      expect(result.error).toBeTruthy();
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it("refuses to call the RPC when no confirmation was typed at all", async () => {
      const { deleteSpace } = await loadActions();

      const result = await deleteSpace({ error: null }, formData({ tenantId: "11111111-1111-4111-8111-111111111111", expectedName: "Real Name" }));

      expect(result.error).toBeTruthy();
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("calls delete_space only once the typed name matches exactly, and revalidates My Spaces on success", async () => {
      mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
      mockRpc.mockResolvedValue({ error: null });
      const { deleteSpace } = await loadActions();

      const result = await deleteSpace(
        { error: null },
        formData({ tenantId: "11111111-1111-4111-8111-111111111111", expectedName: "Real Name", confirmName: "Real Name" })
      );

      expect(mockRpc).toHaveBeenCalledWith("delete_space", { p_tenant_id: "11111111-1111-4111-8111-111111111111" });
      expect(result.success).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/space");
    });

    it("never claims success when the RPC (e.g. non-owner) rejects, even with a correctly typed name", async () => {
      mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
      mockRpc.mockResolvedValue({ error: { message: "not authorized" } });
      const { deleteSpace } = await loadActions();

      const result = await deleteSpace(
        { error: null },
        formData({ tenantId: "11111111-1111-4111-8111-111111111111", expectedName: "Real Name", confirmName: "Real Name" })
      );

      expect(result.success).toBeUndefined();
      expect(result.error).toBeTruthy();
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it("requires being logged in before ever calling the RPC", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { deleteSpace } = await loadActions();

      const result = await deleteSpace(
        { error: null },
        formData({ tenantId: "11111111-1111-4111-8111-111111111111", expectedName: "Real Name", confirmName: "Real Name" })
      );

      expect(result.error).toBeTruthy();
      expect(mockRpc).not.toHaveBeenCalled();
    });

    /**
     * Task 017 (Space Storage Cleanup) — deleteSpace() now delegates to
     * deleteSpaceCompletely(), which (a) re-verifies ownership before
     * touching Storage at all (the Storage RLS policy only requires
     * membership, not ownership - see lifecycleActions.ts's own comment),
     * (b) removes every discovered media path before ever calling
     * delete_space(), and (c) never calls delete_space() if Storage
     * cleanup fails, so the Space is left completely intact and
     * retryable rather than silently keeping orphaned files.
     */
    it("never touches Storage or the RPC for a non-owner member, even with a correctly typed name", async () => {
      mockFromCountSelect.mockResolvedValue({ data: [{ role: "practitioner" }], error: null });
      const { deleteSpace } = await loadActions();

      const result = await deleteSpace(
        { error: null },
        formData({ tenantId: "11111111-1111-4111-8111-111111111111", expectedName: "Real Name", confirmName: "Real Name" })
      );

      expect(result.error).toBeTruthy();
      expect(mockStorageList).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("removes every discovered media object before calling delete_space", async () => {
      mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
      mockStorageList.mockResolvedValue({
        data: [
          { id: "obj-1", name: "draft.webp" },
          { id: "obj-2", name: "published.webp" },
        ],
        error: null,
      });
      mockStorageRemove.mockResolvedValue({ error: null });
      mockRpc.mockResolvedValue({ error: null });
      const { deleteSpace } = await loadActions();

      const result = await deleteSpace(
        { error: null },
        formData({ tenantId: "11111111-1111-4111-8111-111111111111", expectedName: "Real Name", confirmName: "Real Name" })
      );

      expect(mockStorageRemove).toHaveBeenCalledWith(["11111111-1111-4111-8111-111111111111/draft.webp", "11111111-1111-4111-8111-111111111111/published.webp"]);
      const removeOrder = mockStorageRemove.mock.invocationCallOrder[0];
      const rpcOrder = mockRpc.mock.invocationCallOrder[0];
      expect(removeOrder).toBeLessThan(rpcOrder);
      expect(result.success).toBe(true);
    });

    it("never calls delete_space if Storage cleanup fails, leaving the Space retryable rather than orphaning files", async () => {
      mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
      mockStorageList.mockResolvedValue({ data: null, error: { message: "network error" } });
      const { deleteSpace } = await loadActions();

      const result = await deleteSpace(
        { error: null },
        formData({ tenantId: "11111111-1111-4111-8111-111111111111", expectedName: "Real Name", confirmName: "Real Name" })
      );

      expect(result.error).toBeTruthy();
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it("recurses into folder-shaped list entries (id: null) to find real files at any depth", async () => {
      mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
      mockStorageList.mockImplementation((prefix: string) => {
        if (prefix === "11111111-1111-4111-8111-111111111111") return Promise.resolve({ data: [{ id: null, name: "facilitators" }], error: null });
        if (prefix === "11111111-1111-4111-8111-111111111111/facilitators") return Promise.resolve({ data: [{ id: null, name: "item-1" }], error: null });
        if (prefix === "11111111-1111-4111-8111-111111111111/facilitators/item-1") {
          return Promise.resolve({ data: [{ id: "obj-1", name: "draft.jpg" }], error: null });
        }
        throw new Error(`unexpected prefix in test: ${prefix}`);
      });
      mockStorageRemove.mockResolvedValue({ error: null });
      mockRpc.mockResolvedValue({ error: null });
      const { deleteSpace } = await loadActions();

      const result = await deleteSpace(
        { error: null },
        formData({ tenantId: "11111111-1111-4111-8111-111111111111", expectedName: "Real Name", confirmName: "Real Name" })
      );

      expect(mockStorageRemove).toHaveBeenCalledWith(["11111111-1111-4111-8111-111111111111/facilitators/item-1/draft.jpg"]);
      expect(result.success).toBe(true);
    });

    /**
     * TASK 027.5 QA correction (Time to Teach delete). Teach Spaces store images AND
     * audio under versioned {tenant}/{module}/{item}/{uploadId}/ folders. Deleting one
     * must follow the same Storage-first order as every Space, reach those deep
     * folders, and never delete the row while any object could remain.
     */
    describe("Time to Teach Space", () => {
      const T = "22222222-2222-4222-8222-222222222222";
      const confirm = () => formData({ tenantId: T, expectedName: "My Teaching Space", confirmName: "My Teaching Space" });

      it("removes versioned image and audio objects at depth 4 before delete_space, then revalidates", async () => {
        mockTenantSelect.mockResolvedValue({ data: { product_type: "teach" } });
        mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
        const tree: Record<string, { id: string | null; name: string }[]> = {
          [T]: [{ id: null, name: "teachAudio" }, { id: null, name: "teachAudioFile" }, { id: "o0", name: "hero.webp" }],
          [`${T}/teachAudio`]: [{ id: null, name: "item-1" }],
          [`${T}/teachAudio/item-1`]: [{ id: null, name: "up-1" }],
          [`${T}/teachAudio/item-1/up-1`]: [{ id: "o1", name: "draft.webp" }, { id: "o2", name: "published.webp" }],
          [`${T}/teachAudioFile`]: [{ id: null, name: "item-1" }],
          [`${T}/teachAudioFile/item-1`]: [{ id: null, name: "up-2" }],
          [`${T}/teachAudioFile/item-1/up-2`]: [{ id: "o3", name: "draft.mp3" }, { id: "o4", name: "published.mp3" }],
        };
        mockStorageList.mockImplementation((prefix: string) => Promise.resolve({ data: tree[prefix] ?? [], error: null }));
        mockStorageRemove.mockResolvedValue({ error: null });
        mockRpc.mockResolvedValue({ error: null });
        const { deleteSpace } = await loadActions();

        const result = await deleteSpace({ error: null }, confirm());

        const removed = mockStorageRemove.mock.calls.flatMap((c) => c[0] as string[]).sort();
        expect(removed).toEqual(
          [
            `${T}/hero.webp`,
            `${T}/teachAudio/item-1/up-1/draft.webp`,
            `${T}/teachAudio/item-1/up-1/published.webp`,
            `${T}/teachAudioFile/item-1/up-2/draft.mp3`,
            `${T}/teachAudioFile/item-1/up-2/published.mp3`,
          ].sort()
        );
        expect(mockStorageRemove.mock.invocationCallOrder.at(-1)!).toBeLessThan(mockRpc.mock.invocationCallOrder[0]);
        expect(mockRpc).toHaveBeenCalledWith("delete_space", { p_tenant_id: T });
        expect(result.success).toBe(true);
        expect(mockRevalidatePath).toHaveBeenCalledWith("/space");
      });

      it("deletes a brand-new Teach Space that has no media at all", async () => {
        mockTenantSelect.mockResolvedValue({ data: { product_type: "teach" } });
        mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
        mockStorageList.mockResolvedValue({ data: [], error: null });
        mockRpc.mockResolvedValue({ error: null });
        const { deleteSpace } = await loadActions();

        const result = await deleteSpace({ error: null }, confirm());

        expect(mockStorageRemove).not.toHaveBeenCalled();
        expect(mockRpc).toHaveBeenCalledWith("delete_space", { p_tenant_id: T });
        expect(result.success).toBe(true);
      });

      it("keeps the Space intact and retryable when Storage listing fails (e.g. the 22P02 policy error)", async () => {
        mockTenantSelect.mockResolvedValue({ data: { product_type: "teach" } });
        mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
        mockStorageList.mockResolvedValue({ data: null, error: { message: 'invalid input syntax for type uuid: "__backup_test"' } });
        const { deleteSpace } = await loadActions();

        const result = await deleteSpace({ error: null }, confirm());

        expect(result.success).toBeUndefined();
        expect(result.error).toBe("Couldn't delete this Space. Please try again.");
        expect(mockStorageRemove).not.toHaveBeenCalled();
        expect(mockRpc).not.toHaveBeenCalled();
        expect(mockRevalidatePath).not.toHaveBeenCalled();
      });

      it("keeps the Space when a Storage remove fails part-way, never reaching delete_space", async () => {
        mockTenantSelect.mockResolvedValue({ data: { product_type: "teach" } });
        mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
        mockStorageList.mockResolvedValue({ data: [{ id: "o1", name: "hero.webp" }], error: null });
        mockStorageRemove.mockResolvedValue({ error: { message: "boom" } });
        const { deleteSpace } = await loadActions();

        const result = await deleteSpace({ error: null }, confirm());

        expect(result.error).toBeTruthy();
        expect(mockRpc).not.toHaveBeenCalled();
      });

      it("never touches Storage for a non-owner member of a Teach Space (cross-tenant protection unchanged)", async () => {
        mockTenantSelect.mockResolvedValue({ data: { product_type: "teach" } });
        mockFromCountSelect.mockResolvedValue({ data: [{ role: "practitioner" }], error: null });
        const { deleteSpace } = await loadActions();

        const result = await deleteSpace({ error: null }, confirm());

        expect(result.error).toBeTruthy();
        expect(mockStorageList).not.toHaveBeenCalled();
        expect(mockRpc).not.toHaveBeenCalled();
      });
    });
  });
});

describe("lifecycleActions.ts - \"use server\" export shape (Task 011, same defect class as Task 008C's CRITICAL-1)", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/configurator/retreat/lifecycleActions.ts"), "utf8");

  it("declares \"use server\" at module scope", () => {
    expect(source).toMatch(/^"use server";/);
  });

  it("exports only async functions at runtime (type-only exports are erased and don't count)", () => {
    const exportLines = source.split("\n").filter((line) => line.startsWith("export "));
    const runtimeExportLines = exportLines.filter((line) => !line.startsWith("export type "));
    for (const line of runtimeExportLines) {
      expect(line).toMatch(/^export async function\b/);
    }
    expect(runtimeExportLines.length).toBeGreaterThan(0);
  });

  it("does not export the initial-state constant itself (it moved to lifecycleActionsState.ts)", () => {
    expect(source).not.toContain("export const INITIAL_LIFECYCLE_STATE");
    expect(source).not.toContain("export { INITIAL_LIFECYCLE_STATE }");
  });
});
