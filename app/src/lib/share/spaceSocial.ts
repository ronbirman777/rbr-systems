import type { FocalPoint } from "@/lib/media/focalPoint";
import type { BrandConfig } from "@/lib/theme/tokens";
import { brandMediaSchema } from "@/lib/modules/publishedTheme";
import { brandFromPublishedTheme } from "@/lib/teach/guestData";
import { parseTeachSetting } from "@/lib/teach/schemas";
import { resolveSpaceType } from "@/lib/spaceTypes/registry";

/**
 * The one shape every Space type reduces to for sharing - link previews,
 * the share card, and the WhatsApp share message all read this and nothing
 * else. Per product it means:
 *
 *   Teach   name = teacher,      role = teacher type
 *   Flow    name = retreat,      role = facilitator/location  (generic today)
 *   Heal    name = practitioner, role = modality              (not built yet)
 *
 * so a new product adds ONE resolver below instead of a second metadata,
 * OG-image and share-card implementation of its own.
 *
 * Built exclusively from a row of `published_spaces`. Draft Studio state,
 * `module_settings` (where the private InnerDweS directory opt-in lives)
 * and anything else private are structurally unreachable from here.
 */
export type SpaceSocialIdentity = {
  name: string;
  /** Teacher type / facilitator / modality. Null when the Space has none. */
  role: string | null;
  location: string | null;
  description: string;
  /** Published media ref for the portrait/hero. Never a draft path. */
  imageRef: string | null;
  imagePosition: FocalPoint | null;
  brand: BrandConfig;
  /** Changes on every publish - see versionFromPublishedAt. */
  version: string;
};

export type SocialSpaceRow = {
  product_type: string | null;
  name: string;
  theme: unknown;
  modules: unknown;
  slug: string | null;
  published_at?: string | null;
};

const MAX_DESCRIPTION = 200;

/**
 * Trims to whole sentences within the limit, falling back to a word
 * boundary. Social clients hard-truncate mid-word otherwise, and WhatsApp
 * in particular shows very little - so short and complete beats long and
 * cut off.
 */
export function concisePreviewText(raw: string | null | undefined, limit = MAX_DESCRIPTION): string {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= limit) return text;

  const window = text.slice(0, limit + 1);
  const lastSentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
  if (lastSentence >= limit * 0.5) return window.slice(0, lastSentence + 1).trim();

  const lastSpace = window.lastIndexOf(" ");
  return `${window.slice(0, lastSpace > 0 ? lastSpace : limit).trim()}…`;
}

/**
 * Stable 8-char token derived from the snapshot's publish timestamp. It is
 * the OG image's URL segment, so republishing mints a NEW image URL and
 * caches that key by URL (WhatsApp does) fetch the new card instead of
 * serving the old one forever.
 */
export function versionFromPublishedAt(publishedAt: string | null | undefined): string {
  const seed = publishedAt ?? "unpublished";
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seed.length; i++) {
    h1 = Math.imul(h1 ^ seed.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + seed.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  return (h1.toString(36) + h2.toString(36)).slice(0, 8).padEnd(8, "0");
}

function heroRef(modules: unknown): string | null {
  const parsed = brandMediaSchema.safeParse(
    modules && typeof modules === "object" ? (modules as Record<string, unknown>).brand : undefined
  );
  return parsed.success ? (parsed.data.hero?.imageRef ?? null) : null;
}

function teachIdentity(space: SocialSpaceRow): SpaceSocialIdentity {
  const modules = (space.modules ?? {}) as Record<string, unknown>;
  const teach = (modules.teach ?? {}) as { settings?: Record<string, unknown> };
  const settingsRaw = teach.settings ?? {};
  const profile = parseTeachSetting("teachProfile", settingsRaw.teachProfile);
  const about = parseTeachSetting("teachAbout", settingsRaw.teachAbout);
  const contact = parseTeachSetting("teachContact", settingsRaw.teachContact);

  // The teacher's own portrait is the better share visual when they set
  // one (it is a face, cropped by their own focal point); the Home hero is
  // the fallback. Both are published refs from this same snapshot.
  const portrait = about.profile.imageRef;
  const imageRef = portrait ?? heroRef(modules);
  const imagePosition = portrait ? about.profile.imagePosition : profile.heroImagePosition;

  const description =
    concisePreviewText(about.about) ||
    concisePreviewText(contact.intro) ||
    concisePreviewText(about.philosophy) ||
    concisePreviewText([profile.teacherType, profile.locationLine].filter(Boolean).join(" · "));

  return {
    name: space.name,
    role: profile.teacherType,
    location: profile.locationLine ?? contact.locationName,
    description,
    imageRef,
    imagePosition: imagePosition ?? null,
    brand: brandFromPublishedTheme(space.name, space.theme),
    version: versionFromPublishedAt(space.published_at),
  };
}

/**
 * Flow/Heal placeholder: name + brand + hero only, with no product-specific
 * copy invented for them. Replaced by a real resolver when each product's
 * published payload grows the fields (facilitator/location, modality).
 */
function genericIdentity(space: SocialSpaceRow): SpaceSocialIdentity {
  return {
    name: space.name,
    role: null,
    location: null,
    description: "",
    imageRef: heroRef(space.modules),
    imagePosition: null,
    brand: brandFromPublishedTheme(space.name, space.theme),
    version: versionFromPublishedAt(space.published_at),
  };
}

export function buildSpaceSocialIdentity(space: SocialSpaceRow): SpaceSocialIdentity | null {
  const resolved = resolveSpaceType(space.product_type);
  if (resolved.kind !== "known" || !resolved.type.guest) return null;
  return resolved.type.guest.renderer === "teach" ? teachIdentity(space) : genericIdentity(space);
}

/**
 * Absolute URL of a Space's generated link-preview image. Absolute, not
 * relative, because a social crawler resolves og:image on its own and has
 * no page context - and built here rather than left to metadataBase so it
 * is the public guest origin in every environment, including dev.
 */
export function socialImageUrl(origin: string, slug: string, version: string): string {
  return `${origin}/s/${encodeURIComponent(slug)}/social/${encodeURIComponent(version)}`;
}

/** "Lena Hoffmann — Yoga & Breathwork Educator" (em dash, role omitted when absent). */
export function socialTitle(identity: Pick<SpaceSocialIdentity, "name" | "role">): string {
  return identity.role ? `${identity.name} — ${identity.role}` : identity.name;
}
