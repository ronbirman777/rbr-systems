import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Server-side guards of the Time to Teach Studio actions: product-type
 * guard, zod validation, media-reference ownership, and the item upsert
 * shape. Mocking style mirrors configurator/retreat/saveCustomPages.test.ts.
 */

const TENANT = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";
const ITEM = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const mockGetUser = vi.fn();
const mockTenantProductType = vi.fn();
const mockExisting = vi.fn();
const mockUpsert = vi.fn();
const mockSettingsUpsert = vi.fn();
const mockDelete = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("sharp", () => ({ default: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/entitlements/getSpaceEntitlement", () => ({ getSpaceEntitlement: async () => null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    storage: { from: () => ({ list: async () => ({ data: [] }), remove: async () => ({ error: null }) }) },
    from: (table: string) => {
      if (table === "tenants") {
        return { select: () => ({ eq: () => ({ maybeSingle: mockTenantProductType }) }) };
      }
      if (table === "module_items") {
        return {
          select: () => ({ eq: () => ({ eq: mockExisting }) }),
          upsert: mockUpsert,
          delete: () => ({ eq: () => ({ in: mockDelete }) }),
        };
      }
      if (table === "module_settings") return { upsert: mockSettingsUpsert };
      throw new Error(`unexpected table in test: ${table}`);
    },
  }),
}));

async function actions() {
  return import("./actions");
}

function klass(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM,
    title: "Morning Slow Flow",
    subtitle: "Vinyasa",
    description: null,
    externalLink: null,
    metadata: { startDate: "2025-10-14", startTime: "07:30", registration: { method: "whatsapp", value: "+972500000000" } },
    ...overrides,
  };
}

