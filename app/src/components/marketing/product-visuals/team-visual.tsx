import { GuestNav } from "./guest-nav";

/**
 * Purpose-built marketing recreation of Time to Flow's Team screen,
 * matching the supplied Facilitators reference: one large editorial
 * portrait card (name + role overlaid on the image, specialty tags, a bio
 * excerpt), not circles with initials.
 *
 * The portrait is a deliberately synthetic illustration - soft abstract
 * gradient + line-art silhouette, not a photograph - so it cannot be
 * mistaken for or imply any specific real person. This is marketing demo
 * content only, isolated in this one component so it's trivial to swap for
 * approved facilitator photography later without touching layout/typography.
 */
function SyntheticPortrait() {
  return (
    <svg viewBox="0 0 400 300" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="tv-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#BAC5B2" />
          <stop offset="100%" stopColor="#192B21" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#tv-bg)" />
      {/* Abstract line-art bust silhouette - deliberately not photorealistic */}
      <g opacity="0.85" stroke="#F3EFE7" strokeWidth="2" fill="none" strokeLinecap="round">
        <circle cx="200" cy="150" r="46" />
        <path d="M120 320 C120 240 150 210 200 210 C250 210 280 240 280 320" />
      </g>
    </svg>
  );
}

export function TeamVisual({
  name,
  role,
  tags,
  bio,
  showNav = true,
}: {
  name: string;
  role: string;
  tags: string[];
  bio: string;
  showNav?: boolean;
}) {
  return (
    <div className="w-full h-full bg-idw-parchment flex flex-col">
      <div className="flex-1 overflow-y-auto no-scrollbar p-3.5 gap-3 flex flex-col">
        <div className="font-ui text-[9px] font-semibold uppercase tracking-[0.16em] text-idw-clay-text">
          Your Guides
        </div>
        <div className="font-editorial text-idw-forest text-xl leading-tight -mt-1">
          Meet the <span className="italic">Facilitators</span>
        </div>

        <div className="rounded-2xl overflow-hidden bg-white/70 shadow-sm">
          <div className="relative w-full aspect-[4/3]">
            <SyntheticPortrait />
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{ background: "linear-gradient(180deg, rgba(25,43,33,0.05) 40%, rgba(25,43,33,0.75) 100%)" }}
            />
            <div className="absolute bottom-3 left-3.5 right-3">
              <div className="font-editorial text-idw-parchment text-lg leading-tight">{name}</div>
              <div className="font-ui text-idw-parchment/70 text-[9px] font-semibold uppercase tracking-wide mt-0.5">
                {role}
              </div>
            </div>
          </div>
          <div className="p-3.5 flex flex-col gap-2.5">
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="font-ui text-[9px] font-medium text-idw-forest bg-idw-sage/35 rounded-full px-2.5 py-1"
                >
                  {tag}
                </span>
              ))}
            </div>
            {bio && <p className="font-ui text-idw-forest/60 text-[11px] leading-relaxed">{bio}</p>}
          </div>
        </div>
      </div>

      {showNav && <GuestNav active="Team" />}
    </div>
  );
}
