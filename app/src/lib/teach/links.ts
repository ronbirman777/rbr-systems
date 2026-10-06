import { normalizeWhatsAppNumber, whatsappUrl } from "@/lib/share/whatsapp";
import { telUrl } from "@/lib/phone";
import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n";
import type {
  AvailabilityMetadata,
  ClassMetadata,
  ContactMethod,
  RegistrationMethod,
  TeachContact,
  Venue,
} from "./schemas";

/**
 * Link building for Time to Teach: registration CTAs, WhatsApp deep links,
 * contact methods, venue links. Every href a guest can click goes through
 * one of these functions - never raw teacher input - so only http(s),
 * mailto:, tel: and wa.me links can ever be produced.
 */

/** Normalises teacher-typed web addresses: "olivetree.studio" -> https://olivetree.studio. */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** "@maya.breathes" / "instagram.com/maya" / full URL -> https://instagram.com/<handle> */
export function instagramUrl(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  const handle = v.match(/^@?([A-Za-z0-9._]{1,30})$/);
  if (handle) return `https://instagram.com/${handle[1]}`;
  return safeHttpUrl(v);
}

export function telegramUrl(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  const handle = v.match(/^@?([A-Za-z0-9_]{4,32})$/);
  if (handle) return `https://t.me/${handle[1]}`;
  return safeHttpUrl(v);
}

/**
 * WhatsApp number/link building is product-agnostic and lives in
 * lib/share/whatsapp.ts; re-exported here so Teach call sites keep their
 * single import and there is only one definition in the codebase.
 */
export { normalizeWhatsAppNumber, whatsappUrl };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(raw: string | null | undefined): boolean {
  return Boolean(raw && EMAIL_PATTERN.test(raw.trim()));
}

