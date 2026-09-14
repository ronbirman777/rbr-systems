"use client";

import { useState } from "react";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import type { DisplayFacilitator } from "@/lib/modules/facilitator";
import { SocialIcon } from "./guest/social-icon";
import { SOCIAL_PLATFORM_LABEL } from "@/lib/modules/socialLinks";
import type { CSSProperties } from "react";

export type FacilitatorsScreenProps = {
  brand: BrandConfig;
  facilitators: DisplayFacilitator[];
};

/**
 * Visual Fidelity Phase 1 - ported from the approved Figma source's
 * TeamScreen: large editorial portrait card (not a small avatar row),
 * alternating card background for rhythm, tap-to-expand bio. Manual QA
 * Fixes phase closes the one remaining gap: specialties and social links
 * were already persisted and published (module_items.metadata, then
 * publish_space()'s facilitators block) but never actually rendered here
 * - both now show when configured, using the shared SocialIcon mapping
 * also used by Stay Connected, and never a placeholder for an
 * unconfigured field (no specialties -> no pill row at all, no
 * socialLinks -> no icon row at all).
 *
 * One element from the Figma source is still deliberately NOT
 * reproduced: the expanded "Sessions This Retreat" list - facilitators
 * aren't actually linked to schedule items in the data model (Schedule's
 * `facilitator` is free text, not a relation) - inventing a session list
 * here would be fabricated, not derived, data.
 */
export function FacilitatorsScreen({ brand, facilitators }: FacilitatorsScreenProps) {
  const vars = deriveThemeVars(brand) as CSSProperties;
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div style={vars} className="flex-1 overflow-y-auto no-scrollbar">
      <div className="px-6 pt-8 pb-6">
        <p className="text-[10px] tracking-[0.22em] uppercase font-medium mb-1" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
          Your Guides
        </p>
        <h1 className="text-[28px] leading-tight font-normal" style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text)" }}>
          Meet the <em>Facilitators</em>
        </h1>
      </div>

      {facilitators.length === 0 && (
        <div className="px-6 text-xs" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
          No facilitators added yet.
        </div>
      )}

      <div className="px-4 pb-10 space-y-6">
        {facilitators.map((f, idx) => {
          const isOpen = expanded === idx;
          return (
            <div
              key={idx}
              className="rounded-3xl overflow-hidden shadow-sm"
              style={{
                background: idx % 2 === 0 ? "var(--rbr-cream)" : "var(--rbr-parchment-deep)",
                border: "1px solid color-mix(in srgb, var(--rbr-sand) 30%, transparent)",
              }}
            >
              <div className="relative h-[300px]" style={{ background: "var(--rbr-parchment-deep)" }}>
                {f.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={f.imageUrl}
                    alt={f.name}
                    className="w-full h-full object-cover"
                    style={{ objectPosition: f.imagePosition ? `${f.imagePosition.x}% ${f.imagePosition.y}%` : "center top" }}
                  />
                ) : (
                  <div
                    className="w-full h-full"
                    style={{ background: `linear-gradient(160deg, var(--rbr-primary), var(--rbr-primary-dark))` }}
                  />
                )}
                <div
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(to top, color-mix(in srgb, var(--rbr-primary-dark) 75%, transparent), color-mix(in srgb, var(--rbr-primary-dark) 10%, transparent) 60%, transparent)" }}
                />
                <div className="absolute bottom-0 left-0 right-0 p-5">
                  <h2 className="text-white text-[22px] leading-tight" style={{ fontFamily: "var(--rbr-font-display)" }}>
                    {f.name}
                  </h2>
                  {f.role && (
                    <p className="text-white/65 text-[10px] tracking-[0.16em] uppercase font-medium mt-0.5" style={{ fontFamily: "var(--rbr-font-ui)" }}>
                      {f.role}
                    </p>
                  )}
                </div>
              </div>
              {(f.bio || f.specialties.length > 0 || f.socialLinks.length > 0) && (
                <div className="p-5">
                  {f.specialties.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {f.specialties.map((s) => (
                        <span
                          key={s}
                          className="text-[10px] px-2.5 py-1 rounded-full font-medium tracking-wide"
                          style={{
                            fontFamily: "var(--rbr-font-ui)",
                            background: idx % 2 === 0 ? "var(--rbr-primary-soft)" : "var(--rbr-secondary-soft)",
                            color: idx % 2 === 0 ? "var(--rbr-primary-foreground)" : "var(--rbr-secondary-foreground)",
                          }}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {f.bio && (
                    <>
                      <p
                        className={`text-[13px] leading-relaxed ${isOpen ? "" : "line-clamp-2"}`}
                        style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-dusk)" }}
                      >
                        {f.bio}
                      </p>
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : idx)}
                        className="mt-2 flex items-center gap-1.5 text-[12px] font-medium hover:opacity-70 transition-opacity"
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

                  {f.socialLinks.length > 0 && (
                    <div className={`flex items-center gap-2.5 ${f.bio ? "mt-4" : ""}`}>
                      {f.socialLinks.map((link) => (
                        <a
                          key={link.platform}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={SOCIAL_PLATFORM_LABEL[link.platform]}
                          className="w-8 h-8 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
                          style={{ background: "var(--rbr-parchment-deep)" }}
                        >
                          <SocialIcon platform={link.platform} className="w-4 h-4" style={{ color: "var(--rbr-text)" }} />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
