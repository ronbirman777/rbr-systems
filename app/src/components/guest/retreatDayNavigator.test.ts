import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  dayAccessibleLabel,
  nextDayIndex,
  RetreatDayHeader,
  RetreatDayNavigator,
  weekdayIndexOf,
} from "./retreat-day-navigator";
import { ScheduleScreen } from "../schedule-screen";
import { buildRetreatDays } from "@/lib/schedule/retreatDays";
import { brandConfigSchema } from "@/lib/theme/tokens";
import type { Locale } from "@/lib/i18n";
import type { PublicScheduleItem } from "@/lib/schedule/types";

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

// Oct 14 2027 is a Thursday.
const { days } = buildRetreatDays({
  activityDates: ["2027-10-15"],
  startDate: "2027-10-14",
  endDate: "2027-10-17",
  todayIso: "2027-10-15",
});

function nav(opts: { locale?: Locale; selected?: string; showToday?: boolean } = {}): string {
  return renderToStaticMarkup(
    h(RetreatDayNavigator, {
      days,
      selected: opts.selected ?? "2027-10-16",
      onSelect: () => {},
      locale: opts.locale ?? "en",
      showToday: opts.showToday ?? true,
      panelId: "panel",
      idPrefix: "t",
    })
  );
}

const tabs = (html: string) => html.match(/<button[^>]*role="tab"[^>]*>/g) ?? [];

describe("RetreatDayNavigator - semantics", () => {
  it("is a labelled tablist of one tab per day", () => {
    const html = nav();
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Choose a day"');
    expect(tabs(html)).toHaveLength(4);
    expect(tabs(html).every((t) => t.includes('aria-controls="panel"'))).toBe(true);
  });

  it("marks exactly the selected day aria-selected and gives only it tabIndex=0", () => {
    const html = nav({ selected: "2027-10-16" });
    const all = tabs(html);
    expect(all.filter((t) => t.includes('aria-selected="true"'))).toHaveLength(1);
    expect(all.filter((t) => t.includes('tabindex="0"'))).toHaveLength(1);
    expect(all.filter((t) => t.includes('tabindex="-1"'))).toHaveLength(3);
    const selected = all.find((t) => t.includes('aria-selected="true"'))!;
    expect(selected).toContain('data-date="2027-10-16"');
    expect(selected).toContain('tabindex="0"');
  });

  it("shows weekday, date number and DAY n, with a localized accessible name per chip", () => {
    const html = nav();
    expect(html).toContain(">Thu<");
    expect(html).toContain(">14<");
    expect(html).toContain("Day 1");
    expect(html).toContain("Day 4");
    expect(html).toContain('aria-label="Thursday 14 October, day 1"');
    expect(html).toContain('aria-label="Friday 15 October, day 2, today"');
  });

  it("labels chips in every Space language", () => {
    for (const [locale, word] of [["de", "Tag 2"], ["es", "Día 2"], ["fr", "Jour 2"], ["he", "יום 2"]] as const) {
      expect(nav({ locale }), locale).toContain(word);
    }
    expect(dayAccessibleLabel(days[1], "de", true)).toBe("Freitag, 15. Oktober, Tag 2, heute");
  });
});

describe("RetreatDayNavigator - Today marker", () => {
  it("marks today's chip when today is shown", () => {
    const html = nav({ showToday: true });
    const today = tabs(html).filter((t) => t.includes('data-today="true"'));
    expect(today).toHaveLength(1);
    expect(today[0]).toContain('data-date="2027-10-15"');
    expect(html.match(/data-today-dot="true"/g)).toHaveLength(1);
  });

  it("renders no marker before mount (showToday=false)", () => {
    const html = nav({ showToday: false });
    expect(html).not.toContain('data-today="true"');
    expect(html).not.toContain("today");
  });
});

describe("RetreatDayNavigator - keyboard", () => {
  it("moves with ArrowRight/ArrowLeft in LTR and wraps", () => {
    expect(nextDayIndex(0, "ArrowRight", 4, "ltr")).toBe(1);
    expect(nextDayIndex(0, "ArrowLeft", 4, "ltr")).toBe(3);
    expect(nextDayIndex(3, "ArrowRight", 4, "ltr")).toBe(0);
  });

  it("reverses the arrows in RTL", () => {
    expect(nextDayIndex(0, "ArrowLeft", 4, "rtl")).toBe(1);
    expect(nextDayIndex(1, "ArrowRight", 4, "rtl")).toBe(0);
  });

  it("jumps with Home/End and ignores other keys", () => {
    expect(nextDayIndex(2, "Home", 4, "ltr")).toBe(0);
    expect(nextDayIndex(1, "End", 4, "rtl")).toBe(3);
    expect(nextDayIndex(1, "Enter", 4, "ltr")).toBeNull();
    expect(nextDayIndex(0, "ArrowRight", 0, "ltr")).toBeNull();
  });
});

