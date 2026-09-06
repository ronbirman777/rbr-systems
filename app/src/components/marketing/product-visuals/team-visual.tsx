import Image from "next/image";

/**
 * Purpose-built marketing recreation of Time to Flow's Team screen,
 * rebuilt to match the supplied Facilitators reference: one large editorial
 * portrait card (name + role overlaid on the photo, specialty tags, a bio
 * excerpt), not circles with initials.
 *
 * DELIBERATE GAP: the photo here is real retreat/nature photography
 * (already vetted elsewhere on this site), not a facilitator portrait - I
 * have no consented photo of a real facilitator to attach a name and bio
 * to, and fabricating one would mean putting a real, identifiable
 * stranger's likeness on a public site under an invented identity, which
 * this project has avoided everywhere else. The card format, hierarchy and
 * typography match the reference exactly; only the photo itself is a
 * stand-in pending a real, rights-cleared facilitator photo.
 */
export function TeamVisual({
  name,
  role,
  tags,
  bio,
}: {
  name: string;
  role: string;
  tags: string[];
  bio: string;
}) {
  return (
    <div className="w-full h-full bg-idw-parchment flex flex-col p-3.5 gap-3 overflow-y-auto no-scrollbar">
      <div className="font-ui text-[9px] font-semibold uppercase tracking-[0.16em] text-idw-clay-text">
        Your Guides
      </div>
      <div className="font-editorial text-idw-forest text-xl leading-tight -mt-1">
        Meet the <span className="italic">Facilitators</span>
      </div>

      <div className="rounded-2xl overflow-hidden bg-white/70 shadow-sm">
        <div className="relative w-full aspect-[4/3]">
          <Image src="/marketing/problem-lotus.jpg" alt="" fill className="object-cover" sizes="400px" />
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
          <p className="font-ui text-idw-forest/60 text-[11px] leading-relaxed">{bio}</p>
        </div>
      </div>
    </div>
  );
}
