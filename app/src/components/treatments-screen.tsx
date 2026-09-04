import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import type { DisplayTreatment } from "@/lib/modules/treatment";
import type { CSSProperties } from "react";

export type TreatmentsScreenProps = {
  brand: BrandConfig;
  treatments: DisplayTreatment[];
};

/**
 * The dedicated InnerDweS-controlled renderer for the "treatments" module.
 * Informational only in this slice - what it is, who provides it, how long
 * it takes, how to access or book it - deliberately not a booking flow
 * (see lib/modules/treatment.ts). Same organizer-content/InnerDweS-layout
 * split as every other module renderer.
 */
export function TreatmentsScreen({ brand, treatments }: TreatmentsScreenProps) {
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
      <div className="text-[10px] uppercase tracking-[0.16em] text-black/40 px-1">Treatments</div>
      {treatments.length === 0 && <div className="text-xs text-black/40 px-1">Nothing offered yet.</div>}
      {treatments.map((t, i) => (
        <div
          key={i}
          style={{ background: "var(--rbr-surface)", borderRadius: "var(--rbr-radius-md)" }}
          className="overflow-hidden flex gap-3"
        >
          {t.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.imageUrl} alt="" className="w-20 shrink-0 object-cover self-stretch" />
          ) : (
            <div className="w-20 shrink-0 self-stretch" style={{ background: "var(--rbr-secondary)" }} aria-hidden="true" />
          )}
          <div className="py-3 pr-3 flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="text-base font-serif" style={{ color: "var(--rbr-primary)" }}>
                {t.name}
              </div>
              {t.durationMinutes && (
                <span className="text-[9px] font-semibold uppercase tracking-wide text-black/45 shrink-0">
                  {t.durationMinutes} min
                </span>
              )}
            </div>
            {t.shortDescription && <div className="text-xs text-black/55 mt-0.5">{t.shortDescription}</div>}
            {(t.provider || t.location) && (
              <div className="text-[10px] text-black/40 mt-1">
                {[t.provider, t.location].filter(Boolean).join(" · ")}
              </div>
            )}
            {t.description && <div className="text-xs text-black/60 mt-1.5 leading-relaxed">{t.description}</div>}
            {t.bookingInfo && (
              <div
                className="text-[10px] mt-2 px-2 py-1 rounded-md inline-block"
                style={{ background: "var(--rbr-background)", color: "var(--rbr-primary)" }}
              >
                {t.bookingInfo}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
