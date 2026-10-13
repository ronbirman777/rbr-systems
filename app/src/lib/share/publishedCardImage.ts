import { brandMediaSchema, DEFAULT_PUBLISHED_THEME, publishedThemeSchema } from "@/lib/modules/publishedTheme";
import { collectMediaRefs, isPublishedMediaPath, publicMediaUrl } from "@/lib/media/path";
import { isTenantMediaRef } from "@/lib/teach/schemas";
import { PALETTES } from "@/lib/theme/tokens";
import { localeFromPublishedModules } from "@/lib/spaceSettings";
import { shareCardImagePath } from "@/lib/studio/publicLink";
import type { Locale } from "@/lib/i18n";
import type { SpaceSocialIdentity } from "./spaceSocial";

/**
 * TASK 033 P1 (owner decisions A3/A4) - what a Share Card is allowed to
 * show, derived from the PUBLISHED snapshot (`published_spaces`) only.
 *
 * Draft Studio state (brand_configs, module_settings, the live editor's
 * own useState) is structurally unreachable from here: every function takes
 * a published row or its `modules` payload and nothing else. So a draft
 * change that has not been republished can never reach the card, and a
 * card can never mix a published photo with unpublished branding.
 *
 * Image source order (Time to Flow, A3):
 *   1. published Space image  modules.brand.space.imageRef
 *   2. published Hero image   modules.brand.hero.imageRef
 *   3. null                   -> the card's own brand gradient fallback
 *
 * Every ref must pass BOTH checks, or it is ignored as if it were absent:
 *   - it is this tenant's own published object: the tenant-prefix shape
 *     rule of isTenantMediaRef (applied to the draft twin of the path, since
 *     isTenantMediaRef names the draft object) plus a `published.<ext>`
 *     file name - a draft path is never returned;
 *   - it is actually referenced by this snapshot (collectMediaRefs), the
 *     same membership rule /api/media enforces before it serves anything.
 */

export type PublishedCardImage = { ref: string; source: "space" | "hero" };

/** The draft object path a published ref was copied from. */
function draftTwin(ref: string): string | null {
  const match = ref.match(/^(.*)\/published\.([a-zA-Z0-9]+)$/);
  return match ? `${match[1]}/draft.${match[2]}` : null;
}

/** True only for a published object of THIS tenant that THIS snapshot references. */
export function isPublishedTenantRef(tenantId: string, ref: unknown, publishedRefs: ReadonlySet<string>): ref is string {
  if (typeof ref !== "string" || ref.length === 0) return false;
  if (!isPublishedMediaPath(ref)) return false;
  const twin = draftTwin(ref);
  if (!twin || !isTenantMediaRef(tenantId, twin)) return false;
  return publishedRefs.has(ref);
}

function publishedBrandMedia(modules: unknown) {
  const brand = modules && typeof modules === "object" ? (modules as Record<string, unknown>).brand : undefined;
  const parsed = brandMediaSchema.safeParse(brand);
  return parsed.success ? parsed.data : {};
}

/** Space image -> Hero -> null (gradient). See the module comment. */
export function resolvePublishedCardImage(args: { tenantId: string; modules: unknown }): PublishedCardImage | null {
  const { tenantId, modules } = args;
  const refs = collectMediaRefs(modules);
  const media = publishedBrandMedia(modules);
  const space = media.space?.imageRef;
  if (isPublishedTenantRef(tenantId, space, refs)) return { ref: space, source: "space" };
  const hero = media.hero?.imageRef;
  if (isPublishedTenantRef(tenantId, hero, refs)) return { ref: hero, source: "hero" };
  return null;
}

/** The published logo ref, under the same two checks. */
export function resolvePublishedLogoRef(args: { tenantId: string; modules: unknown }): string | null {
  const logo = publishedBrandMedia(args.modules).logo?.imageRef;
  return isPublishedTenantRef(args.tenantId, logo, collectMediaRefs(args.modules)) ? logo : null;
}

/** Primary/secondary exactly as the Studio derives them, from the published theme. */
export function publishedCardColors(theme: unknown): { primaryHex: string; secondaryHex: string } {
  const parsed = publishedThemeSchema.safeParse(theme);
  const t = parsed.success ? parsed.data : DEFAULT_PUBLISHED_THEME;
  const palette = PALETTES[t.palette] ?? PALETTES[DEFAULT_PUBLISHED_THEME.palette];
  return {
    primaryHex: t.customPrimary ?? palette.primary,
    secondaryHex: t.customSecondary ?? palette.secondary,
  };
}

