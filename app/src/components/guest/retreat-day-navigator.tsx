"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { createTranslator, directionOf, type Direction, type Locale } from "@/lib/i18n/core";
import { formatLongDateLocalized, shortWeekdayName } from "@/lib/i18n/datetime";
import type { RetreatDay } from "@/lib/schedule/retreatDays";

/**
 * Time to Flow - Retreat Day Navigator (TASK 033 P2, owner decisions A1/A5).
 *
 * The Teach calendar strip's visual language (teach-guest-app.tsx
 * ScheduleScreen) in Flow's own --rbr-* tokens: no image, and no class
 * count or booking semantics - a chip is a retreat DAY, never a slot.
 *
 * Each chip: localized short weekday, date number, "DAY n", Today dot.
 * Every string is derived from the "YYYY-MM-DD" itself on a UTC-noon date,
 * so neither the device's locale nor its timezone can move a weekday.
 *
 * Semantics: a WAI-ARIA tablist controlling the timeline below (its
 * tabpanel). Roving tabindex, automatic activation, ←/→ (mirrored in
 * RTL), Home/End, wrap-around at either end.
 *
 * `showToday` is false on the server render and the first client render
 * (the caller gates it on mount), so the Today marker can never cause a
 * hydration mismatch.
 */

export type RetreatDayNavigatorProps = {
  days: readonly RetreatDay[];
  selected: string;
  onSelect: (date: string) => void;
  locale: Locale;
  showToday: boolean;
  /** id of the tabpanel this tablist controls. */
  panelId?: string;
  /** Prefix for each tab's id (aria-labelledby on the panel). */
  idPrefix?: string;
  /** Defaults to the locale's own direction. */
  dir?: Direction;
};

/**
 * TASK 033 (QA defect D3) - every text state of a chip uses a SOLID token,
 * never opacity, so its contrast is exactly the token pair's (asserted for
 * every palette in retreatDayNavigatorContrast.test.ts):
 *
 *   unselected   weekday + "DAY n"  --rbr-text-subtle  on --rbr-cream
 *                date number        --rbr-text         on --rbr-cream
 *   out of range (unselected)       same text tokens on --rbr-background,
 *                                   with a dashed hairline - the "dimmed"
 *                                   cue is the surface and border, not a
 *                                   fade of the text
 *   selected     all text           --rbr-on-navigation on --rbr-navigation
 *
 * The old opacity treatment measured 3.94:1 (#758077 on #fdfaf4) for the
 * default palette and as low as ~2.5:1 for lighter brand colours.
 */
export const DAY_CHIP_COLORS = {
  surface: "var(--rbr-cream)",
  outOfRangeSurface: "var(--rbr-background)",
  label: "var(--rbr-text-subtle)",
  number: "var(--rbr-text)",
  activeSurface: "var(--rbr-navigation)",
  activeText: "var(--rbr-on-navigation)",
} as const;

/**
 * Font size of the "DAY n" line. 10px (was 8.5px) with light tracking fits
 * every locale's short label in the 54px inside of the 56px chip (measured
 * in DM Sans 600: "JOUR 12" 40.6px, "GÜN 12" 35.8px); the longest labels
 * (Italian "GIORNO 12" and up, 9+ characters) step down to 9px with no
 * tracking (about 46-52px) instead of overflowing the chip.
 */
export function dayLabelTypography(label: string): { fontSize: string; letterSpacing: string } {
  return label.length >= 9 ? { fontSize: "9px", letterSpacing: "0" } : { fontSize: "10px", letterSpacing: "0.04em" };
}

/** The weekday of a calendar date, computed in UTC so no device zone can shift it. */
export function weekdayIndexOf(dateIso: string): number {
  return new Date(`${dateIso}T12:00:00Z`).getUTCDay();
}

export function dayTabId(idPrefix: string, date: string): string {
  return `${idPrefix}-day-${date}`;
}

/**
 * The index a key press moves to, or null when the key is not handled.
 * ArrowRight means "next" in LTR and "previous" in RTL (reading order
 * runs right-to-left there, so the next day sits to the LEFT).
 */