describe("weekday is derived from the date, not the device timezone", () => {
  it("Thursday 14 Oct 2027 stays Thursday under TZ=America/Los_Angeles (and far east)", () => {
    for (const zone of ["America/Los_Angeles", "Pacific/Kiritimati", "UTC"]) {
      process.env.TZ = zone;
      expect(weekdayIndexOf("2027-10-14"), zone).toBe(4);
      expect(nav({ locale: "en" }), zone).toContain(">Thu<");
    }
  });
});

const BRAND = brandConfigSchema.parse({
  name: "Return to Balance",
  logoRef: null,
  palette: "forest-sage",
  customPrimary: null,
  customSecondary: null,
  customNavigation: null,
  customText: null,
  atmosphere: "calm-organic",
  imageStyle: "rounded",
});
function item(date: string, startTime = "09:00", title = "Yoga"): PublicScheduleItem {
  return { date, startTime, endTime: null, title, facilitator: null, location: null, category: null, description: null, whatToBring: [], whatToExpect: [] };
}

function screen(props: Partial<Parameters<typeof ScheduleScreen>[0]> = {}): string {
  return renderToStaticMarkup(
    h(ScheduleScreen, {
      brand: BRAND,
      schedule: [item("2027-10-15")],
      todayIso: "2027-10-15",
      nowTime: "08:00",
      locale: "en",
      ...props,
    })
  );
}

describe("ScheduleScreen with the Day Navigator", () => {
  it("shows every configured day, including empty ones, and selects today by default", () => {
    const html = screen({ retreatStartDate: "2027-10-14", retreatEndDate: "2027-10-17" });
    expect(tabs(html)).toHaveLength(4);
    const selected = tabs(html).find((t) => t.includes('aria-selected="true"'))!;
    expect(selected).toContain('data-date="2027-10-15"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain("Yoga");
  });

  it("does not render the Today marker on the server (hydration-safe)", () => {
    const html = screen({ retreatStartDate: "2027-10-14", retreatEndDate: "2027-10-17" });
    expect(html).not.toContain('data-today="true"');
  });

  it("selects the next upcoming day before the retreat and shows the empty-day state", () => {
    const html = screen({ todayIso: "2027-10-01", retreatStartDate: "2027-10-14", retreatEndDate: "2027-10-17" });
    const selected = tabs(html).find((t) => t.includes('aria-selected="true"'))!;
    expect(selected).toContain('data-date="2027-10-14"');
    expect(html).toContain("No activities planned for this day.");
  });

  it("shows a date header, not a navigator, for a single-day retreat (A5)", () => {
    const html = screen({ todayIso: "2027-10-01" });
    expect(html).not.toContain('role="tablist"');
    expect(html).toContain("Friday 15 October");
    expect(html).toContain("Day 1");
  });

  it("renders the single-day header Today pill only when asked", () => {
    const single = buildRetreatDays({ activityDates: ["2027-10-15"], todayIso: "2027-10-15" }).days[0];
    expect(renderToStaticMarkup(h(RetreatDayHeader, { day: single, locale: "en", showToday: true }))).toContain(">Today<");
    expect(renderToStaticMarkup(h(RetreatDayHeader, { day: single, locale: "en", showToday: false }))).not.toContain(">Today<");
  });

  it("keeps the old behaviour for a schedule without dates: derived range, gaps filled", () => {
    const html = screen({ schedule: [item("2027-10-14"), item("2027-10-16")], todayIso: "2027-10-01" });
    expect(tabs(html)).toHaveLength(3);
    expect(html).toContain("Day 3");
  });
});

describe("guard: schedule-screen never formats dates with the device locale/timezone", () => {
  const source = readFileSync(join(__dirname, "..", "schedule-screen.tsx"), "utf8");
  it("has no toLocaleDateString(undefined and no weekdayLabel", () => {
    expect(source).not.toContain("toLocaleDateString(undefined");
    expect(source).not.toContain("weekdayLabel");
  });
});
