import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Task 011: saveDraft() creation-path coverage that did not exist before
 * this task - (a) a slot-limit rejection from the database must surface
 * as a distinct, legible state (not a generic error), and (b) a brand
 * validation failure on first save must NEVER reach the tenant insert at
 * all (the pre-011 ordering created the tenant first and validated
 * second, stranding a consumed slot behind a bare row on any validation
 * failure - see the lifecycle review's section 3 finding). Every other
 * saveDraft() behavior (existing tenant update, brand upsert success) is
 * unchanged and not re-tested here.
 */

const mockGetUser = vi.fn();
const mockTenantsInsert = vi.fn();
const mockTenantsUpdate = vi.fn();
const mockBrandUpsert = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === "tenants") {
        return {
          insert: (...args: unknown[]) => ({
            select: () => ({ single: () => mockTenantsInsert(...args) }),
          }),
          update: (...args: unknown[]) => ({ eq: () => mockTenantsUpdate(...args) }),
        };
      }
      if (table === "brand_configs") {
        return { upsert: (...args: unknown[]) => mockBrandUpsert(...args) };
      }
      throw new Error(`unexpected table in test: ${table}`);
    },
  }),
}));

vi.mock("sharp", () => ({ default: vi.fn() }));

async function loadSaveDraft() {
  const mod = await import("./actions");
  return mod.saveDraft;
}

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const baseFields = {
  tenantId: "",
  name: "My Retreat",
  timezone: "UTC",
  palette: "forest-sage",
  atmosphere: "calm-organic",
};

describe("saveDraft - Task 011 slot-limit handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("surfaces a distinct, legible state when the database rejects creation for lack of an available slot", async () => {
    mockTenantsInsert.mockResolvedValue({
      data: null,
      error: { message: "No available Space slots", hint: "SLOT_LIMIT_REACHED" },
    });

    const saveDraft = await loadSaveDraft();
    const result = await saveDraft({ error: null, tenantId: null }, formData(baseFields));

    expect(result.slotLimitReached).toBe(true);
    expect(result.tenantId).toBeNull();
    expect(result.error).toMatch(/available.*slot/i);
    // the brand upsert must never have been attempted once creation itself failed
    expect(mockBrandUpsert).not.toHaveBeenCalled();
  });

  it("does not set slotLimitReached for an ordinary (non-capacity) creation failure", async () => {
    mockTenantsInsert.mockResolvedValue({
      data: null,
      error: { message: "some other database error", hint: null },
    });

    const saveDraft = await loadSaveDraft();
    const result = await saveDraft({ error: null, tenantId: null }, formData(baseFields));

    expect(result.slotLimitReached).toBeUndefined();
    expect(result.error).toBe("some other database error");
  });

  it("never inserts a tenant row when brand validation fails on first save (no stranded slot)", async () => {
    const saveDraft = await loadSaveDraft();
    // an invalid palette fails brandConfigSchema.safeParse before any DB write
    const result = await saveDraft(
      { error: null, tenantId: null },
      formData({ ...baseFields, palette: "not-a-real-palette-value-xyz" })
    );

    expect(result.error).toBeTruthy();
    expect(mockTenantsInsert).not.toHaveBeenCalled();
    expect(mockBrandUpsert).not.toHaveBeenCalled();
  });

  it("creates the tenant and upserts brand normally when nothing is at capacity", async () => {
    mockTenantsInsert.mockResolvedValue({ data: { id: "new-tenant-1" }, error: null });
    mockBrandUpsert.mockResolvedValue({ error: null });

    const saveDraft = await loadSaveDraft();
    const result = await saveDraft({ error: null, tenantId: null }, formData(baseFields));

    expect(result.error).toBeNull();
    expect(result.tenantId).toBe("new-tenant-1");
    expect(mockBrandUpsert).toHaveBeenCalledTimes(1);
  });

  it("existing-tenant saves never call the creation path at all", async () => {
    mockTenantsUpdate.mockResolvedValue({ error: null });
    mockBrandUpsert.mockResolvedValue({ error: null });

    const saveDraft = await loadSaveDraft();
    const result = await saveDraft(
      { error: null, tenantId: "existing-tenant-1" },
      formData({ ...baseFields, tenantId: "existing-tenant-1" })
    );

    expect(result.tenantId).toBe("existing-tenant-1");
    expect(mockTenantsInsert).not.toHaveBeenCalled();
    expect(mockTenantsUpdate).toHaveBeenCalledTimes(1);
  });
});
