"use client";

import { useState } from "react";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import type { DisplayFaqItem } from "@/lib/modules/faq";
import type { CSSProperties } from "react";

export type FaqScreenProps = {
  brand: BrandConfig;
  faq: DisplayFaqItem[];
};

/**
 * Premium accordion presentation, same visual language as every other
 * Guest screen this batch (parchment/forest/cream, DM Serif Display
 * heading, DM Sans body). Items arrive here already publish-filtered -
 * publish_space() excludes disabled FAQ items before they ever reach the
 * snapshot, so there is no enabled flag to check here.
 */
export function FaqScreen({ brand, faq }: FaqScreenProps) {
  const vars = deriveThemeVars(brand) as CSSProperties;
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div style={vars} className="flex-1 overflow-y-auto no-scrollbar">
      <div className="px-6 pt-7 pb-5">
        <p className="text-[10px] tracking-[0.18em] uppercase font-medium mb-1" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
          Good to Know
        </p>
        <h1 className="text-[24px] font-normal" style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text)" }}>
          Frequently Asked Questions
        </h1>
      </div>

      {faq.length === 0 && (
        <div className="px-6 text-xs" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
          Nothing here yet.
        </div>
      )}

      <div className="px-4 pb-10 space-y-3">
        {faq.map((item, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={i} className="rounded-3xl overflow-hidden" style={{ background: "var(--rbr-cream)", border: "1px solid color-mix(in srgb, var(--rbr-sand) 40%, transparent)" }}>
              <button type="button" onClick={() => setOpenIndex(isOpen ? null : i)} className="w-full flex items-center justify-between p-4 text-left gap-3">
                <span className="text-[14px] font-medium leading-snug" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-text)" }}>
                  {item.question}
                </span>
                <svg
                  className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  style={{ color: "var(--rbr-mist)" }}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isOpen && item.answer && (
                <div className="px-5 pb-4">
                  <div className="w-full h-px mb-3" style={{ background: "color-mix(in srgb, var(--rbr-sand) 50%, transparent)" }} />
                  <p className="text-[13px] leading-relaxed whitespace-pre-line" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-dusk)" }}>
                    {item.answer}
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
