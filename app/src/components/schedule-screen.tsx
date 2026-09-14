"use client";

import { useMemo, useState } from "react";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import type { PublicScheduleItem } from "@/lib/schedule/types";
import type { CSSProperties } from "react";

export type ScheduleScreenProps = {
  brand: BrandConfig;
  schedule: PublicScheduleItem[];
  todayIso: string;
  /** "HH:MM" in the Space timezone, for "now" / "up next" context. */
  nowTime: string;
};

// Every category chip derives from the organizer's own Primary/Accent -
// alternating between the two brand-derived soft/foreground pairs for
// visual variety, never a fixed Forest/Sage/Clay text color. "Meal" stays
// a neutral sand tone deliberately - not every tag needs to compete for
// brand emphasis.
const CATEGORY_CHIP_STYLE: Record<string, { background: string; color: string }> = {
  Meditation: { background: "var(--rbr-primary-soft)", color: "var(--rbr-primary-foreground)" },
  Yoga: { background: "var(--rbr-primary-soft)", color: "var(--rbr-primary-foreground)" },
  Breathwork: { background: "var(--rbr-secondary-soft)", color: "var(--rbr-secondary-foreground)" },
  Meal: { background: "color-mix(in srgb, var(--rbr-sand) 50%, transparent)", color: "var(--rbr-dusk)" },
  Sound: { background: "var(--rbr-secondary-soft)", color: "var(--rbr-secondary-foreground)" },
  Community: { background: "var(--rbr-primary-soft)", color: "var(--rbr-primary-foreground)" },
};
const DEFAULT_CHIP_STYLE = { background: "color-mix(in srgb, var(--rbr-sand) 50%, transparent)", color: "var(--rbr-dusk)" };

function weekdayLabel(dateIso: string): { weekday: string; day: string } {
  const d = new Date(`${dateIso}T00:00:00`);
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
    day: d.toLocaleDateString(undefined, { day: "numeric" }),
  };
}

/**
 * Visual Fidelity Phase 1 - ported from the approved Figma source's
 * ScheduleScreen: day strip + a genuine connecting timeline rail with a
 * status dot per session (now/next/past/later), the "now" item getting a
 * full primary-color card rather than a colored border strip. Same
 * brand-color mapping rule as TodayScreen: Figma's "forest" accent fills
 * -> --rbr-primary (tenant-driven); neutral text/surfaces -> the fixed
 * --rbr-* base palette. Both read from the exact same PublicScheduleItem[]
 * (private schedule_items in the configurator preview,
 * published_spaces.modules.schedule for guests) - there is no second
 * source of schedule truth, only a second way of looking at the same one.
 */
