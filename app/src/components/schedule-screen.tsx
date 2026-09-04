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

function weekdayLabel(dateIso: string): { weekday: string; day: string } {
  const d = new Date(`${dateIso}T00:00:00`);
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
    day: d.toLocaleDateString(undefined, { day: "numeric" }),
  };
}

/**
 * The dedicated Schedule module renderer - a different question than
 * TodayScreen answers. Today is "what's now / what's next"; this is "what
 * is the whole program, browsable by day." Both read from the exact same
 * PublicScheduleItem[] (private schedule_items in the configurator preview,
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
  // Independent of nowIndex - a guest mid-session still wants to see what's
  // coming up next, not just what's happening right now.
  const nextIndex = isToday ? items.findIndex((i) => i.startTime > nowTime) : -1;

  return (
    <div
      style={{
        ...vars,
        background: "var(--rbr-background)",
        borderRadius: "var(--rbr-radius-lg)",
        padding: "var(--rbr-spacing-unit)",
        fontFamily: "var(--font-geist-sans), sans-serif",
      }}
      className="w-full h-full flex flex-col gap-4 overflow-hidden"
    >
      <div className="text-[10px] uppercase tracking-[0.16em] text-black/40 px-1">Schedule</div>

      {dates.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-1 shrink-0">
          {dates.map((d) => {
            const { weekday, day } = weekdayLabel(d);
            const selected = d === activeDate;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDate(d)}
                style={
                  selected
                    ? { background: "var(--rbr-primary)", color: "var(--rbr-on-primary)" }
                    : undefined
                }
                className={`shrink-0 rounded-xl px-3 py-2 text-center min-w-[52px] ${
                  selected ? "" : "text-black/50"
                }`}
              >
                <div className="text-[9px] uppercase tracking-wide opacity-80">{weekday}</div>
                <div className="text-sm font-medium mt-0.5 flex items-center justify-center gap-1">
                  {day}
                  {d === todayIso && (
                    <span
                      className="w-1 h-1 rounded-full"
                      style={{ background: selected ? "currentColor" : "var(--rbr-primary)" }}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div
        style={{ background: "var(--rbr-surface)", borderRadius: "var(--rbr-radius-md)" }}
        className="flex-1 overflow-y-auto p-3"
      >
        {items.length === 0 && (
          <div className="text-xs text-black/40 px-1 py-2">Nothing scheduled for this day.</div>
        )}
        <div className="flex flex-col gap-3">
          {items.map((item, i) => {
            const isNow = i === nowIndex;
            const isNext = i === nextIndex;
            return (
              <div key={i} className="flex gap-3">
                <div className="w-12 shrink-0 text-right pt-0.5">
                  <div className="text-xs font-medium text-black/70">{item.startTime}</div>
                  {item.endTime && <div className="text-[10px] text-black/35">{item.endTime}</div>}
                </div>
                <div
                  style={{
                    background: isNow ? "var(--rbr-primary)" : "transparent",
                    color: isNow ? "var(--rbr-on-primary)" : undefined,
                    borderRadius: "var(--rbr-radius-sm)",
                  }}
                  className={`flex-1 pb-3 ${isNow ? "px-3 py-2.5" : "border-l pl-3 border-black/10"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={!isNow ? { color: "var(--rbr-primary)" } : undefined}>
                      {item.title}
                    </span>
                    {isNow && (
                      <span className="text-[9px] font-semibold uppercase tracking-wide opacity-80">Now</span>
                    )}
                    {isNext && (
                      <span
                        className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                        style={{ background: "var(--rbr-secondary)", color: "var(--rbr-on-primary)" }}
                      >
                        Up next
                      </span>
                    )}
                    {item.category && (
                      <span className={`text-[9px] uppercase tracking-wide ${isNow ? "opacity-70" : "text-black/35"}`}>
                        {item.category}
                      </span>
                    )}
                  </div>
                  {(item.facilitator || item.location) && (
                    <div className={`text-xs mt-0.5 ${isNow ? "opacity-85" : "text-black/50"}`}>
                      {[item.facilitator, item.location].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  {item.description && (
                    <div className={`text-xs mt-1 leading-relaxed ${isNow ? "opacity-85" : "text-black/55"}`}>
                      {item.description}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
