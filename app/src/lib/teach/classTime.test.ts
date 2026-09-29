import { describe, expect, it } from "vitest";
import { computeClassTimes, resolveLocalTime, withDerivedClassTimes, TIME_MODEL_VERSION } from "./classTime";
import { classMetadataSchema, parseTeachItem } from "./schemas";
import { classesOn, isClassPast, sortClasses } from "./schedule";

const meta = (m: Record<string, unknown>) => classMetadataSchema.parse(m);

describe("resolveLocalTime: ordinary times in five zones", () => {
  const cases: [string, string, string, string, string][] = [
    ["Asia/Jerusalem", "2025-10-14", "07:30", "2025-10-14T04:30:00Z", "+03:00"],
    ["Asia/Jerusalem", "2025-12-14", "07:30", "2025-12-14T05:30:00Z", "+02:00"],
    ["America/New_York", "2025-01-15", "09:00", "2025-01-15T14:00:00Z", "-05:00"],
    ["America/New_York", "2025-07-15", "09:00", "2025-07-15T13:00:00Z", "-04:00"],
    ["Europe/London", "2025-01-15", "18:00", "2025-01-15T18:00:00Z", "+00:00"],
    ["Europe/London", "2025-07-15", "18:00", "2025-07-15T17:00:00Z", "+01:00"],
    ["Australia/Sydney", "2025-01-15", "06:00", "2025-01-14T19:00:00Z", "+11:00"],
    ["Australia/Sydney", "2025-07-15", "06:00", "2025-07-14T20:00:00Z", "+10:00"],
    ["Asia/Kolkata", "2025-06-01", "18:00", "2025-06-01T12:30:00Z", "+05:30"],
  ];
  for (const [tz, d, t, instant, offset] of cases) {
    it(`${tz} ${d} ${t} -> ${instant}`, () => {
      expect(resolveLocalTime(d, t, tz)).toEqual({ ok: true, instant, offset, ambiguous: false, laterOffset: null });
    });
  }
});

describe("DST spring-forward gaps are rejected", () => {
  const gaps: [string, string, string][] = [
    ["America/New_York", "2025-03-09", "02:30"],
    ["Europe/London", "2025-03-30", "01:30"],
    ["Australia/Sydney", "2025-10-05", "02:30"],
    ["Asia/Jerusalem", "2025-03-28", "02:30"],
  ];
  for (const [tz, d, t] of gaps) {
    it(`${tz} ${d} ${t} does not exist`, () => {
      expect(resolveLocalTime(d, t, tz)).toEqual({ ok: false, reason: "nonexistent" });
      const r = computeClassTimes(meta({ startDate: d, startTime: t, timezone: tz }), "UTC");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.issues[0].message).toMatch(/doesn’t exist/);
    });
  }
});

describe("DST fall-back overlaps resolve to the earlier instant, persisted and warned", () => {
  const overlaps: [string, string, string, string, string, string][] = [
    ["America/New_York", "2025-11-02", "01:30", "2025-11-02T05:30:00Z", "-04:00", "-05:00"],
    ["Europe/London", "2025-10-26", "01:30", "2025-10-26T00:30:00Z", "+01:00", "+00:00"],
    ["Australia/Sydney", "2025-04-06", "02:30", "2025-04-05T15:30:00Z", "+11:00", "+10:00"],
    ["Asia/Jerusalem", "2025-10-26", "01:30", "2025-10-25T22:30:00Z", "+03:00", "+02:00"],
  ];
  for (const [tz, d, t, instant, offset, laterOffset] of overlaps) {
    it(`${tz} ${d} ${t} is ambiguous -> earlier`, () => {
      expect(resolveLocalTime(d, t, tz)).toEqual({ ok: true, instant, offset, ambiguous: true, laterOffset });
      const r = computeClassTimes(meta({ startDate: d, startTime: t, timezone: tz }), "UTC");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.metadata.startsAt).toBe(instant);
        expect(r.metadata.startOffset).toBe(offset);
        expect(r.metadata.startAmbiguous).toBe(true);
        expect(r.warnings[0].message).toMatch(/happens twice/);
      }
    });
  }
});

