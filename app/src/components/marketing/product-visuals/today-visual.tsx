/**
 * Purpose-built marketing recreation of the Time to Flow "Today" screen -
 * not the real TodayScreen component (see today-screen.tsx for that; it's
 * used untouched in Retreat Identity, where authenticity matters more than
 * polish). This one exists because the real component's minimal styling
 * couldn't carry the premium showcase/Hero treatment without editing
 * product code, which is out of scope. Matches the Figma reference's
 * information hierarchy (date capsule, current-item accent bar) but in
 * InnerDweS's light product direction: cream/linen surfaces, Forest for
 * typography/accents only, Clay for the current-item highlight - never a
 * dark screen background.
 */
export type TodayVisualItem = {
  time: string;
  title: string;
  meta: string;
  current?: boolean;
};

export function TodayVisual({
  retreatName,
  dayLabel,
  items,
}: {
  retreatName: string;
  dayLabel: string;
  items: TodayVisualItem[];
}) {
  return (
    <div className="w-full h-full bg-idw-parchment flex flex-col gap-3 p-3.5 overflow-y-auto no-scrollbar">
      <div className="inline-flex self-start items-center rounded-full bg-idw-clay text-idw-parchment font-ui text-[10px] font-semibold uppercase tracking-wide px-3 py-1.5">
        {dayLabel}
      </div>
      <div className="font-editorial italic text-idw-forest text-lg leading-tight">
        {retreatName}
      </div>
      <div className="flex flex-col gap-2 mt-1">
        {items.map((item, i) => (
          <div
            key={i}
            className={`rounded-xl px-3.5 py-3 flex flex-col gap-0.5 ${
              item.current ? "bg-idw-clay/10 border-l-[3px] border-idw-clay" : "bg-white/70 border-l-[3px] border-transparent"
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-editorial text-idw-forest text-[15px] leading-snug">{item.title}</span>
              <span className="font-ui text-idw-forest/45 text-[11px] shrink-0">{item.time}</span>
            </div>
            <span className="font-ui text-idw-forest/50 text-[11px]">{item.meta}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
