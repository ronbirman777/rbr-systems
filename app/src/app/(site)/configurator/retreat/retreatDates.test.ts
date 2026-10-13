import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing/audioQuota.server", () => ({ loadAudioQuotaPolicy: async () => ({ mode: "unenforced", reason: "legacy" }) }));
vi.mock("@/lib/billing/audioFinalize.server", () => ({ measureStoredAudio: async () => null, writeEnforcedAudioFile: async () => ({ ok: false, reason: "failed" }), loadAudioFingerprints: async () => new Map() }));
vi.mock("sharp", () => ({ default: vi.fn() }));

/**
 * TASK 033 P2: the retreat start/end dates - Studio validation, the
 * server action, and the Home save that must not wipe them.
 */

const mockGetUser = vi.fn();
const mockStoredRow = vi.fn();
const mockUpsert = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === "tenants") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { product_type: "retreat" } }) }) }) };
      }
      if (table === "module_settings") {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mockStoredRow }) }) }),
          upsert: mockUpsert,
        };
      }
      throw new Error(`unexpected table in test: ${table}`);
    },
  }),
}));

async function actions() {
  return import("./actions");
}

function datesForm(startDate: string, endDate: string, locale = "en") {
  const fd = new FormData();
  fd.set("tenantId", "tenant-1");
  fd.set("locale", locale);
  fd.set("startDate", startDate);
  fd.set("endDate", endDate);
  return fd;
}

const initial = { error: null, startDate: null, endDate: null };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mockStoredRow.mockResolvedValue({ data: null });
  mockUpsert.mockResolvedValue({ error: null });
});

describe("saveRetreatDates", () => {
  it("stores both dates in the retreatProfile row and keeps its other content untouched", async () => {
    mockStoredRow.mockResolvedValue({ data: { data: { tagline: "Come home", whatToBring: ["Mat"], futureKey: 1 } } });
    const { saveRetreatDates } = await actions();
    const result = await saveRetreatDates(initial, datesForm("2027-10-14", "2027-10-19"));
    expect(result).toEqual({ error: null, startDate: "2027-10-14", endDate: "2027-10-19" });
    const row = mockUpsert.mock.calls[0][0];
    expect(row.module_key).toBe("retreatProfile");
    expect(row.data).toEqual({ tagline: "Come home", whatToBring: ["Mat"], futureKey: 1, startDate: "2027-10-14", endDate: "2027-10-19" });
  });

  it("clearing removes the keys rather than storing nulls", async () => {
    mockStoredRow.mockResolvedValue({ data: { data: { tagline: "x", startDate: "2027-10-14", endDate: "2027-10-19" } } });
    const { saveRetreatDates } = await actions();
    const result = await saveRetreatDates(initial, datesForm("", ""));
    expect(result.error).toBeNull();
    expect(mockUpsert.mock.calls[0][0].data).toEqual({ tagline: "x" });
  });

  it("rejects an end before the start, in the Space language, without writing", async () => {
    const { saveRetreatDates } = await actions();
    const en = await saveRetreatDates(initial, datesForm("2027-10-14", "2027-10-13"));
    expect(en.error).toBe("The end date can’t be before the start date.");
    const de = await saveRetreatDates(initial, datesForm("2027-10-14", "2027-10-13", "de"));
    expect(de.error).toBe("Das Enddatum darf nicht vor dem Startdatum liegen.");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("rejects a range longer than 60 days and an impossible date", async () => {
    const { saveRetreatDates } = await actions();
    expect((await saveRetreatDates(initial, datesForm("2027-01-01", "2027-03-02"))).error).toBe("A retreat can span at most 60 days.");
    expect((await saveRetreatDates(initial, datesForm("2027-02-30", ""))).error).toBe("Enter a valid date.");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("requires a signed-in user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { saveRetreatDates } = await actions();
    expect((await saveRetreatDates(initial, datesForm("2027-10-14", ""))).error).toBeTruthy();
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe("saveRetreatProfile keeps the stored dates", () => {
  it("ignores dates sent by the Home form and preserves the stored pair", async () => {
    mockStoredRow.mockResolvedValue({ data: { data: { startDate: "2027-10-14", endDate: "2027-10-19" } } });
    const { saveRetreatProfile } = await actions();
    const fd = new FormData();
    fd.set("tenantId", "tenant-1");
    fd.set("data", JSON.stringify({ tagline: "New", startDate: "2020-01-01", endDate: null }));
    const result = await saveRetreatProfile({ error: null }, fd);
    expect(result.error).toBeNull();
    const data = mockUpsert.mock.calls[0][0].data;
    expect(data.tagline).toBe("New");
    expect(data.startDate).toBe("2027-10-14");
    expect(data.endDate).toBe("2027-10-19");
  });

  it("writes no date keys for a Space that never set any", async () => {
    const { saveRetreatProfile } = await actions();
    const fd = new FormData();
    fd.set("tenantId", "tenant-1");
    fd.set("data", JSON.stringify({ tagline: "New" }));
    await saveRetreatProfile({ error: null }, fd);
    const data = mockUpsert.mock.calls[0][0].data;
    expect("startDate" in data).toBe(false);
    expect("endDate" in data).toBe(false);
  });
});

describe("RetreatDatesPanel (Studio, server-rendered)", () => {
  async function render(startDate: string | null, endDate: string | null) {
    const { RetreatDatesPanel } = await import("./retreat-dates-panel");
    const { EMPTY_RETREAT_PROFILE } = await import("@/lib/modules/retreatProfile");
    return renderToStaticMarkup(
      h(RetreatDatesPanel, {
        tenantId: "t1",
        locale: "en",
        timezone: "Europe/Berlin",
        profile: { ...EMPTY_RETREAT_PROFILE, startDate, endDate },
        setProfile: () => {},
        onDirty: () => {},
        onSaved: () => {},
        registerSave: () => {},
      })
    );
  }

  it("labels both date fields and explains the timezone", async () => {
    const html = await render(null, null);
    expect(html.match(/type="date"/g)).toHaveLength(2);
    expect(html).toContain(">Start date<");
    expect(html).toContain(">End date<");
    expect(html).toContain("Europe/Berlin");
    expect(html).toContain("No dates set yet");
  });

  it("shows the validation message and blocks Save for an end before the start", async () => {
    const html = await render("2027-10-14", "2027-10-10");
    expect(html).toContain("The end date can’t be before the start date.");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save dates</);
  });

  it("constrains the pickers to each other", async () => {
    const html = await render("2027-10-14", "2027-10-19");
    expect(html).toContain('min="2027-10-14"');
    expect(html).toContain('max="2027-10-19"');
    expect(html).not.toContain("No dates set yet");
  });
});
