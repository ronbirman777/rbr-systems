import { describe, expect, it } from "vitest";
import {
  DEFAULT_SESSION_MINUTES,
  duplicateScheduleItem,
  followDuration,
  startTimePatch,
  suggestEndTime,
  timeToMinutes,
} from "./sessionTimes";
import { publicScheduleItemSchema, type EditableScheduleItem } from "./types";

/** TASK 033 Studio UX: automatic end time + Duplicate session (pure rules). */

const session = (over: Partial<EditableScheduleItem> = {}): EditableScheduleItem => ({
  id: "orig-1",
  date: "2026-10-14",
  startTime: "07:30",
  endTime: "09:00",
  title: "Sunrise Yoga",
  facilitator: "Lena",
  location: "Shala",
  description: "Gentle flow",
  category: "Yoga",
  whatToBring: ["Mat", "Blanket"],
  whatToExpect: ["Slow start"],
  ...over,
});

describe("suggestEndTime", () => {
  it("suggests start + 1 hour by default (09:00 -> 10:00)", () => {
    expect(DEFAULT_SESSION_MINUTES).toBe(60);
    expect(suggestEndTime("09:00")).toBe("10:00");
    expect(suggestEndTime("09:45")).toBe("10:45");
    expect(suggestEndTime("00:00")).toBe("01:00");
  });

  it("uses a given duration", () => {
    expect(suggestEndTime("07:30", 90)).toBe("09:00");
  });

  it("never crosses midnight: the model has no end date, so no suggestion", () => {
    expect(suggestEndTime("22:59")).toBe("23:59");
    expect(suggestEndTime("23:00")).toBeNull();
    expect(suggestEndTime("23:30")).toBeNull();
    expect(suggestEndTime("22:30", 120)).toBeNull();
  });

  it("refuses invalid or partial input", () => {
    for (const v of ["", "9:00", "24:00", "12:60", "ab:cd"]) expect(suggestEndTime(v), v).toBeNull();
    expect(suggestEndTime("09:00", 0)).toBeNull();
    expect(suggestEndTime("09:00", Number.NaN)).toBeNull();
  });

  it("every value it does produce is accepted by the schedule schema and ends after the start", () => {
    for (let m = 0; m < 24 * 60; m += 7) {
      const start = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const end = suggestEndTime(start);
      if (end === null) continue;
      expect(end > start).toBe(true);
      expect(publicScheduleItemSchema.safeParse({ ...session(), startTime: start, endTime: end }).success).toBe(true);
    }
  });
});

describe("followDuration", () => {
  it("keeps a session's own positive duration", () => {
    expect(followDuration("07:30", "09:00")).toBe(90);
  });
  it("falls back to one hour without a usable end", () => {
    expect(followDuration("07:30", null)).toBe(60);
    expect(followDuration("09:00", "08:00")).toBe(60);
    expect(followDuration("09:00", "09:00")).toBe(60);
  });
});

describe("startTimePatch - the end follows only while it is not hand-edited", () => {
  it("moves the end with the start for a new session", () => {
    expect(startTimePatch("11:15", 60)).toEqual({ startTime: "11:15", endTime: "12:15" });
  });

  it("never touches the end of an existing or hand-edited session (followMinutes null)", () => {
    expect(startTimePatch("11:15", null)).toEqual({ startTime: "11:15" });
    expect("endTime" in startTimePatch("11:15", null)).toBe(false);
  });

  it("clears the followed end rather than leave one before the start when the slot would cross midnight", () => {
    expect(startTimePatch("23:30", 60)).toEqual({ startTime: "23:30", endTime: null });
  });

  it("leaves the end alone while the start is cleared or partial", () => {
    expect(startTimePatch("", 60)).toEqual({ startTime: "" });
  });

  it("a duplicate keeps the original's duration when its start moves", () => {
    const copy = duplicateScheduleItem(session(), "copy-1");
    const minutes = followDuration(copy.startTime, copy.endTime);
    expect(startTimePatch("10:00", minutes)).toEqual({ startTime: "10:00", endTime: "11:30" });
  });
});

describe("duplicateScheduleItem", () => {
  it("creates a separate session with a new id carrying every editable field", () => {
    const original = session();
    const copy = duplicateScheduleItem(original, "copy-1");
    expect(copy.id).toBe("copy-1");
    const { id: _a, ...origFields } = original;
    const { id: _b, ...copyFields } = copy;
    void _a;
    void _b;
    expect(copyFields).toEqual(origFields);
  });

  it("leaves the original unchanged and shares no list by reference", () => {
    const original = session();
    const snapshot = JSON.parse(JSON.stringify(original));
    const copy = duplicateScheduleItem(original, "copy-1");
    copy.whatToBring.push("Water");
    copy.title = "Changed";
    expect(original).toEqual(snapshot);
    expect(copy.whatToBring).not.toBe(original.whatToBring);
    expect(copy.whatToExpect).not.toBe(original.whatToExpect);
  });

  it("refuses to reuse the original id", () => {
    expect(() => duplicateScheduleItem(session(), "orig-1")).toThrow();
  });

  it("timeToMinutes parses HH:MM only", () => {
    expect(timeToMinutes("01:05")).toBe(65);
    expect(timeToMinutes(null)).toBeNull();
  });
});
