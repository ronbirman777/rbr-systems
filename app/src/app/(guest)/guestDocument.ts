import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { localeFromPublishedModules } from "@/lib/spaceSettings";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

/**
 * TASK 033 (plan section 4.5) - what a Guest root layout needs BEFORE the
 * published payload and the access chain have resolved: the Space's
 * language, for `<html lang/dir>` and the localized loading screen, and
 * whether a published row exists at all.
 *
 * One light, indexed read (unique `slug` / `tenant_id`) of only
 * `modules->spaceSettings`, through the same session-free public client and
 * RLS the Guest route itself uses - published_spaces is anonymously
 * readable, so this reveals nothing the page or the anon API do not already.
 * The heavy read (whole row + availability + access mode) is started in
 * parallel by the layout and finished by the page, inside the loading
 * boundary.
 *
 * `exists` decides whether the layout streams a loading boundary at all.
 * An unknown address renders without one, so the page's notFound() still
 * happens before any byte is sent and the response keeps its real 404
 * status (see the Guest route status follow-up). A read error is treated as
 * "unknown" with the English default - exactly the pre-TASK-033 behaviour,
 * never a 500 and never a guess.
 */
export type GuestDocumentInfo = { exists: boolean; locale: Locale };

async function read(column: "slug" | "tenant_id", value: string): Promise<GuestDocumentInfo> {
  try {
    const { data, error } = await createPublicClient()
      .from("published_spaces")
      .select("spaceSettings:modules->spaceSettings")
      .eq(column, value)
      .maybeSingle<{ spaceSettings: unknown }>();
    if (error || !data) return { exists: false, locale: DEFAULT_LOCALE };
    // The same resolver every other Guest surface uses, fed the same object.
    return { exists: true, locale: localeFromPublishedModules({ spaceSettings: data.spaceSettings }) };
  } catch {
    return { exists: false, locale: DEFAULT_LOCALE };
  }
}

export const guestDocumentBySlug = cache((slug: string) => read("slug", slug));
export const guestDocumentByTenantId = cache((tenantId: string) => read("tenant_id", tenantId));