export function mailtoUrl(email: string | null | undefined, subject?: string | null, body?: string | null): string | null {
  if (!email || !isEmail(email)) return null;
  const params: string[] = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${email.trim()}${params.length ? `?${params.join("&")}` : ""}`;
}

/**
 * Phone link building is product-agnostic and lives in lib/phone;
 * re-exported here so Teach call sites keep their single import.
 */
export { telUrl };

// ---------------------------------------------------------------------------
// Message templates
// ---------------------------------------------------------------------------

export const TEMPLATE_VARIABLES = [
  "teacher_name",
  "class_name",
  "date",
  "start_time",
  "end_time",
  "location",
  "space_url",
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];
export type TemplateValues = Partial<Record<TemplateVariable, string | null>>;

/**
 * The prefilled enquiry a guest sends when the teacher has not written
 * their own template. It is system copy, so it follows the Space
 * language - the teacher reads these messages, and they should arrive in
 * the language they run their Space in. The {{variables}} are
 * substituted by renderTemplate and are identical in every language.
 */
export function defaultClassWhatsappTemplate(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "teach", "classWhatsappTemplate");
}
export function defaultPrivateWhatsappTemplate(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "teach", "privateWhatsappTemplate");
}

/**
 * Replaces {{ variable }} placeholders. Unknown variables are left exactly as
 * typed (so a teacher sees their typo instead of silent removal); known
 * variables with no value become an empty string, and doubled spaces are tidied.
 */
export function renderTemplate(template: string, values: TemplateValues): string {
  return template
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, name: string) => {
      const key = name.toLowerCase() as TemplateVariable;
      if (!(TEMPLATE_VARIABLES as readonly string[]).includes(key)) return match;
      return values[key] ?? "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "2025-10-14" -> "Tue 14 Oct". Deliberately NOT toLocaleDateString: ICU
 * output differs between Node and browsers ("Tue 14 Oct" vs "Tue, 14 Oct"),
 * which breaks hydration and makes WhatsApp messages differ by device.
 */
export function formatShortDate(dateIso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!m) return dateIso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  if (Number.isNaN(d.getTime())) return dateIso;
  return `${SHORT_WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
}

// ---------------------------------------------------------------------------
// Class registration CTA
// ---------------------------------------------------------------------------

/**
 * How each registration method is named in the Studio picker.
 *
 * WhatsApp, Instagram and Facebook are brand names and stay as they are
 * in every language; the rest is system copy and is translated.
 */
export function registrationMethodLabel(locale: Locale = DEFAULT_LOCALE): Record<RegistrationMethod, string> {
  return {
    whatsapp: "WhatsApp",
    website: translate(locale, "common", "website"),
    instagram: "Instagram",
    facebook: "Facebook",
    email: translate(locale, "common", "email"),
    bookingLink: translate(locale, "teach", "externalBookingLink"),
    venueLink: translate(locale, "teach", "hostVenueLink"),
  };
}

/** The button a guest sees when the teacher has not written their own. */
function defaultButtonLabel(locale: Locale): Record<RegistrationMethod, string> {
  return {
    whatsapp: translate(locale, "teach", "joinViaWhatsapp"),
    website: translate(locale, "teach", "registerOnWebsite"),
    instagram: translate(locale, "teach", "messageOnInstagram"),
    facebook: translate(locale, "teach", "registerOnFacebook"),
    email: translate(locale, "teach", "registerByEmail"),
    bookingLink: translate(locale, "teach", "bookYourSpot"),
    venueLink: translate(locale, "teach", "bookWithVenue"),
  };
}

export type RegistrationCta = { href: string; label: string; method: RegistrationMethod; external: boolean };

export function classTemplateValues(
  teacherName: string,
  title: string,
  meta: Pick<ClassMetadata, "startDate" | "startTime" | "endTime" | "location">,
  spaceUrl?: string | null
): TemplateValues {
  return {
    teacher_name: teacherName,
    class_name: title,
    date: formatShortDate(meta.startDate),
    start_time: meta.startTime,
    end_time: meta.endTime,
    location: meta.location,
    space_url: spaceUrl ?? null,
  };
}

export function venueBookingUrl(venue: Venue): string | null {
  if (!venue.enabled) return null;
  return safeHttpUrl(venue.bookingUrl) ?? safeHttpUrl(venue.website);
}

/** The single primary CTA for a class, or null when nothing valid is configured. */
export function buildRegistrationCta(
  teacherName: string,
  title: string,
  meta: ClassMetadata,
  /** Public Guest App URL, woven into the prefilled message so the teacher
   * can see which Space an enquiry came from. Omitted when unknown. */
  spaceUrl?: string | null,
  locale: Locale = DEFAULT_LOCALE
): RegistrationCta | null {
  const { method, value, buttonLabel, whatsappTemplate } = meta.registration;
  if (!method) return null;
  // A label the teacher typed wins over any translation - it is their copy.
  const label =
    buttonLabel ??
    (method === "venueLink" && meta.venue.name
      ? translate(locale, "teach", "bookWithNamed", { venue: meta.venue.name })
      : defaultButtonLabel(locale)[method]);
  const message = renderTemplate(
    whatsappTemplate ?? defaultClassWhatsappTemplate(locale),
    classTemplateValues(teacherName, title, meta, spaceUrl)
  );
  let href: string | null = null;
  switch (method) {
    case "whatsapp":
      href = whatsappUrl(value, message);
      break;
    case "email":
      href = mailtoUrl(value, title, message);
      break;
    case "instagram":
      href = instagramUrl(value);
      break;
    case "website":
    case "facebook":
    case "bookingLink":
      href = safeHttpUrl(value);
      break;
    case "venueLink":
      href = venueBookingUrl(meta.venue);
      break;
  }
  if (!href) return null;
  return { href, label, method, external: !href.startsWith("mailto:") };
}

export type VenueLink = { kind: "website" | "instagram" | "facebook" | "email" | "booking" | "map"; label: string; href: string };

/** Only the venue fields actually configured (and valid) are returned. */
export function venueLinks(venue: Venue, locale: Locale = DEFAULT_LOCALE): VenueLink[] {
  if (!venue.enabled) return [];
  const out: VenueLink[] = [];
  const push = (kind: VenueLink["kind"], label: string, href: string | null) => {
    if (href) out.push({ kind, label, href });
  };
  push("website", translate(locale, "common", "website"), safeHttpUrl(venue.website));
  push("instagram", "Instagram", instagramUrl(venue.instagram));
  push("facebook", "Facebook", safeHttpUrl(venue.facebook));
  push("booking", translate(locale, "teach", "book"), safeHttpUrl(venue.bookingUrl));
  push("email", translate(locale, "common", "email"), mailtoUrl(venue.email));
  push("map", translate(locale, "common", "map"), safeHttpUrl(venue.mapUrl));
  return out;
}

// ---------------------------------------------------------------------------
// Private availability CTAs
// ---------------------------------------------------------------------------

export type SimpleCta = { href: string; label: string; kind: string };

export function availabilityCtas(
  teacherName: string,
  dateIso: string,
  meta: AvailabilityMetadata,
  contact: TeachContact,
  locale: Locale = DEFAULT_LOCALE
): SimpleCta[] {
  const out: SimpleCta[] = [];
  const message = renderTemplate(meta.whatsappTemplate ?? defaultPrivateWhatsappTemplate(locale), {
    teacher_name: teacherName,
    date: formatShortDate(dateIso),
    start_time: meta.from,
    end_time: meta.to,
  });
  for (const m of meta.methods) {
    let href: string | null = null;
    let label = "";
    if (m === "whatsapp") {
      href = whatsappUrl(contact.methods.whatsapp, message);
      label = "WhatsApp";
    } else if (m === "email") {
      href = mailtoUrl(contact.methods.email, translate(locale, "teach", "privateSession"), message);
      label = translate(locale, "common", "email");
    } else if (m === "bookingLink") {
      href = safeHttpUrl(meta.bookingUrl) ?? safeHttpUrl(contact.methods.bookingUrl);
      label = translate(locale, "teach", "book");
    } else if (m === "website") {
      href = safeHttpUrl(meta.website) ?? safeHttpUrl(contact.methods.website);
      label = translate(locale, "common", "website");
    }
    if (href) out.push({ href, label, kind: m });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Contact methods
// ---------------------------------------------------------------------------

export function contactMethodLabel(locale: Locale = DEFAULT_LOCALE): Record<ContactMethod, string> {
  return {
    whatsapp: "WhatsApp",
    phone: translate(locale, "common", "phone"),
    email: translate(locale, "common", "email"),
    instagram: "Instagram",
    facebook: "Facebook",
    website: translate(locale, "common", "website"),
    telegram: "Telegram",
    bookingUrl: translate(locale, "teach", "bookASession"),
  };
}

export function contactHref(method: ContactMethod, value: string | null | undefined): string | null {
  switch (method) {
    case "whatsapp":
      return whatsappUrl(value);
    case "phone":
      return telUrl(value);
    case "email":
      return mailtoUrl(value);
    case "instagram":
      return instagramUrl(value);
    case "telegram":
      return telegramUrl(value);
    case "facebook":
    case "website":
    case "bookingUrl":
      return safeHttpUrl(value);
  }
}

export type ContactEntry = { method: ContactMethod; label: string; value: string; href: string };

/** Enabled + filled + valid methods, in the teacher's chosen order. */
export function contactEntries(contact: TeachContact, locale: Locale = DEFAULT_LOCALE): ContactEntry[] {
  const out: ContactEntry[] = [];
  for (const method of contact.enabled) {
    const value = contact.methods[method];
    const href = contactHref(method, value);
    if (value && href) out.push({ method, label: contactMethodLabel(locale)[method], value, href });
  }
  return out;
}
