import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { resolveGuestAccess } from "@/lib/guestAccess/effectiveAccess";
import { publishedIdentityImageRefs } from "@/lib/guestAccess/publishedIdentity";
import { MEDIA_BUCKET, MEDIA_SIGNED_URL_TTL_SECONDS, collectMediaRefs } from "@/lib/media/path";
import { buildSpaceSocialIdentity, type SocialSpaceRow, type SpaceSocialIdentity } from "./spaceSocial";

/**
 * Server-only data access for link previews and share cards.
 *
 * Reads `published_spaces` through the same session-free public client the
 * Guest route itself uses, so the only rows reachable are ones RLS already
 * serves to anonymous visitors - a draft Space has no row here at all.
 *
 * `cache()` dedupes within a request, so generateMetadata, the page body
 * and generateImageMetadata share one query instead of three. It is a
 * per-REQUEST memo only, never a route cache: the Guest route's
 * force-dynamic contract (commercial availability is an authorization
 * decision, never cached content) is unchanged by it.
 */

export type SocialSpace = {
  tenantId: string;
  slug: string | null;
  /** Null when the product has no guest app - the Space is still loaded,
   * because the Guest route must stay indistinguishable before a code. */
  identity: SpaceSocialIdentity | null;
  /** Guest access state, so a code-protected Space can be rendered reduced. */
  access: "granted" | "code-required" | "unavailable";
  modules: unknown;
  /** The whole published row, so the Guest page itself reuses this one read. */
  row: PublishedRow;
};

type PublishedRow = SocialSpaceRow & {
  tenant_id: string;
  product_type: string;
  timezone: string | null;
  enabled_modules: string[] | null;
};

const SELECT = "tenant_id, product_type, name, theme, timezone, enabled_modules, modules, slug, published_at";

async function load(column: "slug" | "tenant_id", value: string): Promise<SocialSpace | null> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("published_spaces")
    .select(SELECT)
    .eq(column, value)
    .maybeSingle<PublishedRow>();

  if (!data) return null;
  // Deliberately NOT a early return when there is no identity: an
  // unsupported product_type must reach the same access screen as every
  // other Space, or the preview layer would turn "no guest app" into a
  // 404 that is visible before any code is entered.
  const identity = buildSpaceSocialIdentity(data);

  let access: SocialSpace["access"];
  try {
    access = await resolveGuestAccess(data.tenant_id);
  } catch {
    // A failed availability check must not publish a preview for a Space
    // that may be lapsed - fail closed, same as the Guest route.
    access = "unavailable";
  }

  return { tenantId: data.tenant_id, slug: data.slug, identity, access, modules: data.modules, row: data };
}

export const socialSpaceBySlug = cache((slug: string) => load("slug", slug));
export const socialSpaceByTenantId = cache((tenantId: string) => load("tenant_id", tenantId));

/**
 * What a link preview may show for this Space.
 *
 *  granted        everything in the snapshot
 *  code-required  only what the Guest Access code screen ALREADY shows to
 *                 every visitor before a code is entered: the Space name
 *                 and its hero/logo (publishedIdentityImageRefs is the
 *                 single definition of that set). No role, no bio.
 *  unavailable    nothing at all.
 */
export function previewableIdentity(space: SocialSpace): SpaceSocialIdentity | null {
  if (!space.identity) return null;
  if (space.access === "unavailable") return null;
  if (space.access === "granted") return space.identity;

  const { heroImageRef, logoImageRef } = publishedIdentityImageRefs(space.modules);
  const pregate = space.identity.imageRef;
  return {
    ...space.identity,
    role: null,
    location: null,
    description: "",
    imageRef: pregate === heroImageRef || pregate === logoImageRef ? pregate : heroImageRef,
  };
}

/**
 * Bytes for a published image ref, ready to embed in a generated image.
 *
 * The ref must be one THIS snapshot actually publishes - Storage existence
 * is never authorization - which is the same rule /api/media enforces for
 * guests. The admin client appears only after that check and only to mint
 * a short-lived signed URL, exactly as /api/media does.
 *
 * Two things make this a transform request rather than a raw download:
 *
 *  1. Satori (next/og) cannot decode WebP, and every image the Teach
 *     publish pipeline writes is `published.webp`. Storage's render
 *     endpoint picks its output format from the Accept header, so asking
 *     for image/jpeg yields a JPEG that Satori can actually rasterise.
 *     Without this the card silently loses the photo.
 *  2. It downloads a card-sized render instead of the full-resolution
 *     original, which is the difference between a ~100KB and a multi-MB
 *     fetch per generation.
 *
 * Width only, never width+height: cropping stays with the card so the
 * teacher's own focal point still decides what is in frame. A project
 * without Storage transformations falls back to the plain object, and
 * anything Satori cannot decode is dropped rather than rendered broken.
 */
const SATORI_DECODABLE = new Set(["image/jpeg", "image/png"]);

export type PublishedImage = { bytes: ArrayBuffer; contentType: string };

export async function fetchPublishedImage(
  modules: unknown,
  ref: string | null,
  width = 1200
): Promise<PublishedImage | null> {
  if (!ref) return null;
  if (!collectMediaRefs(modules).has(ref)) return null;

  const admin = createAdminClient();

  for (const options of [{ transform: { width } }, undefined]) {
    const { data: signed, error } = await admin.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(ref, MEDIA_SIGNED_URL_TTL_SECONDS, options);
    if (error || !signed) continue;

    try {
      const res = await fetch(signed.signedUrl, { headers: { Accept: "image/jpeg" } });
      if (!res.ok) continue;
      const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!SATORI_DECODABLE.has(contentType)) continue;
      return { bytes: await res.arrayBuffer(), contentType };
    } catch {
      /* try the next strategy */
    }
  }
  return null;
}
