"use client";

import { useState } from "react";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import type { ArrivalInfo } from "@/lib/modules/arrival";
import { PinIcon } from "./guest/icons";
import type { CSSProperties } from "react";
import { telUrl } from "@/lib/phone";
import { whatsappUrl } from "@/lib/share/whatsapp";

import { createTranslator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
export type ArrivalScreenProps = {
  brand: BrandConfig;
  info: ArrivalInfo;
  /** The Space's system language. */
  locale?: Locale;
};

/**
 * TASK 029 (decision B): `whatToBring` and `welcomeMessage` are NOT here
 * any more.
 *
 * Both moved to Retreat Home, which resolves the canonical value and the
 * legacy one and renders exactly one of them (see retreatProfile.ts and
 * guest-app.tsx). Leaving them on this screen too was a real duplication
 * that Staging Preview QA caught: a Space with a canonical list AND a
 * legacy string showed the canonical list on Home and the legacy string
 * again here, which is the two-versions-of-one-thing the decision exists
 * to prevent.
 *
 * The stored legacy values are untouched - nothing is migrated or
 * deleted, they are simply read from one place now.
 */
const ACCORDION_SECTIONS: { key: keyof ArrivalInfo; labelKey: "gettingHere" | "onArrival" | "importantNotes" }[] = [
  { key: "transportationInfo", labelKey: "gettingHere" },
  { key: "arrivalInstructions", labelKey: "onArrival" },
  { key: "importantNotes", labelKey: "importantNotes" },
];

/**
 * Visual Fidelity Phase 1 - ported from the approved Figma source's
 * ArrivalScreen: check-in/check-out as a two-tile primary-color block
 * (not plain equal-weight cards), an address card with a real "Open in
 * Maps" action, icon-led Call/WhatsApp actions, and the four free-text
 * sections as a collapsible accordion instead of always-expanded cards -
 * this screen already had every field Figma needs (this batch's best-
 * matched screen, confirmed in the audit), so this is a pure visual
 * port, not a data-model change.
 */
export function ArrivalScreen({ brand, info, locale = DEFAULT_LOCALE }: ArrivalScreenProps) {
  const { t } = createTranslator(locale);
  const vars = deriveThemeVars(brand) as CSSProperties;
  const [open, setOpen] = useState<string | null>(null);
  // Links go through the shared builders (lib/phone, lib/share/whatsapp)
  // rather than being assembled here: a stored value that cannot produce
  // a working link now renders no button at all, instead of a dead one.
  const callHref = telUrl(info.contactPhone);
  const whatsappHref = whatsappUrl(info.contactWhatsapp);
  const hasContact = callHref || whatsappHref;
  const hasStats = info.checkInTime || info.checkOutTime;
  const hasAddress = info.address || info.mapUrl;
  const visibleSections = ACCORDION_SECTIONS.filter((s) => info[s.key]);

  const hasAnyContent = hasStats || hasAddress || hasContact || visibleSections.length > 0;

  return (
    <div style={vars} className="flex-1 overflow-y-auto no-scrollbar">
      <div className="px-6 pt-7 pb-5">
        <p className="text-[10px] tracking-[0.18em] uppercase font-medium mb-1" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
          {t("flow", "practicalInformation")}
        </p>
        <h1 className="text-[24px] font-normal" style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text)" }}>
          {t("flow", "arrivalInfo")}
        </h1>
      </div>

      {!hasAnyContent && (
        <div className="px-6 text-xs" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
          {t("flow", "nothingYet")}
        </div>
      )}

      <div className="px-4 pb-10 space-y-3">
        {hasStats && (
          <div className="rounded-3xl p-5 grid grid-cols-2 gap-3" style={{ background: "var(--rbr-primary)" }}>
            {info.checkInTime && (
              <div className="rounded-2xl p-3.5" style={{ background: "color-mix(in srgb, var(--rbr-on-primary) 10%, transparent)" }}>
                <p
                  className="text-[9px] tracking-[0.2em] uppercase font-medium"
                  style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-on-primary)", opacity: 0.75 }}
                >
                  {t("flow", "checkIn")}
                </p>
                <p className="text-[22px] font-light mt-1" style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-on-primary)" }}>
                  {info.checkInTime}
                </p>
              </div>
            )}
            {info.checkOutTime && (
              <div className="rounded-2xl p-3.5" style={{ background: "color-mix(in srgb, var(--rbr-on-primary) 10%, transparent)" }}>
                <p
                  className="text-[9px] tracking-[0.2em] uppercase font-medium"
                  style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-on-primary)", opacity: 0.75 }}
                >
                  {t("flow", "checkOut")}
                </p>
                <p className="text-[22px] font-light mt-1" style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-on-primary)" }}>
                  {info.checkOutTime}
                </p>
              </div>
            )}
          </div>
        )}

        {hasAddress && (
          <div className="rounded-3xl p-4" style={{ background: "var(--rbr-cream)", border: "1px solid color-mix(in srgb, var(--rbr-sand) 40%, transparent)" }}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--rbr-parchment-deep)" }}>
                <PinIcon className="w-4 h-4" style={{ color: "var(--rbr-text)" }} />
              </div>
              <div className="flex-1">
                {info.address && (
                  <p dir="auto" className="text-[12px] leading-relaxed whitespace-pre-line" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-dusk)" }}>
                    {info.address}
                  </p>
                )}
                {info.mapUrl && (
                  <a
                    href={info.mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full font-medium"
                    style={{ fontFamily: "var(--rbr-font-ui)", background: "var(--rbr-primary)", color: "var(--rbr-on-primary)" }}
                  >
                    {t("flow", "openInMaps")}
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {hasContact && (
          <div className="rounded-3xl p-4" style={{ background: "var(--rbr-cream)", border: "1px solid color-mix(in srgb, var(--rbr-sand) 40%, transparent)" }}>
            <p className="text-[10px] tracking-[0.18em] uppercase font-medium mb-1" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
              {t("common", "contact")}
            </p>
            {info.contactName && (
              <p dir="auto" className="text-[12px] mb-2.5" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-dusk)" }}>
                {info.contactName}
              </p>
            )}
            <div className="flex gap-2">
              {callHref && (
                <a
                  href={callHref}
                  className="flex-1 flex items-center justify-center gap-2 rounded-2xl py-2.5"
                  style={{ background: "var(--rbr-parchment-deep)" }}
                >
                  <svg className="w-4 h-4" style={{ color: "var(--rbr-text)" }} fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                    />
                  </svg>
                  <span className="text-[12px] font-medium" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-text)" }}>
                    {t("flow", "call")}
                  </span>
                </a>
              )}
              {whatsappHref && (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 rounded-2xl py-2.5"
                  style={{ background: "var(--rbr-parchment-deep)" }}
                >
                  <svg className="w-4 h-4" style={{ color: "var(--rbr-text)" }} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  <span className="text-[12px] font-medium" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-text)" }}>
                    WhatsApp
                  </span>
                </a>
              )}
            </div>
          </div>
        )}

        {visibleSections.map((s) => {
          const isOpen = open === s.key;
          return (
            <div key={s.key} className="rounded-3xl overflow-hidden" style={{ background: "var(--rbr-cream)", border: "1px solid color-mix(in srgb, var(--rbr-sand) 40%, transparent)" }}>
              <button type="button" onClick={() => setOpen(isOpen ? null : s.key)} className="w-full flex items-center justify-between p-4">
                <span className="text-[14px] font-medium" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-text)" }}>
                  {t("flow", s.labelKey)}
                </span>
                <svg
                  className={`w-4 h-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  style={{ color: "var(--rbr-mist)" }}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isOpen && (
                <div className="px-5 pb-4">
                  <div className="w-full h-px mb-3" style={{ background: "color-mix(in srgb, var(--rbr-sand) 50%, transparent)" }} />
                  <p className="text-[13px] leading-relaxed whitespace-pre-line" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-dusk)" }}>
                    {info[s.key]}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
