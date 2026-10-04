/**
 * Product-agnostic WhatsApp link building, shared by every Space type
 * (Teach today; Flow/Heal as they adopt it). Time to Teach's own
 * registration/contact helpers in lib/teach/links.ts re-export these rather
 * than keeping a second copy, so there is exactly one definition of "what a
 * valid WhatsApp number is" and "how a prefilled message is encoded".
 *
 * Every link produced here is a wa.me deep link that OPENS a prefilled
 * chat. WhatsApp never sends it - the person still presses Send - which is
 * why a prefilled message is safe to build on the guest's behalf.
 */

/** Digits only, international format without "+", 8-15 digits (E.164). */
export function normalizeWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("00")) digits = digits.slice(2);
  digits = digits.replace(/\D/g, "");
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

/**
 * Chat with a specific number. Returns null when the number isn't a valid
 * E.164-ish value, so a half-typed or private-looking value can never
 * become a link.
 */
export function whatsappUrl(number: string | null | undefined, message?: string | null): string | null {
  const digits = normalizeWhatsAppNumber(number);
  if (!digits) return null;
  return message && message.trim()
    ? `https://wa.me/${digits}?text=${encodeURIComponent(message.trim())}`
    : `https://wa.me/${digits}`;
}

/**
 * "Share on WhatsApp" - no recipient. Opens WhatsApp with the text ready
 * and lets the sharer pick who to send it to. Used by Publish & Share, so
 * it deliberately carries no phone number of anyone's.
 */
export function whatsappShareUrl(text: string): string | null {
  const body = text.trim();
  if (!body) return null;
  return `https://wa.me/?text=${encodeURIComponent(body)}`;
}

/**
 * The message a teacher/organizer sends when sharing their own Space.
 * Deliberately short and human: one line of who, one line of what, the
 * public link last so it previews at the bottom of the chat bubble.
 */
export function shareSpaceMessage({
  name,
  role,
  url,
}: {
  name: string;
  role?: string | null;
  url: string;
}): string {
  const who = role ? `${name} - ${role}` : name;
  return `${who}\n${url}`;
}
