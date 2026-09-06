import Image from "next/image";

/**
 * Purpose-built marketing recreation of Time to Flow's Meals screen,
 * rebuilt to match the Explore-style photography-forward treatment: one
 * large immersive photo card (real retreat food photography, not a stock
 * substitute) with an editorial title overlay, rather than compressed text
 * rows. A single beautiful card reads as premium; three tiny ones read as
 * cheap - the marketing-scale rule this whole pass is about.
 */
export function MealsVisual({
  category,
  name,
  time,
  location,
}: {
  category: string;
  name: string;
  time: string;
  location: string;
}) {
  return (
    <div className="w-full h-full bg-idw-parchment flex flex-col p-3.5 gap-3">
      <div className="font-ui text-[10px] font-semibold uppercase tracking-[0.16em] text-idw-forest/40">
        Meals
      </div>
      <div className="relative w-full flex-1 rounded-2xl overflow-hidden shadow-sm">
        <Image
          src="/marketing/product/meals-spread.jpg"
          alt=""
          fill
          className="object-cover"
          sizes="400px"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: "linear-gradient(180deg, rgba(25,43,33,0) 45%, rgba(25,43,33,0.75) 100%)" }}
        />
        <div className="absolute bottom-3.5 left-4 right-4">
          <div className="font-ui text-[9px] font-semibold uppercase tracking-[0.14em] text-idw-parchment/70">
            {category}
          </div>
          <div className="font-editorial italic text-idw-parchment text-xl leading-tight mt-0.5">{name}</div>
          <div className="font-ui text-idw-parchment/70 text-[10px] mt-1">
            {time} · {location}
          </div>
        </div>
      </div>
    </div>
  );
}
