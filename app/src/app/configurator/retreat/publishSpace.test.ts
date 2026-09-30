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
const mockModuleConfigsSelect = vi.fn();
const mockRpc = vi.fn();
const mockCopyDraftToPublished = vi.fn();
const mockSnapshotSelect = vi.fn();
const mockCleanup = vi.fn();
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
      // Explore module hero/cover images (added alongside Task 015) -
      // publishSpace() now also selects module_configs for its
      // module-level cover images, the same shape as module_items above.
      if (table === "module_configs") {
        return { select: () => ({ eq: mockModuleConfigsSelect }) };
      }
      if (table === "published_spaces") {
        return { select: () => ({ eq: () => ({ maybeSingle: mockSnapshotSelect }) }) };
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

vi.mock("@/lib/media/publishedCleanup", () => ({
  cleanupStalePublishedMedia: (...args: unknown[]) => mockCleanup(...args),
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
    mockModuleConfigsSelect.mockResolvedValue({ data: [] });
    mockCopyDraftToPublished.mockResolvedValue(undefined);
    mockSnapshotSelect.mockResolvedValue({ data: { modules: {} }, error: null });
    mockCleanup.mockResolvedValue({ removed: [] });
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
    mockModuleItemsSelect.mockResolvedValue({ data: [{ image_ref: "tenant-1/meals/i/u/draft.webp" }] });
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
    mockModuleItemsSelect.mockResolvedValue({ data: [{ image_ref: "tenant-1/meals/i/u/draft.webp" }] });
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

const T = "tenant-1";
const OLD_PUB = `${T}/meals/i1/up-old/published.webp`;
const NEW_DRAFT = `${T}/meals/i1/up-new/draft.webp`;
const NEW_PUB = `${T}/meals/i1/up-new/published.webp`;

describe("publishSpace - TASK 023 ordering: copy -> commit -> cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSnapshotSelect.mockReset();
    mockCopyDraftToPublished.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockGetSpaceEntitlement.mockResolvedValue(null);
    mockDeriveCommercialAvailability.mockReturnValue({ canPublish: true });
    mockModuleItemsSelect.mockResolvedValue({ data: [{ image_ref: NEW_DRAFT }, { image_ref: null }] });
    mockBrandConfigSelect.mockResolvedValue({ data: null });
    mockModuleConfigsSelect.mockResolvedValue({ data: [] });
    mockCopyDraftToPublished.mockResolvedValue(NEW_PUB);
    mockRpc.mockResolvedValue({ data: "2026-09-13T12:00:00.000Z", error: null });
    mockCleanup.mockResolvedValue({ removed: [] });
  });

  function snapshots(previous: unknown, committed: unknown) {
    mockSnapshotSelect
      .mockResolvedValueOnce({ data: { modules: previous }, error: null })
      .mockResolvedValueOnce({ data: { modules: committed }, error: null });
  }

  it("copies only this tenant's draft refs, each once, and cleans up only AFTER the RPC commits", async () => {
    snapshots({ meals: [{ imageRef: OLD_PUB }] }, { meals: [{ imageRef: NEW_PUB }] });
    mockModuleItemsSelect.mockResolvedValue({
      data: [{ image_ref: NEW_DRAFT }, { image_ref: NEW_DRAFT }, { image_ref: "other-tenant/meals/x/u/draft.webp" }, { image_ref: `${T}/meals/z/u/published.webp` }],
    });
    const order: string[] = [];
    mockCopyDraftToPublished.mockImplementation(async () => (order.push("copy"), NEW_PUB));
    mockRpc.mockImplementation(async () => (order.push("rpc"), { data: "t", error: null }));
    mockCleanup.mockImplementation(async () => (order.push("cleanup"), { removed: [OLD_PUB] }));

    const publishSpace = await loadPublishSpace();
    const result = await publishSpace(PREV_STATE, formData(T));
    expect(result.error).toBeNull();
    expect(order).toEqual(["copy", "rpc", "cleanup"]);
    expect(mockCopyDraftToPublished).toHaveBeenCalledTimes(1);
    expect(mockCopyDraftToPublished.mock.calls[0][1]).toBe(NEW_DRAFT);
    const [, tenantArg, previousRefs, currentRefs] = mockCleanup.mock.calls[0];
    expect(tenantArg).toBe(T);
    expect([...(previousRefs as Set<string>)]).toEqual([OLD_PUB]);
    expect([...(currentRefs as Set<string>)]).toEqual([NEW_PUB]);
  });

  it("copy failure: the RPC and the cleanup never run (the live snapshot and its media are untouched)", async () => {
    snapshots({ meals: [{ imageRef: OLD_PUB }] }, {});
    mockCopyDraftToPublished.mockRejectedValue(new Error("boom"));
    const publishSpace = await loadPublishSpace();
    const result = await publishSpace(PREV_STATE, formData(T));
    expect(result.error).toContain("Could not publish your photos");
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockCleanup).not.toHaveBeenCalled();
  });

  it("RPC failure: no cleanup, so the previous snapshot's media is never removed", async () => {
    snapshots({ meals: [{ imageRef: OLD_PUB }] }, {});
    mockRpc.mockResolvedValue({ data: null, error: { message: "db down" } });
    const publishSpace = await loadPublishSpace();
    const result = await publishSpace(PREV_STATE, formData(T));
    expect(result).toEqual({ error: "db down", publishedAt: null });
    expect(mockCleanup).not.toHaveBeenCalled();
  });

  it("cleanup failure after a committed publish is logged, never surfaced as a failed Publish", async () => {
    snapshots({ meals: [{ imageRef: OLD_PUB }] }, { meals: [{ imageRef: NEW_PUB }] });
    mockCleanup.mockRejectedValue(new Error("storage down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const publishSpace = await loadPublishSpace();
    const result = await publishSpace(PREV_STATE, formData(T));
    expect(result).toEqual({ error: null, publishedAt: "2026-09-13T12:00:00.000Z" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("committed snapshot unreadable: cleanup is skipped entirely (never guess what is safe to delete)", async () => {
    mockSnapshotSelect
      .mockResolvedValueOnce({ data: { modules: { meals: [{ imageRef: OLD_PUB }] } }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "read failed" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const publishSpace = await loadPublishSpace();
    const result = await publishSpace(PREV_STATE, formData(T));
    expect(result.error).toBeNull();
    expect(mockCleanup).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
