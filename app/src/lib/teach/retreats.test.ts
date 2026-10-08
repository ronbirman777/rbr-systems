import { describe, expect, it } from "vitest";
import { retreatMetadataSchema, parseTeachItems, teachItemFieldsSchema, TEACH_EXPLORE_MODULES, TEACH_MEDIA_ITEM_KEYS, TEACH_EDITABLE_ITEM_KEYS, blankTeachMetadata } from "./schemas";
import { canonicalFlowGuestUrl, formatRetreatPrice, parseFlowGuestUrl, retreatDateSummary, retreatPhase, validateRetreatMetadata } from "./retreats";
import { isValidIsoDate } from "@/lib/modules/fields";

const meta = (over: Record<string, unknown> = {}) => retreatMetadataSchema.parse(over);

describe("retreat metadata (tolerant on read)", () => {
  it("everything is optional: a retreat with no dates, no price, no links is valid", () => {
    const m = meta({});
    expect(m).toMatchObject({ enabled: true, location: null, startDate: null, endDate: null, durationLabel: null, price: null, currency: null, flowGuestUrl: null });
    expect(m.registration.method).toBeNull();
  });

  it("a bad value drops itself, never the whole retreat", () => {
    const m = meta({ startDate: "2027-02-31", endDate: "garbage", price: "lots", currency: "baht", location: "  Koh Phangan  " });
    expect(m.startDate).toBeNull();
    expect(m.endDate).toBeNull();
    expect(m.price).toBeNull();
    expect(m.currency).toBeNull();
    expect(m.location).toBe("Koh Phangan");
  });

  it("normalises currency to upper-case and keeps real dates exactly as stored (no zone arithmetic)", () => {
    const m = meta({ startDate: "2027-10-14", endDate: "2027-10-20", price: 700, currency: "thb" });
    expect(m).toMatchObject({ startDate: "2027-10-14", endDate: "2027-10-20", price: 700, currency: "THB" });
  });

  it("isValidIsoDate rejects shape-valid impossible days and accepts leap days", () => {
    expect(isValidIsoDate("2027-02-29")).toBe(false);
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("2027-13-01")).toBe(false);
    expect(isValidIsoDate("2027-4-1")).toBe(false);
  });

  it("is registered as an editable, media-carrying Explore module", () => {
    expect(TEACH_EXPLORE_MODULES).toContain("teachRetreats");
    expect(TEACH_MEDIA_ITEM_KEYS).toContain("teachRetreats");
    expect(TEACH_EDITABLE_ITEM_KEYS).toContain("teachRetreats");
    expect(blankTeachMetadata("teachRetreats", "2027-01-01").enabled).toBe(true);
  });

  it("the envelope requires a name, and an unusable row is dropped on read without blanking its siblings", () => {
    const schema = teachItemFieldsSchema("teachRetreats");
    expect(schema.safeParse({ title: "", metadata: {} }).success).toBe(false);
    expect(schema.safeParse({ title: "Autumn", metadata: {} }).success).toBe(true);
    const rows = parseTeachItems("teachRetreats", [{ id: "a", title: "Good", metadata: {} }, { id: "b", title: "", metadata: {} }, "junk", null]);
    expect(rows.map((r) => r.id)).toEqual(["a"]);
  });
});

describe("retreatPhase: future, ongoing, past, undated - all computed from plain calendar days", () => {
  const range = { startDate: "2027-10-14", endDate: "2027-10-20" };
  it.each([
    ["2027-10-13", "upcoming"],
    ["2027-10-14", "ongoing"],
    ["2027-10-17", "ongoing"],
    ["2027-10-20", "ongoing"],
    ["2027-10-21", "past"],
  ])("today %s -> %s", (today, phase) => expect(retreatPhase(range, today)).toBe(phase));

  it("a start date with no end is a single day", () => {
    expect(retreatPhase({ startDate: "2027-10-14", endDate: null }, "2027-10-14")).toBe("ongoing");
    expect(retreatPhase({ startDate: "2027-10-14", endDate: null }, "2027-10-15")).toBe("past");
  });
  it("no start date has no phase at all", () => {
    expect(retreatPhase({ startDate: null, endDate: null }, "2027-10-14")).toBe("undated");
  });
  it("a corrupt end before the start is treated as a single day, not as negative time", () => {
    expect(retreatPhase({ startDate: "2027-10-14", endDate: "2027-10-01" }, "2027-10-15")).toBe("past");
  });
});

describe("retreatDateSummary", () => {
  it("English: same month, cross month, cross year, single day, none", () => {
    expect(retreatDateSummary({ startDate: "2027-10-14", endDate: "2027-10-20" }, "en")).toBe("14–20 Oct 2027");
    expect(retreatDateSummary({ startDate: "2027-10-28", endDate: "2027-11-03" }, "en")).toBe("28 Oct – 3 Nov 2027");
    expect(retreatDateSummary({ startDate: "2027-12-30", endDate: "2028-01-02" }, "en")).toBe("30 Dec 2027 – 2 Jan 2028");
    expect(retreatDateSummary({ startDate: "2027-10-14", endDate: null }, "en")).toBe("14 Oct 2027");
    expect(retreatDateSummary({ startDate: "2027-10-14", endDate: "2027-10-14" }, "en")).toBe("14 Oct 2027");
    expect(retreatDateSummary({ startDate: null, endDate: null }, "en")).toBeNull();
  });
  it("other locales name the same calendar days (never shifted by the zone)", () => {
    for (const locale of ["de", "es", "fr", "he"] as const) {
      const out = retreatDateSummary({ startDate: "2027-10-14", endDate: "2027-10-20" }, locale)!;
      expect(out).toMatch(/14/);
      expect(out).toMatch(/20/);
      expect(out).toMatch(/2027/);
    }
  });
  it("is independent of the process timezone", () => {
    const before = process.env.TZ;
    for (const tz of ["Pacific/Kiritimati", "America/Los_Angeles", "Asia/Bangkok"]) {
      process.env.TZ = tz;
      expect(retreatDateSummary({ startDate: "2027-10-14", endDate: "2027-10-20" }, "en")).toBe("14–20 Oct 2027");
    }
    process.env.TZ = before;
  });
});

