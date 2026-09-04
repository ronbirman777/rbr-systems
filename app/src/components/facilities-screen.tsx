import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import type { DisplayFacility } from "@/lib/modules/facility";
import type { CSSProperties } from "react";

export type FacilitiesScreenProps = {
  brand: BrandConfig;
  facilities: DisplayFacility[];
};

/**
 * The dedicated InnerDweS-controlled renderer for the "facilities" module -
 * wide banner photos so the space feels browsable at a glance (Pool,
 * Sauna, Yoga Shala...) rather than a text list. No real-time status in
 * this slice, just calm, visual information. Same organizer-content /
 * InnerDweS-layout split as every other module renderer.
 */
export function FacilitiesScreen({ brand, facilities }: FacilitiesScreenProps) {
  const vars = deriveThemeVars(brand) as CSSProperties;

  return (
    <div
      style={{
        ...vars,
        background: "var(--rbr-background)",
        borderRadius: "var(--rbr-radius-lg)",
        padding: "var(--rbr-spacing-unit)",
        fontFamily: "var(--font-geist-sans), sans-serif",
      }}
      className="w-full h-full flex flex-col gap-3 overflow-y-auto"
    >
      <div className="text-[10px] uppercase tracking-[0.16em] text-black/40 px-1">Facilities</div>
      {facilities.length === 0 && <div className="text-xs text-black/40 px-1">Nothing added yet.</div>}
      {facilities.map((f, i) => (
        <div
          key={i}
          style={{ background: "var(--rbr-surface)", borderRadius: "var(--rbr-radius-md)" }}
          className="overflow-hidden"
        >
          {f.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.imageUrl} alt="" className="w-full h-24 object-cover" />
          ) : (
            <div className="w-full h-24" style={{ background: "var(--rbr-secondary)" }} aria-hidden="true" />
          )}
          <div className="p-3">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-base font-serif" style={{ color: "var(--rbr-primary)" }}>
                {f.name}
              </div>
              {f.openingHours && <span className="text-[10px] text-black/45 shrink-0">{f.openingHours}</span>}
            </div>
            {f.location && <div className="text-[10px] text-black/40 mt-0.5">{f.location}</div>}
            {f.description && <div className="text-xs text-black/60 mt-1.5 leading-relaxed">{f.description}</div>}
            {f.importantInfo && (
              <div className="text-[10px] text-black/50 mt-2 italic">{f.importantInfo}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
