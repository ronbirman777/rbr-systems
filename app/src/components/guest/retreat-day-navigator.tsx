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
 * Each chip is the Teach chip: localized short weekday, date number and -
 * as in Teach - a dot when the day has something scheduled. TASK 033
 * addendum D aligned the strip (20px edge padding, the selected chip kept
 * in view without re-centring, the selected day's date line under the
 * strip in schedule-screen.tsx); the UX follow-up ("continue the day
 * navigator work") aligned the chip itself: 52px wide, py-2, filled cream
 * surface with Teach's hairline (#E6DDCD-equivalent), selected = filled
 * navigation colour, 10px weekday + 19px date, no "DAY n" line - "Day n"
 * now lives only in the date line ("Wed 14 Oct · Day 2") and in each
 * chip's accessible name.
 * Today (which Teach does not mark) is a solid text-colour ring on its
 * chip instead of the dot, so the dot means the same thing in both
 * products.
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
 *   unselected   weekday            --rbr-text-subtle  on --rbr-cream
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
  /**
   * The unselected chip's hairline: Teach's --tt-line (#E6DDCD) expressed in
   * Flow's fixed base tokens (55% sand into cream = #E6DDCB). Decorative -
   * the chip is identified by its text, not by this edge.
   */
  line: "color-mix(in srgb, var(--rbr-sand) 55%, var(--rbr-cream))",
  outOfRangeSurface: "var(--rbr-background)",
  label: "var(--rbr-text-subtle)",
  number: "var(--rbr-text)",
  activeSurface: "var(--rbr-navigation)",
  activeText: "var(--rbr-on-navigation)",
} as const;

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
    // "nearest", like a guest scrolling it into view - the strip does not
    // jump to centre the chip when it is already visible (Teach never moves
    // its strip at all; Flow keeps the selected/today chip in view).
    el.scrollIntoView({ behavior, block: "nearest", inline: "nearest" });
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
      className="flex gap-2 overflow-x-auto no-scrollbar px-5 scroll-px-5 pb-1 overscroll-x-contain"
    >
      {days.map((day, i) => {
        const active = i === selectedIndex;
        const today = showToday && day.isToday;
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
            data-has-activities={day.hasActivities ? "true" : undefined}
            onClick={() => onSelect(day.date)}
            className="shrink-0 w-[52px] py-2 min-w-11 min-h-11 flex flex-col items-center gap-0.5 rounded-2xl transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            data-outside-range={dimmed ? "true" : undefined}
            style={{
              background: active ? DAY_CHIP_COLORS.activeSurface : dimmed ? DAY_CHIP_COLORS.outOfRangeSurface : DAY_CHIP_COLORS.surface,
              color: active ? DAY_CHIP_COLORS.activeText : DAY_CHIP_COLORS.number,
              border: active
                ? "1px solid transparent"
                : today
                  ? `1px solid ${DAY_CHIP_COLORS.number}`
                  : dimmed
                    ? "1px dashed var(--rbr-sand)"
                    : `1px solid ${DAY_CHIP_COLORS.line}`,
              // Today while selected: a ring outside the chip, in the page
              // background then the selected surface, so it reads on any palette.
              boxShadow: active && today ? `0 0 0 2px var(--rbr-background), 0 0 0 3px ${DAY_CHIP_COLORS.activeSurface}` : undefined,
              outlineColor: "var(--rbr-primary)",
            }}
          >
            <span
              aria-hidden="true"
              className="text-[10px] font-semibold tracking-wider uppercase"
              style={{ fontFamily: "var(--rbr-font-ui)", color: active ? DAY_CHIP_COLORS.activeText : DAY_CHIP_COLORS.label }}
            >
              {shortWeekdayName(weekdayIndexOf(day.date), locale)}
            </span>
            <span aria-hidden="true" className="text-[19px]" style={{ fontFamily: "var(--rbr-font-display)" }}>
              {Number(day.date.slice(8, 10))}
            </span>
            <span
              aria-hidden="true"
              data-activity-dot={day.hasActivities ? "true" : undefined}
              className="w-1 h-1 rounded-full"
              style={{ background: day.hasActivities ? (active ? "currentColor" : "var(--rbr-primary)") : "transparent" }}
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
