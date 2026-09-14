import type { CSSProperties } from "react";
import { z } from "zod";
import { GuestApp } from "@/components/guest-app";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { PaletteKey, AtmosphereKey } from "@/lib/theme/tokens";
import { publicScheduleItemSchema } from "@/lib/schedule/types";
import { facilitatorSchema, type DisplayFacilitator } from "@/lib/modules/facilitator";
import { mealSchema, type DisplayMeal } from "@/lib/modules/meal";
import { treatmentSchema, type DisplayTreatment } from "@/lib/modules/treatment";
import { facilitySchema, type DisplayFacility } from "@/lib/modules/facility";
import { arrivalInfoSchema, EMPTY_ARRIVAL_INFO, type ArrivalInfo } from "@/lib/modules/arrival";
import { publishedFaqItemSchema, type DisplayFaqItem } from "@/lib/modules/faq";
import { publishedCustomPageSchema, type DisplayCustomPage } from "@/lib/modules/customPage";
import { socialLinksSchema } from "@/lib/modules/socialLinks";
import { EMPTY_STAY_CONNECTED, type StayConnected } from "@/lib/modules/stayConnected";
import { publishedThemeSchema, brandMediaSchema, DEFAULT_PUBLISHED_THEME } from "@/lib/modules/publishedTheme";
import type { OptionalModuleKey } from "@/lib/modules/catalog";
import { todayInTimezone, currentTimeInTimezone, DEFAULT_TIMEZONE } from "@/lib/timezone";
import { publicMediaUrl } from "@/lib/media/path";

/**
 * Exactly the columns either guest lookup (by tenant id at /g/[tenantId],
 * or by slug at /s/[slug]) selects from published_spaces - never a wider
 * row, and never anything from a private table. Shared here so both
 * routes shape and render an identical, already-proven experience: this
 * file is a refactor of what used to be duplicated inline in
 * g/[tenantId]/page.tsx, not a new or redesigned rendering path. The
 * Guest App itself (components/guest-app.tsx and its screens) is
 * untouched.
 */
export type PublishedSpaceRow = {
  name: string;
  theme: unknown;
  timezone: string | null;
  enabled_modules: string[] | null;
  modules: unknown;
};

export function PublishedSpaceScreen({ space }: { space: PublishedSpaceRow }) {
  const themeParsed = publishedThemeSchema.safeParse(space.theme);
  const theme = themeParsed.success ? themeParsed.data : DEFAULT_PUBLISHED_THEME;
  const modules = (space.modules ?? {}) as Record<string, unknown>;

  function withImage<T extends { imageRef: string | null }>(items: T[]): (T & { imageUrl: string | null })[] {
    return items.map((item) => ({ ...item, imageUrl: item.imageRef ? publicMediaUrl(item.imageRef) : null }));
  }

  const scheduleParsed = z.array(publicScheduleItemSchema).safeParse(modules.schedule);
  const schedule = scheduleParsed.success ? scheduleParsed.data : [];

  const facilitatorsParsed = z.array(facilitatorSchema).safeParse(modules.facilitators);
  const facilitators: DisplayFacilitator[] = withImage(facilitatorsParsed.success ? facilitatorsParsed.data : []);

  const mealsParsed = z.array(mealSchema).safeParse(modules.meals);
  const meals: DisplayMeal[] = withImage(mealsParsed.success ? mealsParsed.data : []);

  const treatmentsParsed = z.array(treatmentSchema).safeParse(modules.treatments);
  const treatments: DisplayTreatment[] = withImage(treatmentsParsed.success ? treatmentsParsed.data : []);

  const facilitiesParsed = z.array(facilitySchema).safeParse(modules.facilities);
  const facilities: DisplayFacility[] = withImage(facilitiesParsed.success ? facilitiesParsed.data : []);

  const arrivalParsed = arrivalInfoSchema.safeParse(modules.arrivalInfo);
  const arrivalInfo: ArrivalInfo = arrivalParsed.success ? arrivalParsed.data : EMPTY_ARRIVAL_INFO;

  const faqParsed = z.array(publishedFaqItemSchema).safeParse(modules.faq);
  const faq: DisplayFaqItem[] = faqParsed.success ? faqParsed.data : [];

  const customPagesParsed = z.array(publishedCustomPageSchema).safeParse(modules.customPages);
  const customPages: DisplayCustomPage[] = customPagesParsed.success
    ? customPagesParsed.data.map((p) => ({ ...p, imageUrl: p.imageRef ? publicMediaUrl(p.imageRef) : null }))
    : [];

  const stayConnectedParsed = socialLinksSchema.safeParse(
    (modules.stayConnected as { links?: unknown } | undefined)?.links
  );
  const stayConnected: StayConnected = stayConnectedParsed.success
    ? { links: stayConnectedParsed.data }
    : EMPTY_STAY_CONNECTED;

  const brandMediaParsed = brandMediaSchema.safeParse(modules.brand);
  const heroImageRef = brandMediaParsed.success ? (brandMediaParsed.data.hero?.imageRef ?? null) : null;
  const heroImageUrl = heroImageRef ? publicMediaUrl(heroImageRef) : null;
  // Manual QA Fixes phase - the Logo was previously hardcoded to null here
  // regardless of what the organizer actually uploaded/published (a real,
  // confirmed gap - the upload worked, nothing ever rendered it). Resolved
  // exactly like heroImageRef above: only from modules.brand.logo, which
  // publish_space() already rewrites to the published (not draft) Storage
  // path - so a Draft-only logo replacement never reaches this route
  // until Republish, same guarantee as Hero.
  const logoImageRef = brandMediaParsed.success ? (brandMediaParsed.data.logo?.imageRef ?? null) : null;
  const logoUrl = logoImageRef ? publicMediaUrl(logoImageRef) : null;

  const timezone = space.timezone || DEFAULT_TIMEZONE;
  const todayIso = todayInTimezone(timezone);
  const nowTime = currentTimeInTimezone(timezone);

  const brand = {
    name: space.name,
    logoRef: logoImageRef,
    palette: theme.palette as PaletteKey,
    customPrimary: theme.customPrimary ?? null,
    customSecondary: theme.customSecondary ?? null,
    customNavigation: theme.customNavigation ?? null,
    customText: theme.customText ?? null,
    atmosphere: theme.atmosphere as AtmosphereKey,
    imageStyle: theme.imageStyle ?? "rounded",
  };

  const vars = deriveThemeVars(brand) as CSSProperties;

  return (
    <main
      style={{ ...vars, background: "var(--rbr-parchment-deep)" }}
      className="flex-1 flex items-center justify-center sm:p-6 p-0"
    >
      <div
        className="relative flex flex-col overflow-hidden sm:rounded-[44px] w-full sm:w-[390px] sm:h-[780px] h-full"
        style={{ background: "var(--rbr-background)", boxShadow: "0 40px 100px rgba(45,74,62,0.2), 0 10px 30px rgba(45,74,62,0.1)" }}
      >
        <GuestApp
          tenantName={space.name}
          brand={brand}
          heroImageUrl={heroImageUrl}
          logoUrl={logoUrl}
          todayIso={todayIso}
          nowTime={nowTime}
          enabledModules={(space.enabled_modules ?? []) as OptionalModuleKey[]}
          schedule={schedule}
          facilitators={facilitators}
          meals={meals}
          treatments={treatments}
          facilities={facilities}
          arrivalInfo={arrivalInfo}
          faq={faq}
          customPages={customPages}
          stayConnected={stayConnected}
        />
      </div>
    </main>
  );
}
