import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import { findNowItem, findNextItem, type PublicScheduleItem } from "@/lib/schedule/types";
import { PinIcon, PersonIcon, ChevronRightIcon } from "./guest/icons";
import type { DailyQuote } from "@/lib/content/dailyQuotes";
import type { CSSProperties } from "react";

export type TodayScreenProps = {
  tenantName: string;
  brand: BrandConfig;
  schedule: PublicScheduleItem[];
  /** ISO date ("YYYY-MM-DD"), passed explicitly so server and client render
   * identically rather than each calling `new Date()` independently. */
  todayIso: string;
  /** "HH:MM" in the Space timezone - needed to pick out the single "now"
   * and "next" session, matching ScheduleScreen's own now/next logic
   * (shared via findNowItem/findNextItem) rather than showing today's
   * whole list. Optional only so existing callers that predate this prop
   * don't break; every real caller (GuestApp) always passes it. */
  nowTime?: string;
  /** Not yet persisted anywhere (Visual Fidelity Phase 1 - see the batch
   * report's persistence-gap list) - no caller can pass this today. Once
   * a tenant hero-photo field exists, passing a URL here switches the
   * hero from the gradient placeholder below to the real photo, with no
   * other change needed. */
  heroImageUrl?: string | null;
  /** Manual QA Fixes phase - the Retreat Logo, shown subtly in the hero's
   * identity area (next to the tenant name label), never replacing it.
   * Draft Preview passes the draft logo's resolved URL; the real,
   * published Guest App passes the published logo's URL (or null if
   * never published) - this component itself has no opinion on which,
   * it only ever renders whatever URL it's given, exactly like
   * heroImageUrl already does. */
  logoUrl?: string | null;
  /** Same gap as heroImageUrl - organizer-authored "Today's Intention"
   * text has no persisted field yet. The card simply doesn't render
   * until a caller can pass one. */
  intention?: string | null;
  /** Present only when the Schedule module is enabled - Today answers "what's
   * now / what's next", Schedule answers "what's the whole program"; this is
   * the one deliberate cross-link between those two different questions. */
  onViewSchedule?: () => void;
  /** Present only when the Daily Inspiration module is enabled - one fixed
   * sentence selected deterministically by day-of-month in the Space's own
   * timezone (see lib/content/dailyQuotes). Not organizer-authored, so
   * there's no draft/published gap here the way there is for heroImageUrl. */
  dailyQuote?: DailyQuote | null;
};

/**
 * Visual Fidelity Phase 1 - ported from the approved Figma Make source's
 * TodayScreen (App.tsx): hero moment, greeting, Happening Now / Up Next.
 * "forest" fills that Figma uses as the brand accent (Happening Now card,
 * hero gradient) map to this tenant's own --rbr-primary, not a fixed
 * hex - Figma's own source has no brand-parameterization to preserve, so
 * this is a deliberate adaptation, not a literal copy. Neutral text/
 * border colors map to the fixed, InnerDweS-owned --rbr-* base palette
 * (see GUEST_BASE_PALETTE), same as every other screen. "clay" (Figma's
 * accent role - the Live pill, pulse dot) maps to --rbr-secondary, this
 * batch's stand-in for the not-yet-persisted independent Accent Color.
 */