describe("formatRetreatPrice: informational text, never a checkout", () => {
  it("amount + currency code, hydration-safe", () => {
    expect(formatRetreatPrice({ price: 700, currency: "THB" }, "en")).toBe("700 THB");
    expect(formatRetreatPrice({ price: 1250.5, currency: "EUR" }, "en")).toBe("1,250.50 EUR");
    expect(formatRetreatPrice({ price: 0, currency: "EUR" }, "en")).toBe("0 EUR");
  });
  it("no price -> nothing; a price without a currency still shows the amount", () => {
    expect(formatRetreatPrice({ price: null, currency: null }, "en")).toBeNull();
    expect(formatRetreatPrice({ price: 900, currency: null }, "en")).toBe("900");
  });
  it("uses the locale's digits and grouping", () => {
    expect(formatRetreatPrice({ price: 1250, currency: "EUR" }, "de")).toBe("1.250 EUR");
  });
});

describe("validateRetreatMetadata: the strict rules enforced on save", () => {
  it("accepts a fully empty retreat", () => expect(validateRetreatMetadata(meta({}))).toBeNull());
  it("end without start", () => expect(validateRetreatMetadata(meta({ endDate: "2027-10-20" }))).toBe("startRequiredForEnd"));
  it("end before start", () => expect(validateRetreatMetadata(meta({ startDate: "2027-10-20", endDate: "2027-10-14" }))).toBe("endBeforeStart"));
  it("end equal to start is fine", () => expect(validateRetreatMetadata(meta({ startDate: "2027-10-20", endDate: "2027-10-20" }))).toBeNull());
  it("a price needs a currency", () => {
    expect(validateRetreatMetadata(meta({ price: 700 }))).toBe("priceNeedsCurrency");
    expect(validateRetreatMetadata(meta({ price: 700, currency: "THB" }))).toBeNull();
    expect(validateRetreatMetadata(meta({ price: 0 }))).toBe("priceNeedsCurrency");
  });
  it("a registration method with no value is incomplete; None is fine", () => {
    expect(validateRetreatMetadata(meta({ registration: { method: "website", value: null } }))).toBe("badRegistration");
    expect(validateRetreatMetadata(meta({ registration: { method: "website", value: "example.com/join" } }))).toBeNull();
    expect(validateRetreatMetadata(meta({ registration: { method: null } }))).toBeNull();
  });
});

describe("parseFlowGuestUrl: only InnerDweS Guest App addresses, identity only", () => {
  it("reads /s/<slug>, /g/<uuid> and <slug>.innerdwes.com", () => {
    expect(parseFlowGuestUrl("https://innerdwes.com/s/return-to-balance")).toEqual({ kind: "slug", slug: "return-to-balance" });
    expect(parseFlowGuestUrl("innerdwes.com/s/Return-To-Balance/")).toEqual({ kind: "slug", slug: "return-to-balance" });
    expect(parseFlowGuestUrl("https://app.innerdwes.com/s/example")).toEqual({ kind: "slug", slug: "example" });
    expect(parseFlowGuestUrl("https://98701eb1-5cb9-4108-9618-f76a60d93178".replace("https://", "innerdwes.com/g/"))).toEqual({ kind: "tenant", tenantId: "98701eb1-5cb9-4108-9618-f76a60d93178" });
    expect(parseFlowGuestUrl("https://example.innerdwes.com")).toEqual({ kind: "slug", slug: "example" });
  });
  it("rejects foreign hosts, look-alikes, other paths, reserved or malformed slugs, and non-http schemes", () => {
    for (const bad of [
      "https://evil.com/s/example",
      "https://innerdwes.com.evil.com/s/example",
      "https://evil-innerdwes.com/s/example",
      "javascript:alert(1)",
      "ftp://innerdwes.com/s/example",
      "https://innerdwes.com/s/a",
      "https://innerdwes.com/s/-bad-",
      "https://innerdwes.com/s/admin",
      "https://innerdwes.com/s/example/extra",
      "https://innerdwes.com/configurator/retreat/98701eb1-5cb9-4108-9618-f76a60d93178",
      "https://innerdwes.com/g/not-a-uuid",
      "https://www.innerdwes.com",
      "",
      "   ",
      null,
      undefined,
    ]) {
      expect(parseFlowGuestUrl(bad as string | null | undefined), String(bad)).toBeNull();
    }
  });
  it("the stored address is always OUR canonical one", () => {
    const url = canonicalFlowGuestUrl({ tenantId: "98701eb1-5cb9-4108-9618-f76a60d93178", slug: "example" });
    expect(url.endsWith("/s/example")).toBe(true);
    expect(canonicalFlowGuestUrl({ tenantId: "98701eb1-5cb9-4108-9618-f76a60d93178", slug: null }).endsWith("/g/98701eb1-5cb9-4108-9618-f76a60d93178")).toBe(true);
  });
});
