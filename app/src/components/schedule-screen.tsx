"use client";

import { useMemo, useState } from "react";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import { hasActivityExtras, type PublicScheduleItem } from "@/lib/schedule/types";
import type { CSSProperties } from "react";

import { createTranslator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
export type ScheduleScreenProps = {
  brand: BrandConfig;
  schedule: PublicScheduleItem[];
  todayIso: string;
  /** "HH:MM" in the Space timezone, for "now" / "up next" context. */
  nowTime: string;
  locale?: Locale;
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
export function ScheduleScreen({ brand, schedule, todayIso, nowTime, locale = DEFAULT_LOCALE }: ScheduleScreenProps) {
  const { t } = createTranslator(locale);
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
          {t("flow", "navSchedule")}
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
            {t("flow", "nothingScheduledDay")}
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
              <div dir="auto" key={`${item.date}-${item.startTime}-${item.title}`} className={`flex gap-3 ${isPast ? "opacity-40" : ""}`}>
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
                        {t("flow", "now")}
                      </span>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 dir="auto"
                        className="text-[16px] leading-snug"
                        style={{ fontFamily: "var(--rbr-font-display)", color: isNow ? "var(--rbr-on-primary)" : "var(--rbr-text)" }}
                      >
                        {item.title}
                      </h3>
                      {item.facilitator && (
                        <p dir="auto"
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
                          {item.location && <span dir="auto">{item.location}</span>}
                          {item.endTime && <span>· {t("flow", "untilTime", { time: item.endTime })}</span>}
                        </div>
                      )}
                      {/* TASK 029 (P5D): this activity's own extra
                          details, and ONLY when it has some. Collapsed,
                          because most sessions have none and a schedule
                          is read by scanning - a permanently expanded
                          list on one card would break that scan. */}
                      {hasActivityExtras(item) && (
                        <ActivityExtras item={item} isNow={isNow} locale={locale} />
                      )}
                    </div>
                    {item.category && chip && (
                      <span dir="auto"
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

/**
 * One activity's "what to bring / what to expect" (TASK 029, P5D).
 *
 * A disclosure rather than always-open: a retreat day has a dozen
 * sessions and a guest reads the schedule by scanning times and titles.
 * Two bullet lists on one card would defeat that, so they stay one tap
 * away - and the card gives no hint at all when there is nothing to
 * show, because `hasActivityExtras` gates the whole component.
 *
 * `aria-expanded` and `aria-controls` are on the button for the same
 * reason they are on the FAQ accordion: without them a screen reader
 * announces an unlabelled button next to some text.
 */
function ActivityExtras({
  item,
  isNow,
  locale,
}: {
  item: PublicScheduleItem;
  isNow: boolean;
  locale: Locale;
}) {
  const { t } = createTranslator(locale);
  const [open, setOpen] = useState(false);
  const id = `extras-${item.date}-${item.startTime}`.replace(/[^a-zA-Z0-9-]/g, "");
  const muted = isNow ? "color-mix(in srgb, var(--rbr-on-primary) 55%, transparent)" : "var(--rbr-mist)";
  const body = isNow ? "color-mix(in srgb, var(--rbr-on-primary) 80%, transparent)" : "var(--rbr-dusk)";

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="flex items-center gap-1.5 text-[10px] tracking-[0.14em] uppercase font-semibold min-h-11"
        style={{ fontFamily: "var(--rbr-font-ui)", color: muted }}
      >
        {t("flow", "extraDetails")}
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div id={id} className="mt-1.5 space-y-2.5">
          {item.whatToBring.length > 0 && (
            <ExtrasList title={t("flow", "whatToBring")} items={item.whatToBring} titleColor={muted} bodyColor={body} />
          )}
          {item.whatToExpect.length > 0 && (
            <ExtrasList title={t("flow", "whatToExpect")} items={item.whatToExpect} titleColor={muted} bodyColor={body} />
          )}
        </div>
      )}
    </div>
  );
}

function ExtrasList({
  title,
  items,
  titleColor,
  bodyColor,
}: {
  title: string;
  items: string[];
  titleColor: string;
  bodyColor: string;
}) {
  return (
    <div>
      <p
        className="text-[9.5px] tracking-[0.18em] uppercase font-semibold mb-1"
        style={{ fontFamily: "var(--rbr-font-ui)", color: titleColor }}
      >
        {title}
      </p>
      <ul className="space-y-1">
        {items.map((entry, i) => (
          <li key={i} className="flex gap-2 items-start">
            <span
              aria-hidden="true"
              className="w-1 h-1 rounded-full shrink-0 mt-[0.5em]"
              style={{ background: "currentColor", color: titleColor }}
            />
            <span
              dir="auto"
              className="text-[11.5px] leading-relaxed"
              style={{ fontFamily: "var(--rbr-font-ui)", color: bodyColor }}
            >
              {entry}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