export function TodayScreen({
  tenantName,
  brand,
  schedule,
  todayIso,
  nowTime,
  heroImageUrl,
  logoUrl,
  intention,
  onViewSchedule,
  dailyQuote,
}: TodayScreenProps) {
  const vars = deriveThemeVars(brand) as CSSProperties;
  const nowSession = nowTime ? findNowItem(schedule, todayIso, nowTime) : null;
  const nextSession = nowTime ? findNextItem(schedule, todayIso, nowTime) : null;
  const dateLabel = new Date(`${todayIso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div style={vars} className="flex-1 overflow-y-auto no-scrollbar">
      <div className="relative h-[280px]">
        {heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroImageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full"
            style={{ background: `linear-gradient(135deg, var(--rbr-primary), var(--rbr-forest-mid))` }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.3), transparent, rgba(0,0,0,0.65))" }}
        />
        <div className="absolute top-0 left-0 right-0 px-6 pt-3 flex items-center gap-2">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-6 w-auto max-w-[88px] object-contain shrink-0" />
          )}
          <span className="text-white/60 text-[10px] tracking-[0.22em] font-medium uppercase" style={{ fontFamily: "var(--rbr-font-ui)" }}>
            {tenantName}
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-5">
          <h1 className="text-white text-[2.4rem] leading-[1.1] font-normal" style={{ fontFamily: "var(--rbr-font-display)" }}>
            Good morning.
          </h1>
          <p className="text-white/65 text-[12px] mt-2 font-light tracking-[0.08em]" style={{ fontFamily: "var(--rbr-font-ui)" }}>
            {dateLabel}
          </p>
        </div>
      </div>

      {intention && (
        <div className="mx-4 -mt-3 relative z-10">
          <div
            className="rounded-2xl px-5 py-4 border"
            style={{
              background: "color-mix(in srgb, var(--rbr-cream) 96%, transparent)",
              backdropFilter: "blur(12px)",
              borderColor: "color-mix(in srgb, var(--rbr-sand) 50%, transparent)",
            }}
          >
            <p className="text-[14px] leading-relaxed italic" style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-dusk)" }}>
              &ldquo;{intention}&rdquo;
            </p>
            <p
              className="text-[10px] tracking-[0.18em] uppercase font-medium mt-1.5"
              style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}
            >
              — Today&apos;s Intention
            </p>
          </div>
        </div>
      )}

      {nowSession && (
        <div className="mx-4 mt-5">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: "var(--rbr-secondary)" }} />
            <span
              className="text-[10px] tracking-[0.2em] font-semibold uppercase"
              style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-dusk)" }}
            >
              Happening Now
            </span>
          </div>
          <div
            className="rounded-2xl p-5 shadow-lg"
            style={{ background: "var(--rbr-primary)", boxShadow: "0 8px 32px rgba(45,74,62,0.22)" }}
          >
            <div className="flex items-center justify-between mb-3">
              {nowSession.category && (
                <span
                  className="text-[10px] tracking-[0.18em] uppercase font-medium"
                  style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-on-primary)", opacity: 0.75 }}
                >
                  {nowSession.category}
                </span>
              )}
              <span
                className="text-white text-[9px] tracking-widest px-2.5 py-0.5 rounded-full uppercase font-semibold"
                style={{ fontFamily: "var(--rbr-font-ui)", background: "color-mix(in srgb, var(--rbr-secondary) 80%, transparent)" }}
              >
                Live
              </span>
            </div>
            <h2 className="text-white text-[22px] leading-tight" style={{ fontFamily: "var(--rbr-font-display)" }}>
              {nowSession.title}
            </h2>
            <p className="text-white/50 text-xs mt-1 mb-4" style={{ fontFamily: "var(--rbr-font-ui)" }}>
              {nowSession.startTime}
              {nowSession.endTime ? ` – ${nowSession.endTime}` : ""}
            </p>
            {(nowSession.facilitator || nowSession.location) && (
              <div className="flex items-center gap-4 pt-3.5 border-t border-white/10">
                {nowSession.facilitator && (
                  <span className="flex items-center gap-1.5 text-white/60 text-[11px]" style={{ fontFamily: "var(--rbr-font-ui)" }}>
                    <PersonIcon style={{ color: "var(--rbr-on-primary)" }} />
                    {nowSession.facilitator}
                  </span>
                )}
                {nowSession.location && (
                  <span className="flex items-center gap-1.5 text-white/60 text-[11px]" style={{ fontFamily: "var(--rbr-font-ui)" }}>
                    <PinIcon />
                    {nowSession.location}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {nextSession && (
        <div className="mx-4 mt-4">
          <p
            className="text-[10px] tracking-[0.2em] font-semibold uppercase mb-2.5"
            style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}
          >
            Up Next
          </p>
          <div
            className="rounded-2xl p-4 border flex items-center gap-3"
            style={{ background: "var(--rbr-cream)", borderColor: "var(--rbr-primary-border)" }}
          >
            <div className="flex-1 min-w-0">
              {nextSession.category && (
                <span
                  className="text-[10px] tracking-widest uppercase font-medium"
                  style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-secondary-foreground)" }}
                >
                  {nextSession.category}
                </span>
              )}
              <h3 className="text-[17px] leading-snug mt-0.5" style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text)" }}>
                {nextSession.title}
              </h3>
              <p className="text-xs mt-0.5" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-dusk)" }}>
                {nextSession.startTime}
                {nextSession.location ? ` · ${nextSession.location}` : ""}
              </p>
            </div>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--rbr-primary-soft)" }}
            >
              <ChevronRightIcon style={{ color: "var(--rbr-primary-foreground)" }} />
            </div>
          </div>
        </div>
      )}

      {!nowSession && !nextSession && (
        <div className="mx-4 mt-5 text-xs" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
          Nothing scheduled right now.
        </div>
      )}

      {onViewSchedule && (
        <div className="mx-4 mt-4">
          <button
            type="button"
            onClick={onViewSchedule}
            className="w-full flex items-center justify-between py-3.5 px-4 rounded-2xl border transition-colors"
            style={{ borderColor: "color-mix(in srgb, var(--rbr-sand) 70%, transparent)", color: "var(--rbr-dusk)" }}
          >
            <span className="text-[13px] font-medium" style={{ fontFamily: "var(--rbr-font-ui)" }}>
              View today&apos;s full schedule
            </span>
            <ChevronRightIcon style={{ color: "var(--rbr-mist)" }} />
          </button>
        </div>
      )}

      {dailyQuote && (
        <div className="mx-4 mt-5 mb-8">
          <div
            className="rounded-2xl px-5 py-5 text-center"
            style={{ background: "var(--rbr-primary-soft)" }}
          >
            <span
              className="text-[26px] leading-none block mb-1.5"
              style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text-on-primary-soft)", opacity: 0.55 }}
              aria-hidden="true"
            >
              &ldquo;
            </span>
            <p className="text-[15px] leading-relaxed italic" style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text-on-primary-soft)" }}>
              {dailyQuote.text}
            </p>
            <p
              className="text-[10px] tracking-[0.18em] uppercase font-medium mt-3"
              style={{ fontFamily: "var(--rbr-font-ui)", color: "color-mix(in srgb, var(--rbr-text-on-primary-soft) 45%, var(--rbr-mist))" }}
            >
              {dailyQuote.source}
            </p>
          </div>
        </div>
      )}

      {!onViewSchedule && !dailyQuote && <div className="mb-8" />}
    </div>
  );
}
