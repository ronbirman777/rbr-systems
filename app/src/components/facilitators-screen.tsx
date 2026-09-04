import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import type { DisplayFacilitator } from "@/lib/modules/facilitator";
import type { CSSProperties } from "react";

export type FacilitatorsScreenProps = {
  brand: BrandConfig;
  facilitators: DisplayFacilitator[];
};

/**
 * The dedicated InnerDweS-controlled renderer for the "facilitators"
 * module - same principle as TodayScreen: the organizer supplies content
 * and brand tokens, we own every pixel of layout. Used identically by the
 * configurator's live preview and the published guest app.
 */
export function FacilitatorsScreen({ brand, facilitators }: FacilitatorsScreenProps) {
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
      <div className="text-[10px] uppercase tracking-[0.16em] text-black/40 px-1">
        Facilitators
      </div>
      {facilitators.length === 0 && (
        <div className="text-xs text-black/40 px-1">No facilitators added yet.</div>
      )}
      {facilitators.map((f, i) => (
        <div
          key={i}
          style={{ background: "var(--rbr-surface)", borderRadius: "var(--rbr-radius-md)" }}
          className="p-3 flex gap-3.5 items-start"
        >
          {f.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={f.imageUrl}
              alt={f.name}
              className="w-14 h-14 shrink-0 object-cover"
              style={{ borderRadius: "var(--rbr-radius-sm)" }}
            />
          ) : (
            <div
              className="w-14 h-14 rounded-full shrink-0"
              style={{ background: "var(--rbr-secondary)" }}
              aria-hidden="true"
            />
          )}
          <div className="pt-0.5">
            <div className="text-base font-serif" style={{ color: "var(--rbr-primary)" }}>
              {f.name}
            </div>
            {f.role && <div className="text-xs text-black/50 mt-0.5">{f.role}</div>}
            {f.bio && <div className="text-xs text-black/60 mt-1.5 leading-relaxed">{f.bio}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
