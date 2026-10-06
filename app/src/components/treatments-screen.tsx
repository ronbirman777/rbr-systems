"use client";

import { useState } from "react";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import type { DisplayTreatment } from "@/lib/modules/treatment";
import { ClockIcon } from "./guest/icons";
import { objectPositionStyle } from "@/lib/modules/imagePosition";
import type { CSSProperties } from "react";

import { createTranslator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { BrandImage } from "@/components/shared/brand-image";
import { FLOW_SIZES } from "./flow-media-sizes";
export type TreatmentsScreenProps = {
  brand: BrandConfig;
  treatments: DisplayTreatment[];
  /** The Space's system language. */
  locale?: Locale;
};

/**
 * Visual Fidelity Phase 1 - ported from the approved Figma source's
 * TreatmentsScreen: photo header with a duration badge, expand/collapse
 * description, and the booking guidance ("Book at reception" etc.)
 * presented as guidance, not a real booking flow - matching the data
 * model exactly (bookingInfo is informational free text; there is no
 * booking engine here, none was ever asked for).
 */

export function TreatmentsScreen({ brand, treatments, locale = DEFAULT_LOCALE }: TreatmentsScreenProps) {
  const { t: tr } = createTranslator(locale);
  const vars = deriveThemeVars(brand) as CSSProperties;
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div style={vars} className="flex-1 overflow-y-auto no-scrollbar">
      <div className="px-6 pt-7 pb-5">
        <p className="text-[10px] tracking-[0.18em] uppercase font-medium mb-1" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
          {tr("flow", "eyebrowTreatments")}
        </p>
        <h1 className="text-[24px] font-normal" style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text)" }}>
          {tr("flow", "treatments")}
        </h1>
      </div>

      {treatments.length === 0 && (
        <div className="px-6 text-xs" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
          {tr("flow", "nothingAddedYet")}
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
                  <BrandImage
                    src={t.imageUrl}
                    alt={t.name}
                    className="w-full h-full"
                    sizes={FLOW_SIZES.frame}
                    style={{ objectPosition: objectPositionStyle(t.imagePosition) }}
                    fallback="linear-gradient(160deg, var(--rbr-primary), var(--rbr-primary-dark))"
                  />
                ) : (
                  <div className="w-full h-full" style={{ background: `linear-gradient(160deg, var(--rbr-primary), var(--rbr-primary-dark))` }} />
                )}
                <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.5), transparent 60%)" }} />
                <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between gap-3">
                  <h3 dir="auto" className="text-white text-[20px] leading-snug" style={{ fontFamily: "var(--rbr-font-display)" }}>
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
                      aria-expanded={isOpen}
                      className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium hover:opacity-70 transition-opacity min-h-11"
                      style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-text-muted)" }}
                    >
                      {isOpen ? tr("flow", "showLess") : tr("flow", "readMore")}
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
                {/* TASK 029 (D1) - Treatments & Extras. Price and charge
                    type read as one line because that is one fact: "700
                    THB, extra". Understated on purpose - this is a
                    retreat app, not a shop, and nothing here is a
                    checkout. */}
                {(t.price !== null || t.chargeType || t.availability) && (
                  <div
                    className="mt-3 pt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1"
                    style={{ borderTop: "1px solid color-mix(in srgb, var(--rbr-sand) 50%, transparent)" }}
                  >
                    {t.price !== null && (
                      <span
                        className="text-[14px] font-medium tabular-nums"
                        style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-text)" }}
                      >
                        {/* Printed as the organizer typed it. No
                            Intl.NumberFormat: that needs a real ISO-4217
                            code, and `currency` here is deliberately
                            free text (see treatment.ts) so an organizer
                            in any country can name their own. */}
                        {[String(t.price), t.currency].filter(Boolean).join(" ")}
                      </span>
                    )}
                    {t.chargeType && (
                      <span
                        className="text-[10px] px-2.5 py-1 rounded-full font-medium tracking-wide"
                        style={{
                          fontFamily: "var(--rbr-font-ui)",
                          background:
                            t.chargeType === "included" ? "var(--rbr-primary-soft)" : "var(--rbr-parchment-deep)",
                          color:
                            t.chargeType === "included" ? "var(--rbr-text-on-primary-soft)" : "var(--rbr-text-muted)",
                        }}
                      >
                        {t.chargeType === "included" ? tr("flow", "chargeIncluded") : tr("flow", "chargeAdditional")}
                      </span>
                    )}
                    {t.availability && (
                      <span
                        dir="auto"
                        className="text-[11.5px] w-full"
                        style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}
                      >
                        {t.availability}
                      </span>
                    )}
                  </div>
                )}
                {t.bookingInfo && (
                  <div
                    className="mt-3 pt-3 flex items-center justify-between"
                    style={{ borderTop: "1px solid color-mix(in srgb, var(--rbr-sand) 50%, transparent)" }}
                  >
                    <span className="text-[11px]" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
                      {tr("flow", "toBook")}
                    </span>
                    <span dir="auto"
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
