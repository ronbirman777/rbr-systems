"use client";

import { useState } from "react";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import type { DisplayTreatment } from "@/lib/modules/treatment";
import { ClockIcon } from "./guest/icons";
import type { CSSProperties } from "react";

export type TreatmentsScreenProps = {
  brand: BrandConfig;
  treatments: DisplayTreatment[];
};

/**
 * Visual Fidelity Phase 1 - ported from the approved Figma source's
 * TreatmentsScreen: photo header with a duration badge, expand/collapse
 * description, and the booking guidance ("Book at reception" etc.)
 * presented as guidance, not a real booking flow - matching the data
 * model exactly (bookingInfo is informational free text; there is no
 * booking engine here, none was ever asked for).
 */
export function TreatmentsScreen({ brand, treatments }: TreatmentsScreenProps) {
  const vars = deriveThemeVars(brand) as CSSProperties;
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div style={vars} className="flex-1 overflow-y-auto no-scrollbar">
      <div className="px-6 pt-7 pb-5">
        <p className="text-[10px] tracking-[0.18em] uppercase font-medium mb-1" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
          Bodywork & Healing
        </p>
        <h1 className="text-[24px] font-normal" style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text)" }}>
          Treatments
        </h1>
      </div>

      {treatments.length === 0 && (
        <div className="px-6 text-xs" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
          Nothing added yet.
        </div>
      )}

      <div className="px-4 pb-10 space-y-4">
        {treatments.map((t, i) => {
          const isOpen = expanded === i;
          const description = t.description ?? t.shortDescription;
          return (
            <div
              key={i}
              className="rounded-3xl overflow-hidden shadow-sm"
              style={{ background: "var(--rbr-cream)", border: "1px solid color-mix(in srgb, var(--rbr-sand) 30%, transparent)" }}
            >
              <div className="relative h-[200px]">
                {t.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.imageUrl} alt={t.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full" style={{ background: `linear-gradient(160deg, var(--rbr-primary), var(--rbr-primary-dark))` }} />
                )}
                <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.5), transparent 60%)" }} />
                <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between gap-3">
                  <h3 className="text-white text-[20px] leading-snug" style={{ fontFamily: "var(--rbr-font-display)" }}>
                    {t.name}
                  </h3>
                  {t.durationMinutes && (
                    <div
                      className="flex items-center gap-1 rounded-full px-2.5 py-1 shrink-0"
                      style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(4px)" }}
                    >
                      <ClockIcon style={{ color: "rgba(255,255,255,0.8)" }} />
                      <span className="text-white text-[11px] font-medium" style={{ fontFamily: "var(--rbr-font-ui)" }}>
                        {t.durationMinutes} min
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="p-4">
                {description && (
                  <>
                    <p
                      className={`text-[13px] leading-relaxed ${isOpen ? "" : "line-clamp-2"}`}
                      style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-dusk)" }}
                    >
                      {description}
                    </p>
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : i)}
                      className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium hover:opacity-70 transition-opacity"
                      style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-text-muted)" }}
                    >
                      {isOpen ? "Show less" : "Read more"}
                      <svg
                        className={`w-3 h-3 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </>
                )}
                {t.bookingInfo && (
                  <div
                    className="mt-3 pt-3 flex items-center justify-between"
                    style={{ borderTop: "1px solid color-mix(in srgb, var(--rbr-sand) 50%, transparent)" }}
                  >
                    <span className="text-[11px]" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
                      To book
                    </span>
                    <span
                      className="text-[10px] px-3 py-1.5 rounded-full font-medium tracking-wide"
                      style={{ fontFamily: "var(--rbr-font-ui)", background: "var(--rbr-parchment-deep)", color: "var(--rbr-text)" }}
                    >
                      {t.bookingInfo}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
