import Image from "next/image";
import { GuestNav } from "./guest-nav";

/**
 * Purpose-built marketing recreation of the Time to Flow "Today" screen,
 * rebuilt to match the supplied product reference screenshot closely: photo
 * header with an editorial greeting, an intention card that overlaps the
 * hero photo's lower edge, one "Happening Now" card in Deep Forest (the ONE
 * deliberate dark surface, spotlighting the live item), a peeking "Up Next"
 * card, and the persistent bottom navigation present in every supplied
 * reference screen. Shows fewer, larger elements rather than compressing
 * many rows, per the marketing-scale rule.
 */
const RADIUS_CLASS = {
  soft: { card: "rounded-xl", live: "rounded-xl" },
  sharp: { card: "rounded-md", live: "rounded-md" },
  generous: { card: "rounded-[1.5rem]", live: "rounded-[1.5rem]" },
} as const;

const ACCENT_CLASS = {
  clay: { pill: "bg-idw-clay text-idw-parchment", dot: "bg-idw-clay" },
  sage: { pill: "bg-idw-sage text-idw-forest", dot: "bg-idw-sage" },
  "clay-text": { pill: "bg-idw-clay-text text-idw-parchment", dot: "bg-idw-clay-text" },
} as const;

export function TodayVisual({
  guestName,
  dayLabel,
  intention,
  live,
  upNext,
  photoSrc = "/marketing/hero-pathway.jpg",
  photoFilter = "saturate(0.9) brightness(0.7)",
  radius = "soft",
  accent = "clay",
  showNav = true,
}: {
  guestName: string;
  dayLabel: string;
  intention: string;
  live: { category: string; title: string; time: string; facilitator: string; location: string };
  upNext?: { title: string; time: string };
  /** Retreat Identity varies these three per example - real theme axes
   * (imagery, radius, accent), not an invented capability. */
  photoSrc?: string;
  photoFilter?: string;
  radius?: keyof typeof RADIUS_CLASS;
  accent?: keyof typeof ACCENT_CLASS;
  showNav?: boolean;
}) {
  const r = RADIUS_CLASS[radius];
  const a = ACCENT_CLASS[accent];
  return (
    <div className="w-full h-full bg-idw-parchment flex flex-col">
      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="relative w-full aspect-[4/3] shrink-0">
          <Image
            src={photoSrc}
            alt=""
            fill
            className="object-cover"
            style={{ filter: photoFilter }}
            sizes="400px"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(25,43,33,0.15) 0%, rgba(25,43,33,0.7) 100%)" }}
          />
          <div className="absolute top-3 left-3 font-ui text-[9px] font-semibold uppercase tracking-[0.14em] text-idw-parchment/70">
            InnerDweS · Time to Flow
          </div>
          <div className="absolute bottom-7 left-3.5 right-3">
            <div className="font-editorial text-idw-parchment text-2xl leading-tight">
              Good morning, <span className="italic">{guestName}</span>
            </div>
            <div className="font-ui text-idw-parchment/70 text-[10px] mt-1">{dayLabel}</div>
          </div>
        </div>

        {/* Intention card deliberately overlaps the photo's lower edge (negative
            margin), matching the reference rather than sitting fully below it. */}
        <div className="px-3.5 -mt-5 relative z-10">
          <div className={`${r.card} bg-white px-4 py-3.5 shadow-[0_8px_24px_-8px_rgba(25,43,33,0.25)]`}>
            <p className="font-editorial italic text-idw-forest text-[14px] leading-snug">&ldquo;{intention}&rdquo;</p>
            <div className="font-ui text-[9px] font-semibold uppercase tracking-wide text-idw-forest/40 mt-2">
              — Today&apos;s Intention
            </div>
          </div>
        </div>

        <div className="p-3.5 pt-3 flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5 font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-idw-forest/50">
            <span className={`w-1.5 h-1.5 rounded-full ${a.dot}`} />
            Happening Now
          </div>

          <div className={`${r.live} bg-idw-forest text-idw-parchment px-4 py-3.5 shadow-md`}>
            <div className="flex items-center justify-between">
              <span className="font-ui text-[9px] font-semibold uppercase tracking-wide text-idw-parchment/50">
                {live.category}
              </span>
              <span className={`font-ui text-[9px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${a.pill}`}>
                Live
              </span>
            </div>
            <div className="font-editorial text-idw-parchment text-lg leading-snug mt-1.5">{live.title}</div>
            <div className="font-ui text-idw-parchment/60 text-[11px] mt-0.5">{live.time}</div>
            <div className="h-px bg-idw-parchment/15 my-2.5" />
            <div className="font-ui text-idw-parchment/70 text-[11px] flex items-center gap-3">
              <span>{live.facilitator}</span>
              <span className="text-idw-parchment/40">·</span>
              <span>{live.location}</span>
            </div>
          </div>

          {upNext && (
            <>
              <div className="font-ui text-[9px] font-semibold uppercase tracking-[0.14em] text-idw-forest/35 mt-1">
                Up Next
              </div>
              {/* Peeking card - clipped to a sliver, matching the reference's
                  partial next-item treatment rather than a text caption. */}
              <div className={`${r.card} h-11 overflow-hidden bg-white/70 px-4 py-3.5`}>
                <div className="flex items-center justify-between">
                  <span className="font-editorial text-idw-forest text-[14px] leading-none">{upNext.title}</span>
                  <span className="font-ui text-idw-forest/40 text-[11px]">{upNext.time}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showNav && <GuestNav active="Today" />}
    </div>
  );
}