export function nextDayIndex(current: number, key: string, count: number, dir: Direction): number | null {
  if (count <= 0) return null;
  const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
  const backward = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
  switch (key) {
    case forward:
      return (current + 1) % count;
    case backward:
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** The screen-reader name of one chip: full date, Day n, and Today when it is today. */
export function dayAccessibleLabel(day: RetreatDay, locale: Locale, showToday: boolean): string {
  const { t } = createTranslator(locale);
  const date = formatLongDateLocalized(day.date, locale);
  const today = showToday && day.isToday;
  if (day.dayNumber === null) return today ? t("flow", "dayOptionDateToday", { date }) : date;
  return today
    ? t("flow", "dayOptionLabelToday", { date, n: day.dayNumber })
    : t("flow", "dayOptionLabel", { date, n: day.dayNumber });
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function RetreatDayNavigator({
  days,
  selected,
  onSelect,
  locale,
  showToday,
  panelId,
  idPrefix = "retreat",
  dir,
}: RetreatDayNavigatorProps) {
  const { t } = createTranslator(locale);
  const direction = dir ?? directionOf(locale);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const firstScroll = useRef(true);
  const selectedIndex = Math.max(
    0,
    days.findIndex((d) => d.date === selected)
  );

  // Keep the selected chip visible. The first positioning is instant (a
  // page that opens on day 9 should not animate there); later changes
  // glide only when the guest has not asked for reduced motion.
  useEffect(() => {
    const el = tabRefs.current[selectedIndex];
    if (!el || typeof el.scrollIntoView !== "function") return;
    const behavior: ScrollBehavior = firstScroll.current || prefersReducedMotion() ? "auto" : "smooth";
    firstScroll.current = false;
    el.scrollIntoView({ behavior, block: "nearest", inline: "center" });
  }, [selectedIndex]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = nextDayIndex(selectedIndex, event.key, days.length, direction);
    if (next === null) return;
    event.preventDefault();
    onSelect(days[next].date);
    tabRefs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={t("flow", "chooseDay")}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className="flex gap-2 overflow-x-auto no-scrollbar px-4 pb-1 overscroll-x-contain"
    >
      {days.map((day, i) => {
        const active = i === selectedIndex;
        const today = showToday && day.isToday;
        const dayLabel = day.dayNumber === null ? null : t("flow", "dayN", { n: day.dayNumber });
        const dimmed = day.outsideRange && !active;
        return (
          <button
            key={day.date}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            id={dayTabId(idPrefix, day.date)}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            aria-label={dayAccessibleLabel(day, locale, showToday)}
            tabIndex={active ? 0 : -1}
            data-date={day.date}
            data-today={today ? "true" : undefined}
            onClick={() => onSelect(day.date)}
            className="shrink-0 w-[56px] h-[72px] min-w-11 min-h-11 flex flex-col items-center justify-center gap-0.5 rounded-2xl transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            data-outside-range={dimmed ? "true" : undefined}
            style={{
              background: active ? DAY_CHIP_COLORS.activeSurface : dimmed ? DAY_CHIP_COLORS.outOfRangeSurface : DAY_CHIP_COLORS.surface,
              color: active ? DAY_CHIP_COLORS.activeText : DAY_CHIP_COLORS.number,
              border: active
                ? "1px solid transparent"
                : `1px ${dimmed ? "dashed" : "solid"} color-mix(in srgb, var(--rbr-sand) ${dimmed ? 100 : 60}%, transparent)`,
              outlineColor: "var(--rbr-primary)",
            }}
          >
            <span
              aria-hidden="true"
              className="text-[10px] font-semibold tracking-wider uppercase leading-none"
              style={{ fontFamily: "var(--rbr-font-ui)", color: active ? DAY_CHIP_COLORS.activeText : DAY_CHIP_COLORS.label }}
            >
              {shortWeekdayName(weekdayIndexOf(day.date), locale)}
            </span>
            <span aria-hidden="true" className="text-[21px] leading-none" style={{ fontFamily: "var(--rbr-font-display)" }}>
              {Number(day.date.slice(8, 10))}
            </span>
            <span
              aria-hidden="true"
              className="font-semibold uppercase leading-none whitespace-nowrap"
              style={{
                fontFamily: "var(--rbr-font-ui)",
                color: active ? DAY_CHIP_COLORS.activeText : DAY_CHIP_COLORS.label,
                ...dayLabelTypography(dayLabel ?? ""),
              }}
            >
              {dayLabel ?? " "}
            </span>
            <span
              aria-hidden="true"
              data-today-dot={today ? "true" : undefined}
              className="w-1 h-1 rounded-full mt-0.5"
              style={{ background: today ? (active ? "currentColor" : "var(--rbr-primary)") : "transparent" }}
            />
          </button>
        );
      })}
    </div>
  );
}

/**
 * A single-day retreat (A5): a polished date header instead of a
 * one-chip navigator. Same tokens, same date sources.
 */
export function RetreatDayHeader({ day, locale, showToday }: { day: RetreatDay; locale: Locale; showToday: boolean }) {
  const { t } = createTranslator(locale);
  const today = showToday && day.isToday;
  return (
    <div className="px-4 mb-5">
      <div
        className="flex items-center gap-4 rounded-2xl px-4 py-3"
        style={{ background: "var(--rbr-cream)", border: "1px solid color-mix(in srgb, var(--rbr-sand) 60%, transparent)" }}
      >
        <div
          aria-hidden="true"
          className="shrink-0 w-[56px] h-[64px] flex flex-col items-center justify-center rounded-xl"
          style={{ background: "var(--rbr-navigation)", color: "var(--rbr-on-navigation)" }}
        >
          <span className="text-[10px] font-semibold tracking-wider uppercase leading-none" style={{ fontFamily: "var(--rbr-font-ui)" }}>
            {shortWeekdayName(weekdayIndexOf(day.date), locale)}
          </span>
          <span className="text-[22px] leading-none mt-1" style={{ fontFamily: "var(--rbr-font-display)" }}>
            {Number(day.date.slice(8, 10))}
          </span>
        </div>
        <div className="min-w-0 flex flex-col gap-1">
          {day.dayNumber !== null && (
            <span
              className="text-[10px] font-semibold tracking-[0.16em] uppercase"
              // Was --rbr-mist (3.06:1 on cream); see DAY_CHIP_COLORS.
              style={{ fontFamily: "var(--rbr-font-ui)", color: DAY_CHIP_COLORS.label }}
            >
              {t("flow", "dayN", { n: day.dayNumber })}
            </span>
          )}
          <h2 className="text-[17px] leading-snug" style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text)" }}>
            {formatLongDateLocalized(day.date, locale)}
          </h2>
        </div>
        {today && (
          <span
            data-today="true"
            className="ms-auto shrink-0 text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full"
            style={{ fontFamily: "var(--rbr-font-ui)", background: "var(--rbr-primary-soft)", color: "var(--rbr-primary-foreground)" }}
          >
            {t("common", "today")}
          </span>
        )}
      </div>
    </div>
  );
}
