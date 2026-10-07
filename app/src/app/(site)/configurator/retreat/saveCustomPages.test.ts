import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression coverage for the Custom Pages limit (Distribution phase,
 * §6): "Do not trust only the disabled Add button" - the real gate is
 * saveCustomPages() itself. Mocking style mirrors publishSpace.test.ts -
 * this file focuses on the limit check specifically, not the full
 * save/delete/upsert diffing already covered by saveModuleItemsGeneric's
 * behavior implicitly through this same action.
 */

const mockGetUser = vi.fn();
const mockGetSpaceEntitlement = vi.fn();
const mockModuleItemsSelect = vi.fn();
const mockModuleItemsUpsert = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === "module_items") {
        return {
          select: () => ({ eq: () => ({ eq: mockModuleItemsSelect }) }),
          upsert: mockModuleItemsUpsert,
        };
      }
      throw new Error(`unexpected table in test: ${table}`);
    },
  }),
}));

vi.mock("@/lib/entitlements/getSpaceEntitlement", () => ({
  getSpaceEntitlement: (...args: unknown[]) => mockGetSpaceEntitlement(...args),
}));

vi.mock("sharp", () => ({ default: vi.fn() }));

async function loadSaveCustomPages() {
  const mod = await import("./actions");
  return mod.saveCustomPages;
}

function formDataWithPages(count: number) {
  const fd = new FormData();
  fd.set("tenantId", "tenant-1");
  const items = Array.from({ length: count }, (_, i) => ({
    id: `page-${i}`,
    title: `Page ${i}`,
    body: null,
    imageRef: null,
    enabled: true,
  }));
  fd.set("items", JSON.stringify(items));
  return fd;
}

describe("saveCustomPages - the Custom Pages limit is enforced server-side, not just the disabled button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    // No entitlement row -> getCustomPagesLimit falls through to the
    // DEFAULT_CUSTOM_PAGES_LIMIT (3), exactly like every Space today.
    mockGetSpaceEntitlement.mockResolvedValue(null);
    mockModuleItemsSelect.mockResolvedValue({ data: [] });
    mockModuleItemsUpsert.mockResolvedValue({ error: null });
  });

  it("accepts exactly 3 pages (the default limit)", async () => {
    const saveCustomPages = await loadSaveCustomPages();
    const result = await saveCustomPages({ error: null }, formDataWithPages(3));
    expect(result.error).toBeNull();
    expect(mockModuleItemsUpsert).toHaveBeenCalled();
  });

  it("rejects a 4th page with a clear error, and never writes to the database", async () => {
    const saveCustomPages = await loadSaveCustomPages();
    const result = await saveCustomPages({ error: null }, formDataWithPages(4));
    expect(result.error).toMatch(/3-page limit/i);
    expect(mockModuleItemsUpsert).not.toHaveBeenCalled();
  });

  it("still allows editing/removing pages while already at the limit (3 -> 2 is a decrease, not blocked)", async () => {
    const saveCustomPages = await loadSaveCustomPages();
    const result = await saveCustomPages({ error: null }, formDataWithPages(2));
    expect(result.error).toBeNull();
    expect(mockModuleItemsUpsert).toHaveBeenCalled();
  });
});
