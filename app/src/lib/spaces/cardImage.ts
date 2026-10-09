import { imagePositionSchema, type ImagePosition } from "@/lib/modules/imagePosition";
import { isTenantMediaRef, parseTeachSetting } from "@/lib/teach/schemas";

/**
 * Which picture represents a Space on its My Spaces card (TASK 031 W2).
 *
 * The rule is DETERMINISTIC and FIXED - the first source below that has an
 * image wins, in this order, and nothing else is ever consulted. No module
 * item is scanned, nothing is sampled, and no "best" image is chosen by
 * size or content.
 *
 *  Time to Teach
 *    1. the Space image    (brand_configs.space_image_ref - only if the
 *                           teacher set one explicitly)
 *    2. the hero image     (brand_configs.hero_image_ref, with the focal
 *                           point stored on teachProfile)
 *    3. the teacher's own profile photo (teachAbout.profile)
 *    4. a cover:           the Contact cover, then the Explore card covers
 *                           in the fixed order Readings, Audio, Contact
 *    5. nothing            -> the generic InnerDweS fallback (the caller's)
 *
 *  Every other product (Time to Flow)
 *    1. the Space image, then 2. the hero image, then 3. nothing.
 *    A Flow Space that already shows its Space image is unchanged; the hero
 *    only appears where the card used to show the generic placeholder.
 *
 * All of this reads rows the page has ALREADY fetched in one batched query
 * per table, so choosing an image costs no extra request, and exactly one
 * Storage object is signed per card - never every candidate.
 *
 * Every ref must live under THIS tenant's own prefix; anything else is
 * ignored (a stale or tampered ref can never make a card sign another
 * Space's object).
 */

export type CardImage = {
  ref: string;
  /** Focal point of the image actually chosen; null means centre. */
  position: ImagePosition | null;
  source: "space" | "hero" | "profile" | "cover";
};

export type CardBrandRow = { space_image_ref: string | null; hero_image_ref: string | null } | null | undefined;

/** The module_settings keys the Teach fallback chain reads - and nothing else. */
export const CARD_SETTINGS_KEYS = ["teachProfile", "teachAbout", "teachContact", "teachExplore"] as const;
export type CardSettingsKey = (typeof CARD_SETTINGS_KEYS)[number];

export type CardSettings = Partial<Record<CardSettingsKey, unknown>>;

function own(tenantId: string, ref: string | null | undefined): string | null {
  return typeof ref === "string" && ref.length > 0 && isTenantMediaRef(tenantId, ref) ? ref : null;
}

/** A focal point as stored, or null for anything that isn't one. */
function focal(value: unknown): ImagePosition | null {
  const parsed = imagePositionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function resolveSpaceCardImage(args: { tenantId: string; productType: string; brand: CardBrandRow; settings?: CardSettings }): CardImage | null {
  const { tenantId, productType, brand } = args;

  const space = own(tenantId, brand?.space_image_ref);
  if (space) return { ref: space, position: null, source: "space" };

  const hero = own(tenantId, brand?.hero_image_ref);

  if (productType !== "teach") {
    return hero ? { ref: hero, position: null, source: "hero" } : null;
  }

  const settings = args.settings ?? {};
  const profile = parseTeachSetting("teachProfile", settings.teachProfile);
  if (hero) return { ref: hero, position: profile.heroImagePosition ?? null, source: "hero" };

  const about = parseTeachSetting("teachAbout", settings.teachAbout);
  const photo = own(tenantId, about.profile.imageRef);
  if (photo) return { ref: photo, position: focal(about.profile.imagePosition), source: "profile" };

  const contact = parseTeachSetting("teachContact", settings.teachContact);
  const contactCover = own(tenantId, contact.cover.imageRef);
  if (contactCover) return { ref: contactCover, position: focal(contact.cover.imagePosition), source: "cover" };

  const cards = parseTeachSetting("teachExplore", settings.teachExplore).cards;
  for (const key of ["teachReadings", "teachAudio", "teachContact"] as const) {
    const ref = own(tenantId, cards[key]?.imageRef);
    if (ref) return { ref, position: focal(cards[key]?.imagePosition), source: "cover" };
  }
  return null;
}
