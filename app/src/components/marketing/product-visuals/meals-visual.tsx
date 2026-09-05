/**
 * Purpose-built marketing recreation of Time to Flow's Meals screen - see
 * today-visual.tsx for why. Matches Figma's text-forward meal cards (no
 * photography in the reference); the "current" meal gets a soft Clay-tinted
 * block, same pattern as Today, instead of a badge on every row.
 */
export type MealsVisualItem = {
  mealType: string;
  time: string;
  name: string;
  location: string;
  description: string;
  current?: boolean;
};

export function MealsVisual({ items }: { items: MealsVisualItem[] }) {
  return (
    <div className="w-full h-full bg-idw-parchment flex flex-col gap-3 p-3.5 overflow-y-auto no-scrollbar">
      <div className="font-ui text-[10px] font-semibold uppercase tracking-[0.16em] text-idw-forest/40">
        Meals
      </div>
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <div
            key={i}
            className={`rounded-xl px-3.5 py-3 ${item.current ? "bg-idw-clay/10" : "bg-white/70"}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-ui text-[9px] font-semibold uppercase tracking-wide text-idw-clay-text">
                {item.mealType}
              </span>
              <span className="font-ui text-idw-forest/40 text-[10px]">{item.time}</span>
            </div>
            <div className="font-editorial text-idw-forest text-[15px] leading-snug mt-1">{item.name}</div>
            <div className="font-ui text-idw-forest/45 text-[11px] mt-0.5">{item.location}</div>
            <div className="font-ui text-idw-forest/55 text-[11px] mt-1 leading-relaxed">{item.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