export function ScheduleScreen({ brand, schedule, todayIso, nowTime }: ScheduleScreenProps) {
  const vars = deriveThemeVars(brand) as CSSProperties;

  const dates = useMemo(() => {
    const unique = Array.from(new Set(schedule.map((i) => i.date))).sort();
    return unique;
  }, [schedule]);

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (dates.includes(todayIso)) return todayIso;
    const upcoming = dates.find((d) => d >= todayIso);
    return upcoming ?? dates[0] ?? todayIso;
  });

  const activeDate = dates.includes(selectedDate) ? selectedDate : (dates[0] ?? todayIso);

  const items = useMemo(
    () =>
      schedule
        .filter((i) => i.date === activeDate)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [schedule, activeDate]
  );

  const isToday = activeDate === todayIso;
  const nowIndex = isToday
    ? items.findIndex((i) => i.startTime <= nowTime && (!i.endTime || i.endTime > nowTime))
    : -1;
  const nextIndex = isToday ? items.findIndex((i) => i.startTime > nowTime) : -1;

  return (
    <div style={vars} className="flex-1 overflow-y-auto no-scrollbar">
      <div className="px-6 pt-8 pb-5">
        <h1 className="text-[26px] font-normal" style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text)" }}>
          Schedule
        </h1>
      </div>

      {dates.length > 1 && (
        <div className="px-4 mb-5">
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {dates.map((d) => {
              const active = d === activeDate;
              const { weekday, day } = weekdayLabel(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelectedDate(d)}
                  className="flex-shrink-0 flex flex-col items-center justify-center w-[52px] h-[64px] rounded-2xl transition-all"
                  style={
                    active
                      ? { background: "var(--rbr-navigation)", color: "var(--rbr-on-navigation)", boxShadow: "0 4px 12px rgba(0,0,0,0.12)" }
                      : { background: "var(--rbr-cream)", color: "var(--rbr-dusk)", border: "1px solid color-mix(in srgb, var(--rbr-sand) 60%, transparent)" }
                  }
                >
                  <span
                    className="text-[9px] tracking-widest uppercase font-semibold"
                    style={{
                      fontFamily: "var(--rbr-font-ui)",
                      opacity: active ? 0.75 : 1,
                      color: active ? "var(--rbr-on-navigation)" : "var(--rbr-mist)",
                    }}
                  >
                    {weekday}
                  </span>
                  <span className="text-[22px] leading-none mt-0.5 font-light" style={{ fontFamily: "var(--rbr-font-display)" }}>
                    {day}
                  </span>
                  {active && <div className="w-1 h-1 rounded-full mt-1" style={{ background: "var(--rbr-secondary)" }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-4 pb-10">
        {items.length === 0 && (
          <div className="text-xs px-1 py-2" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
            Nothing scheduled for this day.
          </div>
        )}
        <div className="flex flex-col">
          {items.map((item, i) => {
            const isPast = isToday && item.endTime !== null && item.endTime <= nowTime;
            const isNow = i === nowIndex;
            const isNext = i === nextIndex;
            const dotBackground = isNow
              ? "var(--rbr-secondary)"
              : isNext
                ? "var(--rbr-primary)"
                : "var(--rbr-sand)";
            const chip = item.category ? (CATEGORY_CHIP_STYLE[item.category] ?? DEFAULT_CHIP_STYLE) : null;

            return (
              <div key={`${item.date}-${item.startTime}-${item.title}`} className={`flex gap-3 ${isPast ? "opacity-40" : ""}`}>
                <div className="w-11 flex-shrink-0 pt-4 text-right">
                  <span
                    className="text-[11px] font-medium tabular-nums leading-none"
                    style={{ fontFamily: "var(--rbr-font-ui)", color: isNow ? "var(--rbr-secondary)" : "var(--rbr-mist)" }}
                  >
                    {item.startTime}
                  </span>
                </div>
                <div className="flex flex-col items-center pt-4">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={
                      isNow
                        ? { background: dotBackground, boxShadow: "0 0 0 2px color-mix(in srgb, var(--rbr-secondary) 25%, transparent)" }
                        : { background: dotBackground }
                    }
                  />
                  {i < items.length - 1 && (
                    <div className="w-px flex-1 mt-1 min-h-[20px]" style={{ background: "color-mix(in srgb, var(--rbr-sand) 60%, transparent)" }} />
                  )}
                </div>
                <div
                  className="flex-1 mb-1.5 rounded-[18px] p-4"
                  style={
                    isNow
                      ? { background: "var(--rbr-primary)", color: "var(--rbr-on-primary)", boxShadow: "0 6px 24px rgba(45,74,62,0.18)" }
                      : { background: "var(--rbr-cream)", border: "1px solid var(--rbr-primary-border)" }
                  }
                >
                  {isNow && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "var(--rbr-secondary)" }} />
                      <span
                        className="text-[9px] tracking-[0.22em] uppercase font-semibold"
                        style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-on-primary)", opacity: 0.85 }}
                      >
                        Now
                      </span>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <h3
                        className="text-[16px] leading-snug"
                        style={{ fontFamily: "var(--rbr-font-display)", color: isNow ? "var(--rbr-on-primary)" : "var(--rbr-text)" }}
                      >
                        {item.title}
                      </h3>
                      {item.facilitator && (
                        <p
                          className="text-[11px] mt-0.5"
                          style={{ fontFamily: "var(--rbr-font-ui)", color: isNow ? "color-mix(in srgb, var(--rbr-on-primary) 55%, transparent)" : "var(--rbr-dusk)" }}
                        >
                          {item.facilitator}
                        </p>
                      )}
                      {(item.location || item.endTime) && (
                        <div
                          className="flex items-center gap-2 mt-2 flex-wrap text-[10px]"
                          style={{ fontFamily: "var(--rbr-font-ui)", color: isNow ? "color-mix(in srgb, var(--rbr-on-primary) 45%, transparent)" : "var(--rbr-mist)" }}
                        >
                          {item.location && <span>{item.location}</span>}
                          {item.endTime && <span>· until {item.endTime}</span>}
                        </div>
                      )}
                    </div>
                    {item.category && chip && (
                      <span
                        className="flex-shrink-0 text-[9px] px-2.5 py-0.5 rounded-full tracking-widest font-medium uppercase mt-0.5"
                        style={{
                          fontFamily: "var(--rbr-font-ui)",
                          background: isNow ? "color-mix(in srgb, var(--rbr-on-primary) 20%, transparent)" : chip.background,
                          color: isNow ? "var(--rbr-on-primary)" : chip.color,
                        }}
                      >
                        {item.category}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
