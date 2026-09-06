import Image from "next/image";
import { GuestNav } from "./guest-nav";

/**
 * Purpose-built marketing recreation of Time to Flow's Treatments screen,
 * matching the Explore/Facilities reference's immersive-photography
 * treatment: one large photo card with an editorial title and calm
 * metadata, not a compressed text list. Real treatment-session photography
 * (framed to keep the recipient's face out of shot).
 */
export function TreatmentsVisual({
  name,
  detail,
  booking,
  showNav = true,
}: {
  name: string;
  detail: string;
  booking: string;
  showNav?: boolean;
}) {
  return (
    <div className="w-full h-full bg-idw-parchment flex flex-col">
      <div className="flex-1 overflow-y-auto no-scrollbar p-3.5 gap-3 flex flex-col">
        <div className="font-ui text-[10px] font-semibold uppercase tracking-[0.16em] text-idw-forest/40">
          Treatments
        </div>
        <div className="relative w-full flex-1 rounded-2xl overflow-hidden shadow-sm">
          <Image
            src="/marketing/product/treatment-session.jpg"
            alt=""
            fill
            className="object-cover [filter:saturate(0.95)_brightness(0.85)]"
            sizes="400px"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(25,43,33,0) 40%, rgba(25,43,33,0.8) 100%)" }}
          />
          <div className="absolute top-3 left-3.5 font-ui text-[9px] font-semibold uppercase tracking-[0.14em] text-idw-parchment/70">
            Bodywork &amp; Healing
          </div>
          <div className="absolute bottom-3.5 left-4 right-4">
            <div className="font-editorial italic text-idw-parchment text-xl leading-tight">{name}</div>
            <div className="font-ui text-idw-parchment/70 text-[10px] mt-1">{detail}</div>
            <div className="font-ui text-[9px] font-semibold uppercase tracking-wide text-idw-clay bg-idw-parchment/15 inline-block px-2 py-0.5 rounded-full mt-2">
              {booking}
            </div>
          </div>
        </div>
      </div>

      {showNav && <GuestNav active="Explore" />}
    </div>
  );
}
