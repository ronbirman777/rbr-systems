import { describe, expect, it, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing/audioQuota.server", () => ({ loadAudioQuotaPolicy: async () => ({ mode: "unenforced", reason: "legacy" }) }));
vi.mock("@/lib/billing/audioFinalize.server", () => ({ measureStoredAudio: async () => null, writeEnforcedAudioFile: async () => ({ ok: false, reason: "failed" }), loadAudioFingerprints: async () => new Map() }));
vi.mock("sharp", () => ({ default: vi.fn() }));

/**
 * TASK 033 addendum B: saveSchedule persists new sessions only on Save
 * and deletes ONLY the ids the editor removed - never "every row missing
 * from the submitted list".
 */

const mockGetUser = vi.fn();
const mockUpsert = vi.fn();
const mockDeleteIn = vi.fn();
const mockDeleteEq = vi.fn();
const mockSelect = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table !== "schedule_items") throw new Error(`unexpected table in test: ${table}`);
      return {
        select: mockSelect,
        upsert: mockUpsert,
        delete: () => ({
          eq: (col: string, val: string) => {
            mockDeleteEq(col, val);
            return { in: mockDeleteIn };
          },
        }),
      };
    },
  }),
}));

const item = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  date: "2026-10-14",
  startTime: "09:00",
  endTime: "10:00",
  title: "Yoga",
  facilitator: null,
  location: null,
  description: null,
  category: null,
  whatToBring: [],
  whatToExpect: [],
  ...over,
});

function fd(items: unknown[], removedIds?: unknown) {
  const f = new FormData();
  f.set("tenantId", "tenant-1");
  f.set("items", JSON.stringify(items));
  if (removedIds !== undefined) f.set("removedIds", typeof removedIds === "string" ? removedIds : JSON.stringify(removedIds));
  return f;
}

async function save(f: FormData) {
  const { saveSchedule } = await import("./actions");
  return saveSchedule({ error: null }, f);
}

describe("saveSchedule - explicit deletes, persistence only on Save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockUpsert.mockResolvedValue({ error: null });
    mockDeleteIn.mockResolvedValue({ error: null });
  });

  it("never reads the tenant's rows to infer deletions", async () => {
    await save(fd([item("a")]));
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockDeleteIn).not.toHaveBeenCalled();
  });

  it("a save that leaves out rows the editor never loaded deletes nothing", async () => {
    // e.g. another tab added "elsewhere-1" after this editor loaded
    const r = await save(fd([item("a")], []));
    expect(r.error).toBeNull();
    expect(mockDeleteIn).not.toHaveBeenCalled();
  });

  it("deletes exactly the removed ids, scoped to the tenant", async () => {
    await save(fd([item("a"), item("c")], ["b"]));
    expect(mockDeleteEq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(mockDeleteIn).toHaveBeenCalledWith("id", ["b"]);
  });

  it("never deletes an id that is also being saved", async () => {
    await save(fd([item("a")], ["a"]));
    expect(mockDeleteIn).not.toHaveBeenCalled();
  });

  it("saves a duplicate as its own row next to the original, and keeps twins", async () => {
    await save(fd([item("orig"), item("copy"), item("twin-a", { title: "Same" }), item("twin-b", { title: "Same" })], []));
    const rows = mockUpsert.mock.calls[0][0] as { id: string; title: string }[];
    expect(rows.map((r) => r.id)).toEqual(["orig", "copy", "twin-a", "twin-b"]);
    expect(mockUpsert.mock.calls[0][1]).toEqual({ onConflict: "id" });
  });

  it("fails closed on a malformed removedIds field: no write at all", async () => {
    const r = await save(fd([item("a")], "not json"));
    expect(r.error).toBeTruthy();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockDeleteIn).not.toHaveBeenCalled();
  });

  it("rejects an untitled session instead of storing a placeholder", async () => {
    const r = await save(fd([item("a", { title: "" })], []));
    expect(r.error).toBeTruthy();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("the stub actions that created placeholder rows are gone", async () => {
    const mod = (await import("./actions")) as Record<string, unknown>;
    expect(mod.createScheduleItemStub).toBeUndefined();
  });
});
