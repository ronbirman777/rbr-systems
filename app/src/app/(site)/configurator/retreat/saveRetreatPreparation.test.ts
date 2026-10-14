import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing/audioQuota.server", () => ({ loadAudioQuotaPolicy: async () => ({ mode: "unenforced", reason: "legacy" }) }));
vi.mock("@/lib/billing/audioFinalize.server", () => ({ measureStoredAudio: async () => null, writeEnforcedAudioFile: async () => ({ ok: false, reason: "failed" }), loadAudioFingerprints: async () => new Map() }));
vi.mock("sharp", () => ({ default: vi.fn() }));

/**
 * TASK 033 item 4 (Part 1): "Preparing for arrival" saved from Arrival Info
 * merges into the stored retreatProfile; a Home save with keepPreparation
 * keeps the stored lists. Nothing else in the row moves.
 */
const mockGetUser = vi.fn();
const mockStoredRow = vi.fn();
const mockUpsert = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === "tenants") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { product_type: "retreat" } }) }) }) };
      if (table === "module_settings") return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mockStoredRow }) }) }), upsert: mockUpsert };
      throw new Error(`unexpected table in test: ${table}`);
    },
  }),
}));

const STORED = { tagline: "By the sea", shortDescription: "Short", longDescription: null, welcome: "Hi", whatToBring: ["Old mat"], whatToExpect: ["Old"], startDate: "2026-10-13", endDate: "2026-10-17" };
const prep = (bring: unknown, expect: unknown) => {
  const fd = new FormData();
  fd.set("tenantId", "tenant-1");
  fd.set("whatToBring", JSON.stringify(bring));
  fd.set("whatToExpect", JSON.stringify(expect));
  return fd;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mockStoredRow.mockResolvedValue({ data: { data: STORED } });
  mockUpsert.mockResolvedValue({ error: null });
});

describe("saveRetreatPreparation", () => {
  it("writes only the two lists, keeping every other profile field and the dates", async () => {
    const { saveRetreatPreparation } = await import("./actions");
    const r = await saveRetreatPreparation({ error: null }, prep(["Mat", "Water"], ["Silence"]));
    expect(r.error).toBeNull();
    const row = mockUpsert.mock.calls[0][0];
    expect(row.module_key).toBe("retreatProfile");
    expect(row.data).toMatchObject({ ...STORED, whatToBring: ["Mat", "Water"], whatToExpect: ["Silence"] });
  });

  it("rejects malformed or oversized lists without writing", async () => {
    const { saveRetreatPreparation } = await import("./actions");
    for (const bad of [prep("nope", []), prep([""], []), prep(Array(101).fill("x"), [])]) {
      expect((await saveRetreatPreparation({ error: null }, bad)).error).toBeTruthy();
    }
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("fails closed on an unreadable stored profile instead of rebuilding it from defaults", async () => {
    mockStoredRow.mockResolvedValue({ data: { data: { whatToBring: "not a list" } } });
    const { saveRetreatPreparation } = await import("./actions");
    expect((await saveRetreatPreparation({ error: null }, prep(["Mat"], []))).error).toBeTruthy();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("works for a Space with no profile row yet", async () => {
    mockStoredRow.mockResolvedValue({ data: null });
    const { saveRetreatPreparation } = await import("./actions");
    expect((await saveRetreatPreparation({ error: null }, prep(["Mat"], []))).error).toBeNull();
    expect(mockUpsert.mock.calls[0][0].data).toMatchObject({ whatToBring: ["Mat"], whatToExpect: [] });
  });
});

describe("saveRetreatProfile with keepPreparation", () => {
  it("keeps the stored lists (a stale Home tab cannot overwrite what Arrival saved)", async () => {
    const { saveRetreatProfile } = await import("./actions");
    const fd = new FormData();
    fd.set("tenantId", "tenant-1");
    fd.set("keepPreparation", "1");
    fd.set("data", JSON.stringify({ ...STORED, tagline: "New", whatToBring: ["STALE"], whatToExpect: [] }));
    expect((await saveRetreatProfile({ error: null }, fd)).error).toBeNull();
    expect(mockUpsert.mock.calls[0][0].data).toMatchObject({ tagline: "New", whatToBring: ["Old mat"], whatToExpect: ["Old"] });
  });

  it("without the flag behaves exactly as before (writes what it is sent)", async () => {
    const { saveRetreatProfile } = await import("./actions");
    const fd = new FormData();
    fd.set("tenantId", "tenant-1");
    fd.set("data", JSON.stringify({ ...STORED, whatToBring: ["Sent"] }));
    await saveRetreatProfile({ error: null }, fd);
    expect(mockUpsert.mock.calls[0][0].data.whatToBring).toEqual(["Sent"]);
  });
});