describe("Teach Studio server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockTenantProductType.mockResolvedValue({ data: { product_type: "teach" } });
    mockExisting.mockResolvedValue({ data: [] });
    mockUpsert.mockResolvedValue({ error: null });
    mockSettingsUpsert.mockResolvedValue({ error: null });
    mockDelete.mockResolvedValue({ error: null });
  });

  it("requires a signed-in user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { saveTeachItems } = await actions();
    expect((await saveTeachItems(TENANT, "teachClasses", [klass()])).error).toMatch(/logged in/);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("refuses to write Teach content into a non-Teach (e.g. retreat) Space", async () => {
    mockTenantProductType.mockResolvedValue({ data: { product_type: "retreat" } });
    const { saveTeachItems, saveTeachSettings } = await actions();
    expect((await saveTeachItems(TENANT, "teachClasses", [klass()])).error).toBe("Space not found.");
    expect((await saveTeachSettings(TENANT, "teachProfile", {})).error).toBe("Space not found.");
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockSettingsUpsert).not.toHaveBeenCalled();
  });

  it("rejects unknown module keys and malformed ids", async () => {
    const { saveTeachItems } = await actions();
    expect((await saveTeachItems(TENANT, "facilitators" as never, [])).error).toBe("Unknown section.");
    expect((await saveTeachItems(TENANT, "teachClasses", [klass({ id: "not-a-uuid" })])).error).toBe("Could not read the list.");
  });

  it("validates items with zod before writing (missing title)", async () => {
    const { saveTeachItems } = await actions();
    expect((await saveTeachItems(TENANT, "teachClasses", [klass({ title: "  " })])).error).toMatch(/title/);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("writes a clean upsert (no image_ref) with sort order, and keeps empty optional titles empty", async () => {
    const { saveTeachItems } = await actions();
    const res = await saveTeachItems(TENANT, "teachGallery", [{ id: ITEM, title: "", metadata: {} }]);
    expect(res.error).toBeNull();
    const rows = mockUpsert.mock.calls[0][0];
    expect(rows[0]).toMatchObject({ id: ITEM, tenant_id: TENANT, module_key: "teachGallery", title: "", sort_order: 0 });
    expect(rows[0]).not.toHaveProperty("image_ref");
  });

  it("rejects an audio reference outside this item's own folder", async () => {
    const { saveTeachItems } = await actions();
    const foreign = { id: ITEM, title: "Nidra", metadata: { audioRef: `${OTHER}/teachAudioFile/${ITEM}/draft.mp3` } };
    expect((await saveTeachItems(TENANT, "teachAudio", [foreign])).error).toMatch(/audio/i);
    const otherItem = { id: ITEM, title: "Nidra", metadata: { audioRef: `${TENANT}/teachAudioFile/${OTHER}/draft.mp3` } };
    expect((await saveTeachItems(TENANT, "teachAudio", [otherItem])).error).toMatch(/audio/i);
    const ok = { id: ITEM, title: "Nidra", metadata: { audioRef: `${TENANT}/teachAudioFile/${ITEM}/draft.mp3` } };
    expect((await saveTeachItems(TENANT, "teachAudio", [ok])).error).toBeNull();
  });

  it("rejects settings that point at another tenant's media", async () => {
    const { saveTeachSettings } = await actions();
    const res = await saveTeachSettings(TENANT, "teachAbout", { profile: { imageRef: `${OTHER}/teachAbout/profile/draft.webp` } });
    expect(res.error).toMatch(/image reference/);
    expect(mockSettingsUpsert).not.toHaveBeenCalled();
    const ok = await saveTeachSettings(TENANT, "teachAbout", { profile: { imageRef: `${TENANT}/teachAbout/profile/draft.webp`, imagePosition: { x: 20, y: 30 } } });
    expect(ok.error).toBeNull();
    expect(mockSettingsUpsert.mock.calls[0][0].data.profile.imagePosition).toEqual({ x: 20, y: 30 });
  });

  it("enforces the shared Custom Pages limit server-side", async () => {
    const { saveTeachItems } = await actions();
    const pages = Array.from({ length: 4 }, (_, i) => ({ id: `aaaaaaaa-bbbb-4ccc-8ddd-00000000000${i}`, title: `P${i}`, metadata: {} }));
    expect((await saveTeachItems(TENANT, "customPages", pages)).error).toMatch(/up to 3/);
  });

  it("derives canonical class times on save and never trusts client instants", async () => {
    mockTenantProductType.mockResolvedValue({ data: { product_type: "teach", timezone: "Asia/Jerusalem" } });
    const { saveTeachItems } = await actions();
    const forged = klass({ metadata: { ...klass().metadata, endTime: "08:45", startsAt: "2000-01-01T00:00:00Z", timeModelVersion: 1 } });
    expect(await saveTeachItems(TENANT, "teachClasses", [forged])).toEqual({ error: null });
    const meta = mockUpsert.mock.calls[0][0][0].metadata;
    expect(meta).toMatchObject({ timezone: "Asia/Jerusalem", startsAt: "2025-10-14T04:30:00Z", endsAt: "2025-10-14T05:45:00Z", startOffset: "+03:00", timeModelVersion: 1 });
  });

  it("rejects a class at a time that doesn't exist (DST gap) and returns overlap warnings", async () => {
    mockTenantProductType.mockResolvedValue({ data: { product_type: "teach", timezone: "Asia/Jerusalem" } });
    const { saveTeachItems } = await actions();
    const gap = klass({ metadata: { ...klass().metadata, startDate: "2025-03-09", startTime: "02:30", timezone: "America/New_York" } });
    expect((await saveTeachItems(TENANT, "teachClasses", [gap])).error).toMatch(/doesn’t exist/);
    expect(mockUpsert).not.toHaveBeenCalled();
    const overlap = klass({ metadata: { ...klass().metadata, startDate: "2025-11-02", startTime: "01:30", endTime: null, timezone: "America/New_York" } });
    const res = await saveTeachItems(TENANT, "teachClasses", [overlap]);
    expect(res.error).toBeNull();
    expect(res.warnings?.[0]).toMatch(/happens twice/);
    expect(mockUpsert.mock.calls[0][0][0].metadata).toMatchObject({ startsAt: "2025-11-02T05:30:00Z", startAmbiguous: true });
  });

  it("stores a recurring class as ONE series row (rule + exceptions), never its occurrences", async () => {
    mockTenantProductType.mockResolvedValue({ data: { product_type: "teach", timezone: "Asia/Jerusalem" } });
    const { saveTeachItems } = await actions();
    const series = klass({
      metadata: {
        ...klass().metadata,
        startDate: "2026-10-04",
        startTime: "08:00",
        endTime: "09:15",
        recurrence: { freq: "weekly", byWeekday: [0, 3], end: { type: "never" } },
        exceptions: { "2026-10-11": { cancelled: true } },
        occurrence: { seriesId: "forged", originalDate: "2026-10-04" },
      },
    });
    expect(await saveTeachItems(TENANT, "teachClasses", [series])).toEqual({ error: null });
    const rows = mockUpsert.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({
      recurrence: { freq: "weekly", interval: 1, byWeekday: [0, 3], end: { type: "never" } },
      exceptions: { "2026-10-11": { cancelled: true } },
      occurrence: null,
      startsAt: "2026-10-04T05:00:00Z",
    });
  });

  it("rejects a repeat that ends before it starts, and a moved occurrence inside a DST gap", async () => {
    mockTenantProductType.mockResolvedValue({ data: { product_type: "teach", timezone: "America/New_York" } });
    const { saveTeachItems } = await actions();
    const bad = klass({ metadata: { ...klass().metadata, timezone: "America/New_York", recurrence: { freq: "daily", end: { type: "until", until: "2025-01-01" } } } });
    expect((await saveTeachItems(TENANT, "teachClasses", [bad])).error).toMatch(/before the first class/);
    const gap = klass({ metadata: { ...klass().metadata, timezone: "America/New_York", recurrence: { freq: "weekly" }, exceptions: { "2027-03-14": { startTime: "02:30" } } } });
    expect((await saveTeachItems(TENANT, "teachClasses", [gap])).error).toMatch(/doesn’t exist/);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("an unrelated save never normalizes damaged recurrence data: it is written back verbatim", async () => {
    mockTenantProductType.mockResolvedValue({ data: { product_type: "teach", timezone: "Asia/Jerusalem" } });
    const { saveTeachItems } = await actions();
    const rawRule = { freq: "hourly", interval: 0 };
    const rawExceptions = { "2026-10-11": { cancelled: "yes" } };
    // What the Studio sends back after loading the damaged row and editing only the title:
    const loaded = klass({
      title: "Renamed",
      metadata: { ...klass().metadata, recurrence: { status: "invalid", raw: rawRule }, exceptions: { status: "invalid", raw: rawExceptions } },
    });
    expect((await saveTeachItems(TENANT, "teachClasses", [loaded])).error).toBeNull();
    const saved = mockUpsert.mock.calls[0][0][0];
    expect(saved.title).toBe("Renamed");
    expect(saved.metadata.recurrence).toEqual(rawRule);
    expect(saved.metadata.exceptions).toEqual(rawExceptions);
    // ...and the same raw data sent directly (as stored) is also kept, not turned into a one-off.
    mockUpsert.mockClear();
    const direct = klass({ metadata: { ...klass().metadata, recurrence: rawRule } });
    expect((await saveTeachItems(TENANT, "teachClasses", [direct])).error).toBeNull();
    expect(mockUpsert.mock.calls[0][0][0].metadata.recurrence).toEqual(rawRule);
  });

  it("a class with no recurrence field still saves as a plain one-off", async () => {
    mockTenantProductType.mockResolvedValue({ data: { product_type: "teach", timezone: "Asia/Jerusalem" } });
    const { saveTeachItems } = await actions();
    expect((await saveTeachItems(TENANT, "teachClasses", [klass()])).error).toBeNull();
    const m = mockUpsert.mock.calls[0][0][0].metadata;
    expect([m.recurrence, m.exceptions, m.occurrence]).toEqual([null, {}, null]);
  });

  it("deletes rows that are no longer in the submitted list", async () => {
    mockExisting.mockResolvedValue({ data: [{ id: ITEM }, { id: OTHER }] });
    const { saveTeachItems } = await actions();
    await saveTeachItems(TENANT, "teachClasses", [klass()]);
    expect(mockDelete).toHaveBeenCalledWith("id", [OTHER]);
  });
});
