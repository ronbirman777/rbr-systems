import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DAY_CHIP_COLORS, dayLabelTypography, RetreatDayHeader, RetreatDayNavigator } from "./retreat-day-navigator";
import { buildRetreatDays } from "@/lib/schedule/retreatDays";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import { contrastRatio, hexToRgb, mixHex } from "@/lib/theme/contrast";
import { ATMOSPHERES, PALETTES, type BrandConfig } from "@/lib/theme/tokens";
import { SUPPORTED_LOCALES, translate, type Locale } from "@/lib/i18n";

/**
 * TASK 033 QA defect D3 - the Day Navigator's small labels (10px weekday,
 * "DAY n") measured 3.94:1 (#758077 on #fdfaf4): --rbr-text faded with
 * opacity. Every text state now uses a solid token pair; this computes the
 * ratio of every pair the chips actually use, from the derived token
 * values, across every palette and atmosphere plus light and dark custom
 * colours, and requires WCAG AA for small text (4.5:1).
 */

const AA = 4.5;

const CUSTOM_COLORS = [null, "#E0B0FF", "#FFD700", "#A38A6B", "#2D4A3E", "#C4785A", "#8FAF95", "#FFFFFF", "#000000"];

function configs(): BrandConfig[] {
  const out: BrandConfig[] = [];
  for (const palette of Object.keys(PALETTES) as BrandConfig["palette"][]) {
    for (const atmosphere of Object.keys(ATMOSPHERES) as BrandConfig["atmosphere"][]) {
      for (const custom of CUSTOM_COLORS) {
        out.push({
          name: "Space",
          logoRef: null,
          palette,
          atmosphere,
          customPrimary: custom,
          customSecondary: null,
          customNavigation: custom,
          customText: custom,
        });
      }
    }
  }
  return out;
}

/** Resolves "var(--rbr-x)" against the derived vars. */
function resolve(vars: Record<string, string>, value: string): string {
  const m = /^var\((--[\w-]+)\)$/.exec(value);
  if (!m) throw new Error(`not a token: ${value}`);
  const hex = vars[m[1]];
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`token ${m[1]} is not a hex colour: ${hex}`);
  return hex;
}

const ratio = (a: string, b: string) => contrastRatio(hexToRgb(a), hexToRgb(b));

/** Every [text, surface] pair a chip or the single-day header paints. */
const PAIRS: [string, keyof typeof DAY_CHIP_COLORS | string, keyof typeof DAY_CHIP_COLORS | string][] = [
  ["unselected weekday / DAY n", "label", "surface"],
  ["unselected date number", "number", "surface"],
  ["out-of-range weekday / DAY n", "label", "outOfRangeSurface"],
  ["out-of-range date number", "number", "outOfRangeSurface"],
  ["selected chip text", "activeText", "activeSurface"],
  // RetreatDayHeader: the DAY n line and the date heading sit on cream; the
  // date tile is navigation; the Today pill is primary-foreground on primary-soft.
  ["header DAY n", "label", "surface"],
  ["header date heading", "number", "surface"],
  ["header Today pill", "var(--rbr-primary-foreground)", "var(--rbr-primary-soft)"],
];

const token = (k: string) => (k in DAY_CHIP_COLORS ? DAY_CHIP_COLORS[k as keyof typeof DAY_CHIP_COLORS] : k);

describe("Day Navigator text contrast (WCAG AA 4.5:1, small text)", () => {
  it("documents the defect: the old opacity treatment failed AA on the default palette", () => {
    const vars = deriveThemeVars(configs()[0]);
    // opacity 0.6 of --rbr-text over the cream chip = a 60% blend.
    const oldWeekday = mixHex(vars["--rbr-cream"], vars["--rbr-text"], 0.6);
    expect(oldWeekday.toLowerCase()).toBe("#758077");
    expect(ratio(oldWeekday, vars["--rbr-cream"])).toBeLessThan(AA);
  });

  it("every chip and header text state clears 4.5:1 for every palette, atmosphere and custom colour", () => {
    const failures: string[] = [];
    let min = Infinity;
    for (const config of configs()) {
      const vars = deriveThemeVars(config);
      for (const [name, text, surface] of PAIRS) {
        const r = ratio(resolve(vars, token(text)), resolve(vars, token(surface)));
        min = Math.min(min, r);
        if (r < AA) failures.push(`${name} ${config.palette}/${config.atmosphere}/${config.customText}: ${r.toFixed(2)}`);
      }
    }
    expect(failures).toEqual([]);
    expect(min).toBeGreaterThanOrEqual(AA);
  });

  it("the default palette's unselected labels are now comfortably AA (was 3.94:1)", () => {
    const vars = deriveThemeVars(configs()[0]);
    const r = ratio(vars["--rbr-text-subtle"], vars["--rbr-cream"]);
    expect(r).toBeGreaterThanOrEqual(5.5);
    // Still quieter than the full-strength date number (hierarchy kept).
    expect(r).toBeLessThan(ratio(vars["--rbr-text"], vars["--rbr-cream"]));
  });
});

describe("Day Navigator markup uses only those solid tokens", () => {
  const { days } = buildRetreatDays({
    activityDates: ["2027-10-12", "2027-10-15"],
    startDate: "2027-10-14",
    endDate: "2027-10-17",
    todayIso: "2027-10-15",
  });
  const render = (locale: Locale) =>
    renderToStaticMarkup(
      h(RetreatDayNavigator, { days, selected: "2027-10-16", onSelect: () => {}, locale, showToday: true, panelId: "p", idPrefix: "t" })
    );

  it("never fades text or chips with opacity (in LTR and RTL)", () => {
    for (const locale of ["en", "he"] as const) {
      const html = render(locale);
      expect(html, locale).not.toMatch(/opacity/);
      expect(html, locale).toContain("color:var(--rbr-text-subtle)");
      expect(html, locale).toContain("color:var(--rbr-on-navigation)");
    }
    const header = renderToStaticMarkup(h(RetreatDayHeader, { day: days[0], locale: "en", showToday: true }));
    expect(header).not.toMatch(/opacity|--rbr-mist/);
  });

  it("an out-of-range day is dimmed by its surface and a dashed border, not by fading its text", () => {
    const html = render("en");
    const chip = html.match(/<button[^>]*data-date="2027-10-12"[^>]*>/)?.[0] ?? "";
    expect(chip).toContain('data-outside-range="true"');
    expect(chip).toContain("background:var(--rbr-background)");
    expect(chip).toContain("dashed");
  });

  it('"DAY n" is at least 9px in every locale, 10px wherever the label fits', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const n of [1, 12, 60]) {
        const label = translate(locale, "flow", "dayN", { n });
        const size = Number.parseFloat(dayLabelTypography(label).fontSize);
        expect(size, `${locale} ${label}`).toBeGreaterThanOrEqual(9);
        if (label.length < 9) expect(size, `${locale} ${label}`).toBe(10);
      }
    }
    expect(render("en")).toContain("font-size:10px");
  });
});
