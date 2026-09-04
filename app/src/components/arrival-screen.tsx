import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import type { ArrivalInfo } from "@/lib/modules/arrival";
import type { CSSProperties } from "react";

export type ArrivalScreenProps = {
  brand: BrandConfig;
  info: ArrivalInfo;
};

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--rbr-surface)", borderRadius: "var(--rbr-radius-md)" }} className="p-3">
      <div className="text-[9px] uppercase tracking-[0.16em] text-black/40">{label}</div>
      <div className="text-xs text-black/65 mt-1 leading-relaxed whitespace-pre-line">{children}</div>
    </div>
  );
}

/**
 * The dedicated InnerDweS-controlled renderer for the singleton
 * "arrivalInfo" module (module_settings, not module_items) - presented as
 * a structured arrival guide (welcome, key facts, then labeled sections),
 * not one giant text block, even though the underlying content is mostly
 * free text.
 */
export function ArrivalScreen({ brand, info }: ArrivalScreenProps) {
  const vars = deriveThemeVars(brand) as CSSProperties;
  const hasContact = info.contactName || info.contactPhone || info.contactWhatsapp;

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
      <div className="text-[10px] uppercase tracking-[0.16em] text-black/40 px-1">Arrival</div>

      {info.welcomeMessage && (
        <div
          style={{
            background: "var(--rbr-primary)",
            color: "var(--rbr-on-primary)",
            borderRadius: "var(--rbr-radius-md)",
          }}
          className="p-3"
        >
          <div className="text-sm font-serif leading-relaxed">{info.welcomeMessage}</div>
        </div>
      )}

      {(info.checkInTime || info.checkOutTime) && (
        <div className="flex gap-3">
          {info.checkInTime && (
            <div style={{ background: "var(--rbr-surface)", borderRadius: "var(--rbr-radius-md)" }} className="flex-1 p-3">
              <div className="text-[9px] uppercase tracking-[0.16em] text-black/40">Check-in</div>
              <div className="text-sm font-medium mt-0.5" style={{ color: "var(--rbr-primary)" }}>
                {info.checkInTime}
              </div>
            </div>
          )}
          {info.checkOutTime && (
            <div style={{ background: "var(--rbr-surface)", borderRadius: "var(--rbr-radius-md)" }} className="flex-1 p-3">
              <div className="text-[9px] uppercase tracking-[0.16em] text-black/40">Check-out</div>
              <div className="text-sm font-medium mt-0.5" style={{ color: "var(--rbr-primary)" }}>
                {info.checkOutTime}
              </div>
            </div>
          )}
        </div>
      )}

      {(info.address || info.mapUrl) && (
        <div style={{ background: "var(--rbr-surface)", borderRadius: "var(--rbr-radius-md)" }} className="p-3">
          <div className="text-[9px] uppercase tracking-[0.16em] text-black/40">Address</div>
          {info.address && <div className="text-xs text-black/65 mt-1 leading-relaxed">{info.address}</div>}
          {info.mapUrl && (
            <a
              href={info.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium underline mt-1.5 inline-block"
              style={{ color: "var(--rbr-primary)" }}
            >
              Open in Maps →
            </a>
          )}
        </div>
      )}

      {info.transportationInfo && <Section label="Getting here">{info.transportationInfo}</Section>}
      {info.arrivalInstructions && <Section label="On arrival">{info.arrivalInstructions}</Section>}
      {info.whatToBring && <Section label="What to bring">{info.whatToBring}</Section>}
      {info.importantNotes && <Section label="Important notes">{info.importantNotes}</Section>}

      {hasContact && (
        <div style={{ background: "var(--rbr-surface)", borderRadius: "var(--rbr-radius-md)" }} className="p-3">
          <div className="text-[9px] uppercase tracking-[0.16em] text-black/40">Contact</div>
          {info.contactName && <div className="text-xs text-black/65 mt-1">{info.contactName}</div>}
          <div className="flex gap-3 mt-1">
            {info.contactPhone && (
              <a href={`tel:${info.contactPhone}`} className="text-xs font-medium underline" style={{ color: "var(--rbr-primary)" }}>
                Call
              </a>
            )}
            {info.contactWhatsapp && (
              <a
                href={`https://wa.me/${info.contactWhatsapp.replace(/[^\d]/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium underline"
                style={{ color: "var(--rbr-primary)" }}
              >
                WhatsApp
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