/** Everything the browser-drawn Flow Share Card reads. All published. */
export type PublishedShareCard = {
  /** The publish this card was built from - the draw effect keys on it. */
  publishedAt: string;
  name: string;
  /** /api/media URL of the published Space image or Hero, else null. */
  publishedCardImageUrl: string | null;
  imageSource: PublishedCardImage["source"] | null;
  logoUrl: string | null;
  primaryHex: string;
  secondaryHex: string;
  locale: Locale;
};

export type PublishedShareCardRow = {
  name: string | null;
  theme: unknown;
  modules: unknown;
  published_at: string | null;
};

/** Null before the first publish: there is nothing published to show. */
export function buildPublishedShareCard(tenantId: string, row: PublishedShareCardRow | null | undefined): PublishedShareCard | null {
  if (!row || !row.published_at) return null;
  const image = resolvePublishedCardImage({ tenantId, modules: row.modules });
  const logoRef = resolvePublishedLogoRef({ tenantId, modules: row.modules });
  return {
    publishedAt: row.published_at,
    name: row.name ?? "",
    publishedCardImageUrl: image ? publicMediaUrl(image.ref) : null,
    imageSource: image?.source ?? null,
    logoUrl: logoRef ? publicMediaUrl(logoRef) : null,
    ...publishedCardColors(row.theme),
    locale: localeFromPublishedModules(row.modules),
  };
}

/** Same instant, whatever the serialisation (RPC result vs. row select). */
function samePublish(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  if (a === b) return true;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return Number.isFinite(ta) && ta === tb;
}

/**
 * The published card to draw: the server-provided one while it matches the
 * current publish, otherwise the freshly re-read one. Pure, so the
 * "republish refreshes the card" rule is unit-testable without a DOM.
 */
export function selectPublishedCard(
  initial: PublishedShareCard | null,
  refreshed: PublishedShareCard | null,
  publishedAt: string | null
): { card: PublishedShareCard | null; stale: boolean } {
  if (!publishedAt) return { card: null, stale: false };
  if (refreshed && samePublish(refreshed.publishedAt, publishedAt)) return { card: refreshed, stale: false };
  if (initial && samePublish(initial.publishedAt, publishedAt)) return { card: initial, stale: false };
  // A publish happened in this session after the snapshot we hold: keep
  // showing the newest card we have until the re-read lands.
  return { card: refreshed ?? initial, stale: true };
}

/**
 * Time to Teach (A4). The server-rendered Teach card keeps its own working
 * chain and only gains a preferred first source. Documented order:
 *
 *   1. published Space image  modules.brand.space.imageRef (centre crop)
 *   2. teacher portrait       modules.teach.settings.teachAbout.profile
 *   3. published Hero image   modules.brand.hero.imageRef
 *   4. brand-tinted ground    (renderShareCard's no-image fallback)
 *
 * 2-4 are exactly what buildSpaceSocialIdentity already resolves (portrait,
 * then hero, each with its own focal point); fetchPublishedImage then
 * re-checks membership in this same snapshot before reading any bytes.
 * The link-preview (OG) identity is deliberately not changed by this.
 */
export function withPublishedSpaceImage(
  tenantId: string,
  modules: unknown,
  identity: SpaceSocialIdentity
): SpaceSocialIdentity {
  const space = publishedBrandMedia(modules).space?.imageRef;
  if (!isPublishedTenantRef(tenantId, space, collectMediaRefs(modules))) return identity;
  return { ...identity, imageRef: space, imagePosition: null };
}

/**
 * The organizer's Teach Share Card URL with an image-version parameter.
 * Republishing changes `publishedAt`, so the URL changes and the browser
 * can never reuse an in-memory copy of the previous card.
 */
export function shareCardImageUrl(tenantId: string, publishedAt: string | null | undefined): string {
  const base = shareCardImagePath(tenantId);
  return publishedAt ? `${base}?v=${encodeURIComponent(publishedAt)}` : base;
}

/**
 * Which language the card's CTA is drawn in (TASK 033 P1, A4): the
 * PUBLISHED Space language, with Hebrew falling back to English - the same
 * documented limitation as the Flow card's shareCardLocale(). Satori draws
 * glyphs left to right with no bidi reordering, so a Hebrew CTA would be
 * rendered reversed; an English CTA is the honest outcome until the card
 * gets a direction-aware layout.
 */
export function shareCardCtaLocale(locale: Locale): Locale {
  return locale === "he" ? "en" : locale;
}
