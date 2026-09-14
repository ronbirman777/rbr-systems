import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import type { DisplayFacility } from "@/lib/modules/facility";
import { PinIcon, ClockIcon } from "./guest/icons";
import type { CSSProperties } from "react";

export type FacilitiesScreenProps = {
  brand: BrandConfig;
  facilities: DisplayFacility[];
};

/**
 * Visual Fidelity Phase 1 - ported from the approved Figma source's
 * FacilitiesScreen: the first facility gets a taller hero treatment
 * (220px) than the rest (160px) - matching Figma's varied-height rhythm,
 * generalized the same way as MealsScreen (first item featured, not a
 * fixed 4-item layout).
 */
export function FacilitiesScreen({ brand, facilities }: FacilitiesScreenProps) {
  const vars = deriveThemeVars(brand) as CSSProperties;

  return (
    <div style={vars} className="flex-1 overflow-y-auto no-scrollbar">
      <div className="px-6 pt-7 pb-5">
        <p className="text-[10px] tracking-[0.18em] uppercase font-medium mb-1" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
          Spaces & Amenities
        </p>
        <h1 className="text-[24px] font-normal" style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text)" }}>
          Facilities
        </h1>
      </div>

      {facilities.length === 0 && (
        <div className="px-6 text-xs" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
          Nothing added yet.
        </div>
      )}

      <div className="px-4 pb-10 space-y-3">
        {facilities.map((f, i) => (
          <div
            key={i}
            className="rounded-3xl overflow-hidden shadow-sm"
            style={{ background: "var(--rbr-cream)", border: "1px solid color-mix(in srgb, var(--rbr-sand) 30%, transparent)" }}
          >
            <div className={`relative ${i === 0 ? "h-[220px]" : "h-[160px]"}`}>
              {f.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.imageUrl} alt={f.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full" style={{ background: `linear-gradient(160deg, var(--rbr-primary), var(--rbr-primary-dark))` }} />
              )}
              <div className="absolute inset-0" style={{ background: "linear-gradient(to top, color-mix(in srgb, var(--rbr-primary-dark) 70%, transparent), transparent 60%)" }} />
              <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-white text-[20px] leading-snug" style={{ fontFamily: "var(--rbr-font-display)" }}>
                    {f.name}
                  </h3>
                  {f.location && (
                    <span className="flex items-center gap-1 text-white/55 text-[10px] mt-0.5" style={{ fontFamily: "var(--rbr-font-ui)" }}>
                      <PinIcon style={{ color: "rgba(255,255,255,0.55)" }} />
                      {f.location}
                    </span>
                  )}
                </div>
                {f.openingHours && (
                  <div
                    className="flex items-center gap-1 rounded-full px-2.5 py-1 shrink-0"
                    style={{ background: "rgba(0,0,0,0.2)", backdropFilter: "blur(4px)" }}
                  >
                    <ClockIcon style={{ color: "rgba(255,255,255,0.7)" }} />
                    <span className="text-white text-[10px] font-medium" style={{ fontFamily: "var(--rbr-font-ui)" }}>
                      {f.openingHours}
                    </span>
                  </div>
                )}
              </div>
            </div>
            {f.description && (
              <div className="px-4 py-3.5">
                <p className="text-[12px] leading-relaxed" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-dusk)" }}>
                  {f.description}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
