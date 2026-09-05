/**
 * Purpose-built marketing recreation of Time to Flow's Team screen - see
 * today-visual.tsx for why. Matches Figma exactly here: solid-colored
 * circles with two-letter initials, not photographic portraits - which
 * conveniently sidesteps ever needing facilitator photography for this
 * showcase. Colors rotate through Clay/Forest/the darker Clay-text token
 * for variety without inventing new brand colors.
 */
export type TeamVisualPerson = { initials: string; name: string; role: string; color: "clay" | "forest" | "clay-text" };

const COLOR_CLASS: Record<TeamVisualPerson["color"], string> = {
  clay: "bg-idw-clay",
  forest: "bg-idw-forest",
  "clay-text": "bg-idw-clay-text",
};

export function TeamVisual({ people }: { people: TeamVisualPerson[] }) {
  return (
    <div className="w-full h-full bg-idw-parchment flex flex-col gap-3 p-3.5 overflow-y-auto no-scrollbar">
      <div className="font-ui text-[10px] font-semibold uppercase tracking-[0.16em] text-idw-forest/40">
        Team
      </div>
      <div className="flex flex-col gap-2">
        {people.map((p, i) => (
          <div key={i} className="rounded-xl bg-white/70 px-3.5 py-3 flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center font-ui text-[11px] font-semibold text-idw-parchment ${COLOR_CLASS[p.color]}`}
            >
              {p.initials}
            </div>
            <div className="min-w-0">
              <div className="font-editorial text-idw-forest text-[14px] leading-snug truncate">{p.name}</div>
              <div className="font-ui text-idw-forest/50 text-[11px] truncate">{p.role}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
