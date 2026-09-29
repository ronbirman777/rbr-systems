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

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (table: string) => {
      if (table === "user_space_slots") {
        return { select: () => ({ eq: () => ({ maybeSingle: mockFromSelect }) }) };
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

      const result = await archiveSpace({ error: null }, formData({ tenantId: "t1" }));

      expect(mockRpc).toHaveBeenCalledWith("archive_space", { p_tenant_id: "t1" });
      expect(result.success).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/space");
    });

    it("never claims success when the RPC (e.g. non-owner) rejects", async () => {
      mockRpc.mockResolvedValue({ error: { message: "not authorized" } });
      const { archiveSpace } = await loadActions();

      const result = await archiveSpace({ error: null }, formData({ tenantId: "t1" }));

      expect(result.success).toBeUndefined();
      expect(result.error).toBeTruthy();
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });

  describe("restoreSpace", () => {
    it("distinguishes a slot-limit rejection from every other failure", async () => {
      mockRpc.mockResolvedValue({ error: { hint: "SLOT_LIMIT_REACHED" } });
      const { restoreSpace } = await loadActions();

      const result = await restoreSpace({ error: null }, formData({ tenantId: "t1" }));

      expect(result.slotLimitReached).toBe(true);
    });
  });

  describe("replaceSpace", () => {
    it("refuses to call the RPC at all unless the typed confirmation matches the Space's current name", async () => {
      const { replaceSpace } = await loadActions();

      const result = await replaceSpace(
        { error: null },
        formData({ tenantId: "t1", expectedName: "Real Name", confirmName: "wrong" })
      );

      expect(result.error).toBeTruthy();
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("calls replace_space only once the typed name matches exactly", async () => {
      mockRpc.mockResolvedValue({ error: null });
      const { replaceSpace } = await loadActions();

      const result = await replaceSpace(
        { error: null },
        formData({ tenantId: "t1", expectedName: "Real Name", confirmName: "Real Name", newName: "New" })
      );

      expect(mockRpc).toHaveBeenCalledWith("replace_space", { p_tenant_id: "t1", p_new_name: "New" });
      expect(result.success).toBe(true);
    });
  });

  describe("deleteSpace (Task 014, item B)", () => {
    it("refuses to call the RPC at all unless the typed confirmation matches the Space's current name", async () => {
      const { deleteSpace } = await loadActions();

      const result = await deleteSpace(
        { error: null },
        formData({ tenantId: "t1", expectedName: "Real Name", confirmName: "wrong" })
      );

      expect(result.error).toBeTruthy();
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it("refuses to call the RPC when no confirmation was typed at all", async () => {
      const { deleteSpace } = await loadActions();

      const result = await deleteSpace({ error: null }, formData({ tenantId: "t1", expectedName: "Real Name" }));

      expect(result.error).toBeTruthy();
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("calls delete_space only once the typed name matches exactly, and revalidates My Spaces on success", async () => {
      mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
      mockRpc.mockResolvedValue({ error: null });
      const { deleteSpace } = await loadActions();

      const result = await deleteSpace(
        { error: null },
        formData({ tenantId: "t1", expectedName: "Real Name", confirmName: "Real Name" })
      );

      expect(mockRpc).toHaveBeenCalledWith("delete_space", { p_tenant_id: "t1" });
      expect(result.success).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/space");
    });

    it("never claims success when the RPC (e.g. non-owner) rejects, even with a correctly typed name", async () => {
      mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
      mockRpc.mockResolvedValue({ error: { message: "not authorized" } });
      const { deleteSpace } = await loadActions();

      const result = await deleteSpace(
        { error: null },
        formData({ tenantId: "t1", expectedName: "Real Name", confirmName: "Real Name" })
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
        formData({ tenantId: "t1", expectedName: "Real Name", confirmName: "Real Name" })
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
        formData({ tenantId: "t1", expectedName: "Real Name", confirmName: "Real Name" })
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
        formData({ tenantId: "t1", expectedName: "Real Name", confirmName: "Real Name" })
      );

      expect(mockStorageRemove).toHaveBeenCalledWith(["t1/draft.webp", "t1/published.webp"]);
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
        formData({ tenantId: "t1", expectedName: "Real Name", confirmName: "Real Name" })
      );

      expect(result.error).toBeTruthy();
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it("recurses into folder-shaped list entries (id: null) to find real files at any depth", async () => {
      mockFromCountSelect.mockResolvedValue({ data: [{ role: "owner" }], error: null });
      mockStorageList.mockImplementation((prefix: string) => {
        if (prefix === "t1") return Promise.resolve({ data: [{ id: null, name: "facilitators" }], error: null });
        if (prefix === "t1/facilitators") return Promise.resolve({ data: [{ id: null, name: "item-1" }], error: null });
        if (prefix === "t1/facilitators/item-1") {
          return Promise.resolve({ data: [{ id: "obj-1", name: "draft.jpg" }], error: null });
        }
        throw new Error(`unexpected prefix in test: ${prefix}`);
      });
      mockStorageRemove.mockResolvedValue({ error: null });
      mockRpc.mockResolvedValue({ error: null });
      const { deleteSpace } = await loadActions();

      const result = await deleteSpace(
        { error: null },
        formData({ tenantId: "t1", expectedName: "Real Name", confirmName: "Real Name" })
      );

      expect(mockStorageRemove).toHaveBeenCalledWith(["t1/facilitators/item-1/draft.jpg"]);
      expect(result.success).toBe(true);
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
