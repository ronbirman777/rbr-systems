import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression coverage for the Publish button "stuck on Publishing…" bug
 * report (Release Blockers phase). The button itself uses
 * useActionState(publishSpace, ...), whose `pending` flag is a React
 * guarantee: it clears the instant the action's returned promise settles,
 * on EITHER resolve or reject - there is nothing to test about React
 * itself. What actually determines whether the user sees "it worked" vs.
 * "it's stuck" is whether publishSpace() ALWAYS settles by *resolving*
 * with a well-formed PublishState, on every single code path, and never
 * lets an exception escape uncaught (an uncaught throw still clears
 * `pending`, but trips an Error Boundary instead of the graceful inline
 * error the spec requires - "pending clears, visible error appears,
 * button becomes usable again").
 *
 * copyDraftToPublished's own failure modes are already fully covered in
 * publish.test.ts; here it's mocked so this file can focus purely on
 * publishSpace()'s own orchestration and control flow.
 */

const mockGetUser = vi.fn();
const mockModuleItemsSelect = vi.fn();
const mockBrandConfigSelect = vi.fn();
const mockRpc = vi.fn();
const mockCopyDraftToPublished = vi.fn();
const mockGetSpaceEntitlement = vi.fn();
const mockDeriveCommercialAvailability = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === "module_items") {
        return { select: () => ({ eq: () => ({ in: mockModuleItemsSelect }) }) };
      }
      if (table === "brand_configs") {
        return { select: () => ({ eq: () => ({ maybeSingle: mockBrandConfigSelect }) }) };
      }
      throw new Error(`unexpected table in test: ${table}`);
    },
    rpc: mockRpc,
  }),
}));

vi.mock("@/lib/entitlements/getSpaceEntitlement", () => ({
  getSpaceEntitlement: (...args: unknown[]) => mockGetSpaceEntitlement(...args),
}));

vi.mock("@/lib/entitlements/availability", () => ({
  deriveCommercialAvailability: (...args: unknown[]) => mockDeriveCommercialAvailability(...args),
}));

vi.mock("@/lib/media/publish", () => ({
  copyDraftToPublished: (...args: unknown[]) => mockCopyDraftToPublished(...args),
}));

// sharp is only touched by optimizeUploadedImage (unrelated to publishSpace),
// but actions.ts imports it at module scope - stub it so loading the module
// under test never depends on the native binary being installed for tests.
vi.mock("sharp", () => ({ default: vi.fn() }));

async function loadPublishSpace() {
  const mod = await import("./actions");
  return mod.publishSpace;
}

function formData(tenantId: string | null) {
  const fd = new FormData();
  if (tenantId !== null) fd.set("tenantId", tenantId);
  return fd;
}

const PREV_STATE = { error: null, publishedAt: null };

describe("publishSpace - every path resolves a well-formed PublishState, never throws", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockGetSpaceEntitlement.mockResolvedValue(null);
    mockDeriveCommercialAvailability.mockReturnValue({ canPublish: true });
    mockModuleItemsSelect.mockResolvedValue({ data: [] });
    mockBrandConfigSelect.mockResolvedValue({ data: null });
    mockCopyDraftToPublished.mockResolvedValue(undefined);
    mockRpc.mockResolvedValue({ data: "2026-09-13T12:00:00.000Z", error: null });
  });

  it("A. success: returns { error: null, publishedAt } after copying media and calling the RPC", async () => {
    const publishSpace = await loadPublishSpace();
    const result = await publishSpace(PREV_STATE, formData("tenant-1"));
    expect(result).toEqual({ error: null, publishedAt: "2026-09-13T12:00:00.000Z" });
    expect(mockRpc).toHaveBeenCalledWith("publish_space", { p_tenant_id: "tenant-1" });
  });

  it("B. repeated publish: calling it again after a success still resolves cleanly", async () => {
    const publishSpace = await loadPublishSpace();
    const first = await publishSpace(PREV_STATE, formData("tenant-1"));
    const second = await publishSpace(first, formData("tenant-1"));
    expect(second.error).toBeNull();
    expect(second.publishedAt).toBe("2026-09-13T12:00:00.000Z");
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it("not logged in: resolves with an error, never throws, and never touches media or the RPC", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const publishSpace = await loadPublishSpace();
    const result = await publishSpace(PREV_STATE, formData("tenant-1"));
    expect(result).toEqual({ error: "You need to be logged in.", publishedAt: null });
    expect(mockCopyDraftToPublished).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("missing tenantId: resolves with an error instead of throwing", async () => {
    const publishSpace = await loadPublishSpace();
    const result = await publishSpace(PREV_STATE, formData(null));
    expect(result).toEqual({ error: "Missing space.", publishedAt: null });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("commercial access unavailable: resolves with an error and never calls the RPC", async () => {
    mockDeriveCommercialAvailability.mockReturnValue({ canPublish: false });
    const publishSpace = await loadPublishSpace();
    const result = await publishSpace(PREV_STATE, formData("tenant-1"));
    expect(result.error).toMatch(/commercial access/i);
    expect(result.publishedAt).toBeNull();
    expect(mockCopyDraftToPublished).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("C. media copy rejects: resolves with an error (never an uncaught rejection) and never calls the RPC", async () => {
    mockCopyDraftToPublished.mockRejectedValue(new Error("Could not read the draft image"));
    const publishSpace = await loadPublishSpace();
    const result = await publishSpace(PREV_STATE, formData("tenant-1"));
    expect(result.error).toContain("Could not publish your photos");
    expect(result.publishedAt).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("D. RPC fails: resolves with the RPC's error, not a throw", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "permission denied for function publish_space" } });
    const publishSpace = await loadPublishSpace();
    const result = await publishSpace(PREV_STATE, formData("tenant-1"));
    expect(result).toEqual({ error: "permission denied for function publish_space", publishedAt: null });
  });

  it("E. failure then retry: a failed publish followed by a successful one both resolve correctly (button must stay usable)", async () => {
    const publishSpace = await loadPublishSpace();

    mockCopyDraftToPublished.mockRejectedValueOnce(new Error("network error"));
    const failed = await publishSpace(PREV_STATE, formData("tenant-1"));
    expect(failed.error).not.toBeNull();
    expect(failed.publishedAt).toBeNull();

    const retried = await publishSpace(failed, formData("tenant-1"));
    expect(retried.error).toBeNull();
    expect(retried.publishedAt).toBe("2026-09-13T12:00:00.000Z");
  });
});
