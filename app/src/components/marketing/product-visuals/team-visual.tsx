import Image from "next/image";
import { GuestNav } from "./guest-nav";

/**
 * Purpose-built marketing recreation of Time to Flow's Team screen,
 * matching the supplied Facilitators reference: one large editorial
 * portrait card (name + role overlaid on the image, restrained context
 * pills, a short factual description), not circles with initials or a
 * synthetic silhouette.
 *
 * The portrait is Ron's own photo (already used publicly on the old RBR
 * About Me section) - explicit permission given for this specific reuse.
 * Only professional information already established by the site's own
 * About copy is shown here - no invented therapist/yoga-teacher/clinical
 * credentials.
 */
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
            <Image
              src="/marketing/product/facilitator-ron.webp"
              alt="Ron Birman"
              fill
              className="object-cover"
              sizes="400px"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{ background: "linear-gradient(180deg, rgba(25,43,33,0.05) 40%, rgba(25,43,33,0.8) 100%)" }}
            />
            <div className="absolute bottom-3 left-3.5 right-3">
              <div className="font-editorial text-idw-parchment text-lg leading-tight">{name}</div>
              <div className="font-ui text-idw-parchment/70 text-[9px] font-semibold uppercase tracking-wide mt-0.5">
                {role}
              </div>
            </div>
          </div>
          <div className="p-3.5 flex flex-col gap-2.5">
            {tags.length > 0 && (
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
            )}
            {bio && <p className="font-ui text-idw-forest/60 text-[11px] leading-relaxed">{bio}</p>}
          </div>
        </div>
      </div>

      {showNav && <GuestNav active="Team" />}
    </div>
  );
}
