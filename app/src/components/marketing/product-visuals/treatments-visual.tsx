/**
 * Purpose-built marketing recreation of Time to Flow's Treatments screen -
 * see today-visual.tsx for why. Text-forward cards matching Figma, a small
 * Sage/Clay booking-status tag per row.
 */
export type TreatmentsVisualItem = {
  name: string;
  detail: string;
  booking: string;
  tagTone: "sage" | "clay";
};

export function TreatmentsVisual({ items }: { items: TreatmentsVisualItem[] }) {
  return (
    <div className="w-full h-full bg-idw-parchment flex flex-col gap-3 p-3.5 overflow-y-auto no-scrollbar">
      <div className="font-ui text-[10px] font-semibold uppercase tracking-[0.16em] text-idw-forest/40">
        Treatments
      </div>
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <div key={i} className="rounded-xl bg-white/70 px-3.5 py-3">
            <div className="font-editorial text-idw-forest text-[15px] leading-snug">{item.name}</div>
            <div className="font-ui text-idw-forest/50 text-[11px] mt-0.5">{item.detail}</div>
            <span
              className={`inline-block mt-2 font-ui text-[9px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                item.tagTone === "sage" ? "bg-idw-sage/40 text-idw-forest" : "bg-idw-clay/15 text-idw-clay-text"
              }`}
            >
              {item.booking}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
