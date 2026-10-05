import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n";

export type GuestAccessCopy = { title: string; openLabel: string; askHint: string };

/**
 * Copy for the Guest Access code screen, which is shown BEFORE a visitor has
 * proven they may see the Space. It therefore must not reveal the Space's
 * product: only Time to Flow keeps its existing, established wording (so
 * existing Spaces look exactly as before); every other value - Teach,
 * not-yet-supported or unknown types alike - gets the same neutral wording,
 * so the screen cannot be used to tell those apart.
 */
export function guestAccessCopy(
  productType: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE
): GuestAccessCopy {
  // Only the retreat wording is product-specific; everything else shares
  // the neutral set, so the screen still cannot be used to tell a Teach
  // Space from an unsupported one. Translating does not change that:
  // each locale has the same two variants and no more.
  const retreat = productType === "retreat";
  return {
    title: translate(locale, "flow", retreat ? "gatePrivateRetreat" : "gatePrivateSpace"),
    openLabel: translate(locale, "flow", retreat ? "gateOpenRetreat" : "gateOpen"),
    askHint: translate(locale, "flow", retreat ? "gateAskOrganizer" : "gateAskOwner"),
  };
}
