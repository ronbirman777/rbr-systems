import { GuestNav } from "./guest-nav";

/**
 * Purpose-built marketing recreation of Time to Flow's Meals screen. No
 * approved Meals photography exists at the quality bar the rest of this
 * site holds itself to - per explicit direction, no photograph is better
 * than a weak one, so this uses a restrained graphical treatment (a soft
 * Sage/Parchment wash + a simple line-art botanical motif) in the same
 * card position/typography a photo would occupy, rather than compressing
 * into a plain text list. Ready to receive real photography later without
 * any layout change.
 */
function BotanicalWash() {
  return (
    <svg viewBox="0 0 400 300" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="mv-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#EBE1D5" />
          <stop offset="100%" stopColor="#BAC5B2" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#mv-bg)" />
      <g opacity="0.5" stroke="#192B21" strokeWidth="1.5" fill="none" strokeLinecap="round">
        <path d="M60 250 C90 180 120 150 90 90" />
        <path d="M90 90 C110 100 130 95 140 70" />
        <path d="M90 90 C70 100 50 95 40 70" />
        <path d="M320 240 C300 190 300 150 340 110" />
        <path d="M340 110 C355 120 375 118 385 100" />
        <path d="M340 110 C325 125 305 122 292 105" />
      </g>
    </svg>
  );
}

export function MealsVisual({
  category,
  name,
  time,
  location,
  showNav = true,
}: {
  category: string;
  name: string;
  time: string;
  location: string;
  showNav?: boolean;
}) {
  return (
    <div className="w-full h-full bg-idw-parchment flex flex-col">
      <div className="flex-1 overflow-y-auto no-scrollbar p-3.5 gap-3 flex flex-col">
        <div className="font-ui text-[10px] font-semibold uppercase tracking-[0.16em] text-idw-forest/40">
          Meals
        </div>
        <div className="relative w-full flex-1 rounded-2xl overflow-hidden shadow-sm">
          <BotanicalWash />
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(25,43,33,0) 55%, rgba(25,43,33,0.55) 100%)" }}
          />
          <div className="absolute bottom-3.5 left-4 right-4">
            <div className="font-ui text-[9px] font-semibold uppercase tracking-[0.14em] text-idw-parchment/80">
              {category}
            </div>
            <div className="font-editorial italic text-idw-parchment text-xl leading-tight mt-0.5">{name}</div>
            <div className="font-ui text-idw-parchment/80 text-[10px] mt-1">
              {time} · {location}
            </div>
          </div>
        </div>
      </div>

      {showNav && <GuestNav active="Explore" />}
    </div>
  );
}
