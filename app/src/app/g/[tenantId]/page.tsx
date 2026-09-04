import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { z } from "zod";
import { createPublicClient } from "@/lib/supabase/public";
import { GuestApp } from "@/components/guest-app";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { PaletteKey, AtmosphereKey } from "@/lib/theme/tokens";
import { publicScheduleItemSchema } from "@/lib/schedule/types";
import { facilitatorSchema, type DisplayFacilitator } from "@/lib/modules/facilitator";
import { mealSchema, type DisplayMeal } from "@/lib/modules/meal";
import { treatmentSchema, type DisplayTreatment } from "@/lib/modules/treatment";
import { facilitySchema, type DisplayFacility } from "@/lib/modules/facility";
import { arrivalInfoSchema, EMPTY_ARRIVAL_INFO, type ArrivalInfo } from "@/lib/modules/arrival";
import type { OptionalModuleKey } from "@/lib/modules/catalog";
import { todayInTimezone, currentTimeInTimezone, DEFAULT_TIMEZONE } from "@/lib/timezone";
import { publicMediaUrl } from "@/lib/media/path";

/**
 * The genuinely unauthenticated guest route. No cookies, no session, no
 * Supabase auth of any kind - it queries published_spaces only, through
 * the plain anon/publishable client, selecting only the columns it needs
 * (never `select *`). It never touches tenants, tenant_members,
 * brand_configs, schedule_items, or module_items: not "shouldn't", the
 * code simply doesn't reference them, and RLS would block it even if it
 * tried. This is the customer's application, not InnerDweS's - no
 * platform chrome, no InnerDweS branding, just their own theme.
 */
export default async function GuestSpacePage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const supabase = createPublicClient();

  const { data: space } = await supabase
    .from("published_spaces")
    .select("name, theme, timezone, enabled_modules, modules")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!space) notFound();

  const theme = space.theme as {
    palette: PaletteKey;
    atmosphere: AtmosphereKey;
    imageStyle?: "rounded" | "square";
  };
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

  const timezone = space.timezone || DEFAULT_TIMEZONE;
  const todayIso = todayInTimezone(timezone);
  const nowTime = currentTimeInTimezone(timezone);

  const vars = deriveThemeVars({
    name: space.name,
    logoUrl: null,
    palette: theme.palette,
    customPrimary: null,
    atmosphere: theme.atmosphere,
    imageStyle: theme.imageStyle ?? "rounded",
  }) as CSSProperties;

  return (
    <main
      style={{ ...vars, background: "var(--rbr-background)" }}
      className="flex-1 flex items-center justify-center px-6 py-12"
    >
      <div className="w-full max-w-sm h-[640px]">
        <GuestApp
          tenantName={space.name}
          brand={{
            name: space.name,
            logoUrl: null,
            palette: theme.palette,
            customPrimary: null,
            atmosphere: theme.atmosphere,
            imageStyle: theme.imageStyle ?? "rounded",
          }}
          todayIso={todayIso}
          nowTime={nowTime}
          enabledModules={(space.enabled_modules ?? []) as OptionalModuleKey[]}
          schedule={schedule}
          facilitators={facilitators}
          meals={meals}
          treatments={treatments}
          facilities={facilities}
          arrivalInfo={arrivalInfo}
        />
      </div>
    </main>
  );
}
