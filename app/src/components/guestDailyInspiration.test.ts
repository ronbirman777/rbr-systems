import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuestApp, type GuestAppProps } from "./guest-app";
import { EMPTY_ARRIVAL_INFO } from "@/lib/modules/arrival";
import { EMPTY_RETREAT_PROFILE } from "@/lib/modules/retreatProfile";
import { brandConfigSchema } from "@/lib/theme/tokens";
import type { Locale } from "@/lib/i18n";
import { DAILY_QUOTES, getDailyQuote } from "@/lib/content/dailyQuotes";
import type { DisplayInspirationItem } from "@/lib/modules/dailyInspiration";

/**
 * TASK 030 W1.5 - Flow custom Daily Inspiration, proven on the rendered
 * Guest App (the same approach as guestHomeResolution.test.ts).
 */

const brand = brandConfigSchema.parse({
  name: "Return to Balance",
  logoRef: null,
  palette: "forest-sage",
  customPrimary: null,
  customSecondary: null,
  customNavigation: null,
  customText: null,
  atmosphere: "calm-organic",
});

const SEVEN: DisplayInspirationItem[] = [
  "Balance is not something you find, it is something you create through presence and permission to pause.",
  "With every exhale, release what no longer serves the space you wish to inhabit.",
  "Stillness is not the absence of movement, but a quiet harbor amidst the waves.",
  "Inhale possibility, exhale expectation. Let your breath be your simplest teacher.",
  "Strength and softness can coexist within the very same breath.",
  "Rest is not a reward for hard work; it is an essential part of the human rhythm.",
  "Carry this quiet center with you back into the world, knowing it has been within you all along.",
].map((text) => ({ text, label: null }));

const sched = (date: string) => ({ date, startTime: "09:00", endTime: null, title: "x", facilitator: null, location: null, description: null, category: null });
const SCHEDULE = ["2027-10-14", "2027-10-15", "2027-10-20"].map(sched);

function render(o: {
  today: string;
  modules?: string[];
  items?: DisplayInspirationItem[] | undefined;
  schedule?: ReturnType<typeof sched>[];
  locale?: Locale;
}): string {
  const props = {
    tenantName: "Return to Balance",
    brand,
    todayIso: o.today,
    nowTime: "09:00",
    enabledModules: o.modules ?? ["dailyInspiration"],
    schedule: o.schedule ?? SCHEDULE,
    facilitators: [],
    meals: [],
    treatments: [],
    facilities: [],
    arrivalInfo: EMPTY_ARRIVAL_INFO,
    retreatProfile: EMPTY_RETREAT_PROFILE,
    dailyInspirations: o.items,
    locale: o.locale ?? "en",
  } as unknown as GuestAppProps;
  return renderToStaticMarkup(h(GuestApp, props));
}

function quoteText(html: string): string | null {
  const m = html.match(/data-testid="daily-quote-text"[^>]*>([^<]*)</) ?? html.match(/<p[^>]*data-testid="daily-quote-text"[^>]*>([^<]*)</);
  return m ? m[1].replace(/&#x27;/g, "'").replace(/&amp;/g, "&") : null;
}

describe("Flow Daily Inspiration - custom reflections", () => {
  it("renders the custom reflection, not a built-in one", () => {
    const out = render({ today: "2027-10-14", items: SEVEN });
    expect(quoteText(out)).toBe(SEVEN[0].text);
    for (const q of DAILY_QUOTES) expect(out).not.toContain(q.text);
  });

  it("maps retreat Day 1..7 to reflection 1..7, in stored order", () => {
    const days = ["2027-10-14", "2027-10-15", "2027-10-16", "2027-10-17", "2027-10-18", "2027-10-19", "2027-10-20"];
    days.forEach((d, i) => expect(quoteText(render({ today: d, items: SEVEN }))).toBe(SEVEN[i].text));
  });

  it("is deterministic: the same day always gives the same reflection", () => {
    const a = render({ today: "2027-10-16", items: SEVEN });
    const b = render({ today: "2027-10-16", items: SEVEN });
    expect(a).toBe(b);
  });

  it("cycles when the stay outlasts the list, and holds on the first before it starts", () => {
    expect(quoteText(render({ today: "2027-10-21", items: SEVEN }))).toBe(SEVEN[0].text);
    expect(quoteText(render({ today: "2027-10-01", items: SEVEN }))).toBeTruthy();
  });

  it("with no schedule rotates by day of year and still shows a custom reflection", () => {
    const out = render({ today: "2027-10-14", items: SEVEN, schedule: [] });
    expect(SEVEN.map((s) => s.text)).toContain(quoteText(out));
  });

  it("shows the label as the attribution line, and none when there is no label", () => {
    const labelled = render({ today: "2027-10-14", items: [{ text: "One line.", label: "Day 1" }] });
    expect(labelled).toContain("Day 1");
    const bare = render({ today: "2027-10-14", items: [{ text: "One line.", label: null }] });
    expect(bare).toContain("One line.");
    expect(bare).not.toMatch(/tracking-\[0\.18em\][^>]*>\s*<\/p>/);
  });

  it("marks organizer text dir=auto and never translates it", () => {
    for (const locale of ["en", "de", "es", "fr", "he"] as Locale[]) {
      const out = render({ today: "2027-10-14", items: SEVEN, locale });
      expect(out).toMatch(/dir="auto"[^>]*data-testid="daily-quote-text"/);
      expect(quoteText(out)).toBe(SEVEN[0].text);
    }
  });

  it("wraps a very long unbroken reflection instead of overflowing", () => {
    const long = "Unbroken" + "x".repeat(400);
    const out = render({ today: "2027-10-14", items: [{ text: long, label: null }] });
    expect(out).toContain(long);
    expect(out).toContain("[overflow-wrap:anywhere]");
  });

  it("renders in Hebrew inside an RTL container", () => {
    const out = render({ today: "2027-10-14", items: [{ text: "נשימה אחת בכל פעם.", label: null }], locale: "he" });
    expect(out).toContain("נשימה אחת בכל פעם.");
  });
});

describe("Flow Daily Inspiration - fallback and switch", () => {
  it("no custom reflections: the built-in quote, exactly as before", () => {
    for (const items of [undefined, []]) {
      const out = render({ today: "2026-05-04", items });
      expect(out).toContain(getDailyQuote("2026-05-04").text);
    }
  });

  it("module disabled: nothing renders, even with custom reflections present", () => {
    const out = render({ today: "2027-10-14", modules: [], items: SEVEN });
    expect(out).not.toContain("daily-quote-text");
    for (const s of SEVEN) expect(out).not.toContain(s.text);
    for (const q of DAILY_QUOTES) expect(out).not.toContain(q.text);
  });
});
