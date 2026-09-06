/**
 * Persistent bottom navigation shared by every marketing product-visual
 * screen - present in every one of the supplied Time to Flow reference
 * screenshots (Today/Schedule/Team/Explore), and previously missing from
 * every marketing recreation. Minimal line icons, Clay active state with a
 * small underline, matching the reference's treatment.
 */
const ICONS = {
  Today: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8L6 18M18 6l1.8-1.8" strokeLinecap="round" />
    </svg>
  ),
  Schedule: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" strokeLinecap="round" />
    </svg>
  ),
  Team: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" strokeLinecap="round" />
      <circle cx="17" cy="9.5" r="2.3" />
      <path d="M15.2 19c.1-2.3 1.9-4 4.3-4" strokeLinecap="round" />
    </svg>
  ),
  Explore: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.2 8.8l-2 4.4-4.4 2 2-4.4 4.4-2z" strokeLinejoin="round" />
    </svg>
  ),
} as const;

export type GuestNavTab = keyof typeof ICONS;

export function GuestNav({ active }: { active: GuestNavTab }) {
  return (
    <div className="shrink-0 bg-idw-parchment border-t border-idw-forest/8 px-2 pt-2.5 pb-3 flex items-center justify-around">
      {(Object.keys(ICONS) as GuestNavTab[]).map((tab) => {
        const isActive = tab === active;
        return (
          <div key={tab} className="flex flex-col items-center gap-1">
            <div className={isActive ? "text-idw-clay" : "text-idw-forest/35"}>{ICONS[tab]}</div>
            <span className={`font-ui text-[8px] font-medium ${isActive ? "text-idw-clay" : "text-idw-forest/35"}`}>
              {tab}
            </span>
            {isActive && <span className="w-3 h-[2px] rounded-full bg-idw-clay" aria-hidden="true" />}
          </div>
        );
      })}
    </div>
  );
}
