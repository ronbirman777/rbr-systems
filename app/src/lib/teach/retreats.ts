import type { Locale } from "@/lib/i18n";
import { formatDateRangeLocalized } from "@/lib/i18n/datetime";
import { formatPrice } from "@/lib/currencies/format";
import { isValidIsoDate } from "@/lib/modules/fields";
import { GUEST_PUBLIC_ORIGIN } from "@/lib/site-url";
import { isReservedSlug, slugFormatError } from "@/lib/slug";
import type { RetreatMetadata } from "./schemas";

/**
 * Pure helpers for Time to Teach "My Retreats" (TASK 031).
 *
 * Nothing here reads a database, a clock or the viewer's timezone. "Today"
 * is always passed in (the Space's own calendar day, from lib/timezone), and
 * every date is a plain "YYYY-MM-DD" compared as a string - the same rule
 * the rest of Teach follows - so a retreat can never shift a day because of
 * who is looking at it.
 */

export type RetreatPhase = "undated" | "upcoming" | "ongoing" | "past";

/**
 * Where a retreat sits relative to the Space's today. A retreat with only a
 * start date is treated as a single day (it ends the day it starts); one
 * with no start date has no phase at all. Past retreats are NEVER hidden
 * here - callers decide how to present them.
 */
export function retreatPhase(meta: Pick<RetreatMetadata, "startDate" | "endDate">, todayIso: string): RetreatPhase {
  const start = meta.startDate;
  if (!start) return "undated";
  const end = meta.endDate && meta.endDate >= start ? meta.endDate : start;
  if (todayIso < start) return "upcoming";
  if (todayIso > end) return "past";
  return "ongoing";
}

/** "14-20 Oct 2027", or null when the retreat has no dates. */
export function retreatDateSummary(meta: Pick<RetreatMetadata, "startDate" | "endDate">, locale: Locale): string | null {
  if (!meta.startDate) return null;
  return formatDateRangeLocalized(meta.startDate, meta.endDate, locale);
}

/**
 * The retreat price for display - TASK 033 routes it through the shared
 * retreat-item formatter (lib/currencies/format.ts): ISO codes get the
 * locale's currency style with CLDR's disambiguated symbol ("THB 700.00",
 * "€1,250.50"), never rounding a stored value; anything else prints locale
 * digits plus the raw stored code. Never converted, never billing.
 *
 * ICU output differs between Node and browsers, so guest pages format this
 * on the server (TeachGuestData.retreatPriceLabels) and the Studio only
 * after mount.
 */
export function formatRetreatPrice(meta: Pick<RetreatMetadata, "price" | "currency">, locale: Locale): string | null {
  return formatPrice(meta.price, meta.currency, locale);
}

export type RetreatIssue =
  | "startRequiredForEnd"
  | "endBeforeStart"
  | "badDate"
  | "priceNeedsCurrency"
  | "badRegistration";

/**
 * The strict rules, applied when a teacher SAVES (the read schema stays
 * tolerant). Returns the first problem, or null. The Flow-link check is
 * separate because it needs the database (lib/teach/flowLinkServer.ts).
 */
export function validateRetreatMetadata(meta: RetreatMetadata): RetreatIssue | null {
  if (meta.startDate && !isValidIsoDate(meta.startDate)) return "badDate";
  if (meta.endDate && !isValidIsoDate(meta.endDate)) return "badDate";
  if (meta.endDate && !meta.startDate) return "startRequiredForEnd";
  if (meta.startDate && meta.endDate && meta.endDate < meta.startDate) return "endBeforeStart";
  if (meta.price !== null && !meta.currency) return "priceNeedsCurrency";
  if (meta.registration.method && !meta.registration.value && meta.registration.method !== "venueLink") return "badRegistration";
  return null;
}

// ---------------------------------------------------------------------------
// InnerDweS Flow Guest URL
// ---------------------------------------------------------------------------

export type FlowUrlRef = { kind: "slug"; slug: string } | { kind: "tenant"; tenantId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Hosts that are InnerDweS itself (or this deployment). Anything else is not a Guest App link. */
function isInnerDweSHost(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host === "innerdwes.com" || host.endsWith(".innerdwes.com")) return true;
  if (host.endsWith(".vercel.app")) return true; // preview/staging deployments
  try {
    return new URL(GUEST_PUBLIC_ORIGIN).hostname.toLowerCase() === host;
  } catch {
    return false;
  }
}

/**
 * Reads an InnerDweS Guest App address out of whatever a teacher pasted.
 *
 * Accepted shapes: https://innerdwes.com/s/<slug>, .../g/<tenant-uuid>, and
 * https://<slug>.innerdwes.com. Only the identity is extracted - the caller
 * must still prove, on the server, that it names a PUBLISHED, PUBLIC Flow
 * Space, and stores its own canonical URL, never the pasted one. So a
 * look-alike host or a stray path can never become a stored link.
 */
export function parseFlowGuestUrl(raw: string | null | undefined): FlowUrlRef | null {
  const v = raw?.trim();
  if (!v) return null;
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  if (!isInnerDweSHost(host)) return null;

  const segments = u.pathname.split("/").filter(Boolean);
  if (segments.length === 2 && segments[0] === "s") {
    const slug = segments[1].toLowerCase();
    return slugFormatError(slug) === null && !isReservedSlug(slug) ? { kind: "slug", slug } : null;
  }
  if (segments.length === 2 && segments[0] === "g" && UUID.test(segments[1])) {
    return { kind: "tenant", tenantId: segments[1].toLowerCase() };
  }
  // <slug>.innerdwes.com with no path
  if (segments.length === 0 && host.endsWith(".innerdwes.com")) {
    const label = host.slice(0, -".innerdwes.com".length);
    if (!label.includes(".") && slugFormatError(label) === null && !isReservedSlug(label)) return { kind: "slug", slug: label };
  }
  return null;
}

/** The one canonical address stored for a verified Flow Space. */
export function canonicalFlowGuestUrl(ref: { tenantId: string; slug: string | null }): string {
  return `${GUEST_PUBLIC_ORIGIN}${ref.slug ? `/s/${ref.slug}` : `/g/${ref.tenantId}`}`;
}