describe("computeClassTimes", () => {
  it("persists explicit zone, instants, offsets and version", () => {
    const r = computeClassTimes(meta({ startDate: "2025-10-14", startTime: "07:30", endTime: "08:45", timezone: "Asia/Jerusalem" }), "UTC");
    expect(r.ok && r.metadata).toMatchObject({
      timezone: "Asia/Jerusalem",
      startsAt: "2025-10-14T04:30:00Z",
      endsAt: "2025-10-14T05:45:00Z",
      startOffset: "+03:00",
      endOffset: "+03:00",
      startAmbiguous: false,
      timeModelVersion: TIME_MODEL_VERSION,
    });
  });

  it("multi-day class across a DST change uses each day's own offset", () => {
    // Israel DST ends 26 Oct 2025 at 02:00.
    const r = computeClassTimes(
      meta({ startDate: "2025-10-24", startTime: "17:00", endDate: "2025-10-26", endTime: "15:00", timezone: "Asia/Jerusalem" }),
      "UTC"
    );
    expect(r.ok && r.metadata.startsAt).toBe("2025-10-24T14:00:00Z");
    expect(r.ok && r.metadata.endsAt).toBe("2025-10-26T13:00:00Z");
    expect(r.ok && r.metadata.endOffset).toBe("+02:00");
  });

  it("rejects an end before the start and an end date before the start date", () => {
    expect(computeClassTimes(meta({ startDate: "2025-10-14", startTime: "09:00", endTime: "08:00", timezone: "UTC" }), "UTC").ok).toBe(false);
    expect(computeClassTimes(meta({ startDate: "2025-10-14", startTime: "09:00", endDate: "2025-10-13", timezone: "UTC" }), "UTC").ok).toBe(false);
  });

  it("time zone edit keeps the wall time and recomputes the instant", () => {
    const base = { startDate: "2025-10-14", startTime: "07:30", endTime: "08:45" };
    const a = computeClassTimes(meta({ ...base, timezone: "Asia/Jerusalem" }), "UTC");
    const b = computeClassTimes(meta({ ...base, timezone: "America/New_York" }), "UTC");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect([a.metadata.startTime, b.metadata.startTime]).toEqual(["07:30", "07:30"]);
      expect(a.metadata.startsAt).toBe("2025-10-14T04:30:00Z");
      expect(b.metadata.startsAt).toBe("2025-10-14T11:30:00Z");
    }
  });

  it("a pre-model row (no zone) resolves in the Space zone and becomes explicit", () => {
    const r = computeClassTimes(meta({ startDate: "2025-10-14", startTime: "07:30" }), "Europe/London");
    expect(r.ok && r.metadata.timezone).toBe("Europe/London");
    expect(r.ok && r.metadata.startsAt).toBe("2025-10-14T06:30:00Z");
  });

  it("rejects unknown time zones", () => {
    expect(resolveLocalTime("2025-10-14", "07:30", "Mars/Olympus")).toEqual({ ok: false, reason: "invalid-timezone" });
  });
});

describe("pre-model rows keep loading and sorting safely", () => {
  it("a legacy stored row (no instants, null zone) parses and derives instants in memory", () => {
    const legacy = parseTeachItem("teachClasses", { id: "c", title: "Flow", metadata: { startDate: "2025-10-14", startTime: "07:30", timezone: null } });
    expect(legacy?.metadata.startsAt).toBeNull();
    const derived = withDerivedClassTimes(legacy!.metadata, "Asia/Jerusalem");
    expect(derived.startsAt).toBe("2025-10-14T04:30:00Z");
  });

  it("garbage canonical values degrade to null instead of breaking the row", () => {
    const row = parseTeachItem("teachClasses", { id: "c", title: "Flow", metadata: { startDate: "2025-10-14", startTime: "07:30", startsAt: "yesterday", startOffset: 3 } });
    expect(row?.metadata.startsAt).toBeNull();
    expect(row?.metadata.startOffset).toBeNull();
  });
});

describe("schedule logic uses canonical instants when present", () => {
  const mk = (id: string, m: Record<string, unknown>) => {
    const r = computeClassTimes(meta(m), "Asia/Jerusalem");
    if (!r.ok) throw new Error("fixture");
    return { id, title: id, subtitle: null, description: null, imageRef: null, externalLink: null, metadata: r.metadata };
  };

  it("orders classes in different zones by real instant", () => {
    const ny = mk("ny", { startDate: "2025-10-14", startTime: "07:00", timezone: "America/New_York" }); // 11:00Z
    const tlv = mk("tlv", { startDate: "2025-10-14", startTime: "09:00", timezone: "Asia/Jerusalem" }); // 06:00Z
    expect(sortClasses([ny, tlv]).map((c) => c.id)).toEqual(["tlv", "ny"]);
  });

  it("a class in another zone appears on the Space-zone date of its instant", () => {
    // Sydney 06:00 on 15 Oct (AEDT, +11) = 19:00Z on the 14th = 22:00 on the 14th in Jerusalem.
    const syd = mk("syd", { startDate: "2025-10-15", startTime: "06:00", timezone: "Australia/Sydney" });
    expect(classesOn([syd], "2025-10-14", "Asia/Jerusalem").map((c) => c.id)).toEqual(["syd"]);
    expect(classesOn([syd], "2025-10-15", "Asia/Jerusalem")).toEqual([]);
    // Viewed in its own zone it stays on its own local date.
    expect(classesOn([syd], "2025-10-15", "Australia/Sydney").map((c) => c.id)).toEqual(["syd"]);
    // Kolkata 23:30 on the 14th (+05:30) = 18:00Z = 21:00 on the 14th in Jerusalem.
    const kol = mk("kol", { startDate: "2025-10-14", startTime: "23:30", timezone: "Asia/Kolkata" });
    expect(classesOn([kol], "2025-10-14", "Asia/Jerusalem").map((c) => c.id)).toEqual(["kol"]);
  });

  it("past detection uses the end instant when present", () => {
    const c = mk("c", { startDate: "2025-10-14", startTime: "07:30", endTime: "08:45", timezone: "Asia/Jerusalem" }); // ends 05:45Z
    expect(isClassPast(c.metadata, "2025-10-14", "00:00", "2025-10-14T05:44:00Z")).toBe(false);
    expect(isClassPast(c.metadata, "2025-10-14", "00:00", "2025-10-14T05:45:00Z")).toBe(true);
  });
});
