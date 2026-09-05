/**
 * Purpose-built marketing recreation of Time to Flow's Schedule screen -
 * see today-visual.tsx for why this isn't the real ScheduleScreen. Matches
 * Figma's day-tab + time-blocked-list composition; light cream surfaces
 * throughout, one small Sage or Clay category tag per row (never stacked
 * badges), Forest reserved for the selected day tab and typography.
 */
export type ScheduleVisualDay = { label: string; day: string; selected?: boolean };
export type ScheduleVisualItem = { time: string; title: string; meta: string; tag: string; tagTone: "sage" | "clay" };

export function ScheduleVisual({
  days,
  items,
}: {
  days: ScheduleVisualDay[];
  items: ScheduleVisualItem[];
}) {
  return (
    <div className="w-full h-full bg-idw-parchment flex flex-col gap-3 p-3.5 overflow-y-auto no-scrollbar">
      <div className="font-ui text-[10px] font-semibold uppercase tracking-[0.16em] text-idw-forest/40">
        Schedule
      </div>
      <div className="flex gap-1.5">
        {days.map((d) => (
          <div
            key={d.day}
            className={`flex-1 rounded-lg py-1.5 text-center ${
              d.selected ? "bg-idw-forest text-idw-parchment" : "bg-white/70 text-idw-forest/50"
            }`}
          >
            <div className="font-ui text-[8px] uppercase tracking-wide opacity-80">{d.label}</div>
            <div className="font-ui text-[12px] font-medium">{d.day}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 mt-1">
        {items.map((item, i) => (
          <div key={i} className="rounded-xl bg-white/70 px-3.5 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-editorial text-idw-forest text-[15px] leading-snug">{item.title}</div>
                <div className="font-ui text-idw-forest/50 text-[11px] mt-0.5">{item.meta}</div>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className="font-ui text-idw-forest/45 text-[11px]">{item.time}</span>
                <span
                  className={`font-ui text-[9px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                    item.tagTone === "sage" ? "bg-idw-sage/40 text-idw-forest" : "bg-idw-clay/15 text-idw-clay-text"
                  }`}
                >
                  {item.tag}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
