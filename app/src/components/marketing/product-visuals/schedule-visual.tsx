/**
 * Purpose-built marketing recreation of Time to Flow's Schedule screen,
 * rebuilt to match the supplied product reference directly: day-pill
 * navigation, a vertical timeline (dot + connecting line), and the current
 * session spotlighted in Deep Forest exactly like Today's "Happening Now"
 * card - everything else stays cream/light. Fewer, larger session cards
 * rather than many compressed rows, per the marketing-scale rule.
 */
export type ScheduleVisualDay = { label: string; day: string; selected?: boolean };
export type ScheduleVisualSession = {
  time: string;
  title: string;
  meta: string;
  tag: string;
  state: "past" | "now" | "upcoming";
};

export function ScheduleVisual({
  retreatName,
  days,
  sessions,
}: {
  retreatName: string;
  days: ScheduleVisualDay[];
  sessions: ScheduleVisualSession[];
}) {
  return (
    <div className="w-full h-full bg-idw-parchment flex flex-col overflow-y-auto no-scrollbar p-3.5 gap-3.5">
      <div>
        <div className="font-editorial text-idw-forest text-xl leading-tight">Schedule</div>
        <div className="font-ui text-idw-forest/45 text-[10px] mt-0.5">{retreatName}</div>
      </div>

      <div className="flex gap-1.5">
        {days.map((d) => (
          <div
            key={d.day}
            className={`flex-1 rounded-lg py-1.5 text-center relative ${
              d.selected ? "bg-idw-forest text-idw-parchment" : "bg-white/70 text-idw-forest/45"
            }`}
          >
            <div className="font-ui text-[8px] uppercase tracking-wide opacity-80">{d.label}</div>
            <div className="font-ui text-[12px] font-medium">{d.day}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col relative pl-4">
        <div className="absolute left-[3px] top-2 bottom-2 w-px bg-idw-forest/12" aria-hidden="true" />
        {sessions.map((s, i) => (
          <div key={i} className="relative pb-3 last:pb-0">
            <span
              className={`absolute -left-4 top-1.5 w-[7px] h-[7px] rounded-full ${
                s.state === "now" ? "bg-idw-clay" : s.state === "upcoming" ? "bg-idw-sage" : "bg-idw-forest/20"
              }`}
            />
            <div
              className={`rounded-xl px-3.5 py-3 ${
                s.state === "now" ? "bg-idw-forest text-idw-parchment shadow-md" : "bg-white/70"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className={s.state === "past" ? "opacity-50" : ""}>
                  <div
                    className={`font-editorial text-[14px] leading-snug ${
                      s.state === "now" ? "text-idw-parchment" : "text-idw-forest"
                    }`}
                  >
                    {s.title}
                  </div>
                  <div className={`font-ui text-[10px] mt-0.5 ${s.state === "now" ? "text-idw-parchment/60" : "text-idw-forest/45"}`}>
                    {s.meta}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`font-ui text-[10px] ${s.state === "now" ? "text-idw-parchment/70" : "text-idw-forest/40"}`}>
                    {s.time}
                  </span>
                  <span
                    className={`font-ui text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                      s.state === "now"
                        ? "bg-idw-clay text-idw-parchment"
                        : "bg-idw-sage/35 text-idw-forest/70"
                    }`}
                  >
                    {s.tag}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
