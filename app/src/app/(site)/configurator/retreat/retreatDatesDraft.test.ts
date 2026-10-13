import { describe, expect, it } from "vitest";
import { planRetreatDatesSave, retreatDatesChanged, retreatDatesDraftFrom } from "./retreatDatesDraft";

/**
 * TASK 033 fix 2: the dirty/save decision of the Studio retreat dates
 * panel. The panel's wiring into the shared guard is covered structurally
 * by studioDirtyWiring.test.ts (section "retreatDates").
 */

describe("retreatDatesDraftFrom", () => {
  it("maps unset dates to empty fields", () => {
    expect(retreatDatesDraftFrom({ startDate: null, endDate: undefined })).toEqual({ startDate: "", endDate: "" });
    expect(retreatDatesDraftFrom({ startDate: "2027-10-14", endDate: "2027-10-19" })).toEqual({
      startDate: "2027-10-14",
      endDate: "2027-10-19",
    });
  });
});

describe("retreatDatesChanged", () => {
  const saved = { startDate: "2027-10-14", endDate: "2027-10-19" };

  it("is false for the stored pair, and treats '' and null alike", () => {
    expect(retreatDatesChanged({ startDate: "2027-10-14", endDate: "2027-10-19" }, saved)).toBe(false);
    expect(retreatDatesChanged({ startDate: "", endDate: "" }, { startDate: null, endDate: null })).toBe(false);
    expect(retreatDatesChanged({ startDate: "", endDate: "" }, {})).toBe(false);
  });

  it("is true when either side differs, including clearing a stored date", () => {
    expect(retreatDatesChanged({ startDate: "2027-10-15", endDate: "2027-10-19" }, saved)).toBe(true);
    expect(retreatDatesChanged({ startDate: "2027-10-14", endDate: "2027-10-20" }, saved)).toBe(true);
    expect(retreatDatesChanged({ startDate: "", endDate: "2027-10-19" }, saved)).toBe(true);
    expect(retreatDatesChanged({ startDate: "", endDate: "" }, saved)).toBe(true);
  });
});

describe("planRetreatDatesSave", () => {
  const unset = { startDate: null, endDate: null };

  it("sends a changed, valid pair", () => {
    expect(planRetreatDatesSave({ startDate: "2027-10-14", endDate: "2027-10-19" }, unset)).toEqual({ kind: "save" });
  });

  it("sends a single date (both are optional) and a cleared pair", () => {
    expect(planRetreatDatesSave({ startDate: "2027-10-14", endDate: "" }, unset)).toEqual({ kind: "save" });
    expect(planRetreatDatesSave({ startDate: "", endDate: "2027-10-19" }, unset)).toEqual({ kind: "save" });
    expect(planRetreatDatesSave({ startDate: "", endDate: "" }, { startDate: "2027-10-14", endDate: "2027-10-19" })).toEqual({
      kind: "save",
    });
  });

  it("is a no-op (may clean) when an edit was reverted to the stored pair", () => {
    expect(planRetreatDatesSave({ startDate: "2027-10-14", endDate: "2027-10-19" }, { startDate: "2027-10-14", endDate: "2027-10-19" })).toEqual({
      kind: "unchanged",
    });
  });

  it("keeps the section dirty for an end before the start", () => {
    expect(planRetreatDatesSave({ startDate: "2027-10-19", endDate: "2027-10-14" }, unset)).toEqual({
      kind: "invalid",
      error: "endBeforeStart",
    });
  });

  it("keeps the section dirty for a range longer than 60 days (60 inclusive is allowed)", () => {
    expect(planRetreatDatesSave({ startDate: "2027-01-01", endDate: "2027-03-01" }, unset)).toEqual({ kind: "save" }); // 60 days
    expect(planRetreatDatesSave({ startDate: "2027-01-01", endDate: "2027-03-02" }, unset)).toEqual({
      kind: "invalid",
      error: "rangeTooLong",
    });
  });

  it("validates before comparing, so a stored invalid pair is never reported as unchanged", () => {
    const stored = { startDate: "2027-10-19", endDate: "2027-10-14" };
    expect(planRetreatDatesSave({ startDate: "2027-10-19", endDate: "2027-10-14" }, stored).kind).toBe("invalid");
    expect(planRetreatDatesSave({ startDate: "2027-02-30", endDate: "" }, unset)).toEqual({ kind: "invalid", error: "invalidDate" });
  });
});
