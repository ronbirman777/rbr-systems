import { SPACE_TYPES } from "./registry";

export type GuestAccessCopy = { title: string; openLabel: string; askHint: string };

/**
 * Copy for the Guest Access code screen, which is shown BEFORE a visitor has
 * proven they may see the Space. It therefore must not reveal the Space's
 * product: only Time to Flow keeps its existing, established wording (so
 * existing Spaces look exactly as before); every other value - Teach,
 * not-yet-supported or unknown types alike - gets the same neutral wording,
 * so the screen cannot be used to tell those apart.
 */
const NEUTRAL: GuestAccessCopy = {
  title: "Private Space",
  openLabel: "Open",
  askHint: "Ask the owner of this space for the access code.",
};

export function guestAccessCopy(productType: string | null | undefined): GuestAccessCopy {
  return productType === "retreat" ? SPACE_TYPES.retreat.copy.guestAccess : NEUTRAL;
}
