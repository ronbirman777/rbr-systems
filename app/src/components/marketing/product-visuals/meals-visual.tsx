import { GuestNav } from "./guest-nav";

/**
 * Purpose-built marketing recreation of Time to Flow's Meals screen. No
 * approved Meals photography exists at the quality bar this site holds
 * itself to, so this is a genuinely finished, photography-free interface
 * (not a placeholder waiting for an image) - editorial title, time,
 * location, description and dietary tags on a premium cream surface, with
 * a restrained Sage/Clay rule as the only decorative element.
 */
export function MealsVisual({
  category,
  name,
  time,
  location,
  description,
  tags,
  showNav = true,
}: {
  category: string;
  name: string;
  time: string;
  location: string;
  description: string;
  tags: string[];
  showNav?: boolean;
}) {
  return (
    <div className="w-full h-full bg-idw-parchment flex flex-col">
      <div className="flex-1 overflow-y-auto no-scrollbar p-3.5 gap-3 flex flex-col">
        <div className="font-ui text-[10px] font-semibold uppercase tracking-[0.16em] text-idw-forest/40">
          Meals
        </div>

        <div className="rounded-2xl bg-white shadow-sm px-5 py-6 flex-1 flex flex-col">
          <div className="font-ui text-[9px] font-semibold uppercase tracking-[0.14em] text-idw-clay-text">
            {category}
          </div>
          <div className="font-editorial italic text-idw-forest text-2xl leading-tight mt-2">{name}</div>

          <div className="w-8 h-px bg-idw-sage my-3.5" aria-hidden="true" />

          <div className="font-ui text-idw-forest/55 text-[11px]">
            {time} · {location}
          </div>
          <p className="font-ui text-idw-forest/65 text-[12px] leading-relaxed mt-3">{description}</p>

          <div className="flex flex-wrap gap-1.5 mt-auto pt-4">
            {tags.map((tag) => (
              <span
                key={tag}
                className="font-ui text-[9px] font-medium text-idw-forest bg-idw-sage/35 rounded-full px-2.5 py-1"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {showNav && <GuestNav active="Explore" />}
    </div>
  );
}
