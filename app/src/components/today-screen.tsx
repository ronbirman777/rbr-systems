import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import { todaysItems, upcomingItems, type PublicScheduleItem } from "@/lib/schedule/types";
import type { CSSProperties } from "react";

export type TodayScreenProps = {
  tenantName: string;
  brand: BrandConfig;
  schedule: PublicScheduleItem[];
  /** ISO date ("YYYY-MM-DD"), passed explicitly so server and client render
   * identically rather than each calling `new Date()` independently. */
  todayIso: string;
  /** Present only when the Schedule module is enabled - Today answers "what's
   * now / what's next", Schedule answers "what's the whole program"; this is
   * the one deliberate cross-link between those two different questions. */
  onViewSchedule?: () => void;
};

/**
 * The one real, data-driven screen this pass proves the preview-engine
 * architecture with: the exact same component renders inside the
 * configurator's live-preview pane (fed by the private schedule_items table)
 * and the public guest route (fed by the published_spaces snapshot). Same
 * component, same props shape - no screenshots, no drift.
 */
export function TodayScreen({ tenantName, brand, schedule, todayIso, onViewSchedule }: TodayScreenProps) {
  const vars = deriveThemeVars(brand) as CSSProperties;
  const today = todaysItems(schedule, todayIso);
  const upcoming = upcomingItems(schedule, todayIso, 3);

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
      <div
        style={{
          background: "var(--rbr-primary)",
          color: "var(--rbr-on-primary)",
          borderRadius: "var(--rbr-radius-md)",
          padding: "var(--rbr-spacing-unit)",
        }}
      >
        <div className="text-[10px] uppercase tracking-[0.16em] opacity-70">
          Today&apos;s Briefing
        </div>
        <div className="text-xl font-serif mt-1">Good morning.</div>
        <div className="text-xs opacity-80 mt-1">{tenantName || "Your space"}</div>
      </div>

      <div
        style={{
          background: "var(--rbr-surface)",
          borderRadius: "var(--rbr-radius-md)",
          padding: "var(--rbr-spacing-unit)",
        }}
        className="flex-1 overflow-y-auto"
      >
        <div className="text-[10px] uppercase tracking-[0.16em] text-black/40">
          {today.length ? "Happening Today" : "Coming Up"}
        </div>
        {(today.length ? today : upcoming).length === 0 && (
          <div className="text-xs text-black/40 mt-2">Nothing scheduled yet.</div>
        )}
        <div className="flex flex-col gap-3 mt-2">
          {(today.length ? today : upcoming).map((item, i) => (
            <div key={i}>
              <div className="text-sm font-medium" style={{ color: "var(--rbr-primary)" }}>
                {item.title}
              </div>
              <div className="text-xs text-black/50 mt-0.5">
                {!today.length && item.date !== todayIso ? `${item.date} · ` : ""}
                {item.startTime}
                {item.location ? ` · ${item.location}` : ""}
              </div>
            </div>
          ))}
        </div>
        {onViewSchedule && (
          <button
            type="button"
            onClick={onViewSchedule}
            className="text-xs font-medium mt-3 underline"
            style={{ color: "var(--rbr-primary)" }}
          >
            Full schedule →
          </button>
        )}
      </div>
    </div>
  );
}
