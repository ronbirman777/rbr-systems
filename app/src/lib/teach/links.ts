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

/** Digits only, international format without "+", 8-15 digits (E.164). */
export function normalizeWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("00")) digits = digits.slice(2);
  digits = digits.replace(/\D/g, "");
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

export function whatsappUrl(number: string | null | undefined, message?: string | null): string | null {
  const digits = normalizeWhatsAppNumber(number);
  if (!digits) return null;
  return message && message.trim()
    ? `https://wa.me/${digits}?text=${encodeURIComponent(message.trim())}`
    : `https://wa.me/${digits}`;
}

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

export function telUrl(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  const cleaned = v.replace(/[^\d+]/g, "");
  return /^\+?\d{6,16}$/.test(cleaned) ? `tel:${cleaned}` : null;
}

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
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];
export type TemplateValues = Partial<Record<TemplateVariable, string | null>>;

export const DEFAULT_CLASS_WHATSAPP_TEMPLATE =
  "Hi {{teacher_name}}, I'd like to join {{class_name}} on {{date}} at {{start_time}}.";
export const DEFAULT_PRIVATE_WHATSAPP_TEMPLATE =
  "Hi {{teacher_name}}, I'd love a private session on {{date}} between {{start_time}} and {{end_time}}.";

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

/** "2025-10-14" -> "Tue 14 Oct" (calendar date, never shifted by time zone). */
export function formatShortDate(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateIso;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

// ---------------------------------------------------------------------------
// Class registration CTA
// ---------------------------------------------------------------------------

export const REGISTRATION_METHOD_LABEL: Record<RegistrationMethod, string> = {
  whatsapp: "WhatsApp",
  website: "Website",
  instagram: "Instagram",
  facebook: "Facebook",
  email: "Email",
  bookingLink: "External booking link",
  venueLink: "Host venue link",
};

const DEFAULT_BUTTON_LABEL: Record<RegistrationMethod, string> = {
  whatsapp: "Join via WhatsApp",
  website: "Register on website",
  instagram: "Message on Instagram",
  facebook: "Register on Facebook",
  email: "Register by email",
  bookingLink: "Book your spot",
  venueLink: "Book with the venue",
};

export type RegistrationCta = { href: string; label: string; method: RegistrationMethod; external: boolean };

export function classTemplateValues(
  teacherName: string,
  title: string,
  meta: Pick<ClassMetadata, "startDate" | "startTime" | "endTime" | "location">
): TemplateValues {
  return {
    teacher_name: teacherName,
    class_name: title,
    date: formatShortDate(meta.startDate),
    start_time: meta.startTime,
    end_time: meta.endTime,
    location: meta.location,
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
  meta: ClassMetadata
): RegistrationCta | null {
  const { method, value, buttonLabel, whatsappTemplate } = meta.registration;
  if (!method) return null;
  const label = buttonLabel ?? (method === "venueLink" && meta.venue.name ? `Book with ${meta.venue.name}` : DEFAULT_BUTTON_LABEL[method]);
  const message = renderTemplate(whatsappTemplate ?? DEFAULT_CLASS_WHATSAPP_TEMPLATE, classTemplateValues(teacherName, title, meta));
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
export function venueLinks(venue: Venue): VenueLink[] {
  if (!venue.enabled) return [];
  const out: VenueLink[] = [];
  const push = (kind: VenueLink["kind"], label: string, href: string | null) => {
    if (href) out.push({ kind, label, href });
  };
  push("website", "Website", safeHttpUrl(venue.website));
  push("instagram", "Instagram", instagramUrl(venue.instagram));
  push("facebook", "Facebook", safeHttpUrl(venue.facebook));
  push("booking", "Book", safeHttpUrl(venue.bookingUrl));
  push("email", "Email", mailtoUrl(venue.email));
  push("map", "Map", safeHttpUrl(venue.mapUrl));
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
  contact: TeachContact
): SimpleCta[] {
  const out: SimpleCta[] = [];
  const message = renderTemplate(meta.whatsappTemplate ?? DEFAULT_PRIVATE_WHATSAPP_TEMPLATE, {
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
      href = mailtoUrl(contact.methods.email, "Private session", message);
      label = "Email";
    } else if (m === "bookingLink") {
      href = safeHttpUrl(meta.bookingUrl) ?? safeHttpUrl(contact.methods.bookingUrl);
      label = "Book";
    } else if (m === "website") {
      href = safeHttpUrl(meta.website) ?? safeHttpUrl(contact.methods.website);
      label = "Website";
    }
    if (href) out.push({ href, label, kind: m });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Contact methods
// ---------------------------------------------------------------------------

export const CONTACT_METHOD_LABEL: Record<ContactMethod, string> = {
  whatsapp: "WhatsApp",
  phone: "Phone",
  email: "Email",
  instagram: "Instagram",
  facebook: "Facebook",
  website: "Website",
  telegram: "Telegram",
  bookingUrl: "Book a session",
};

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
export function contactEntries(contact: TeachContact): ContactEntry[] {
  const out: ContactEntry[] = [];
  for (const method of contact.enabled) {
    const value = contact.methods[method];
    const href = contactHref(method, value);
    if (value && href) out.push({ method, label: CONTACT_METHOD_LABEL[method], value, href });
  }
  return out;
}
