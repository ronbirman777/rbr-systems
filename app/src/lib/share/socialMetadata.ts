import type { Metadata } from "next";
import { GUEST_PUBLIC_ORIGIN } from "@/lib/site-url";
import { OG_SIZE } from "./shareCardSize";
import { socialImageUrl, socialTitle } from "./spaceSocial";
import type { SocialSpace } from "./publishedSocialSpace";

/**
 * Open Graph / Twitter metadata for a published Space's public address.
 * One builder for every Space type, fed by SpaceSocialIdentity, so Flow and
 * Heal get the same treatment the day their resolver lands.
 *
 * og:image is set explicitly rather than left to the `opengraph-image`
 * file convention: the URL must be absolute on the public guest origin for
 * a crawler that has no page context, and in dev Next resolves
 * convention-generated image URLs against the request origin (localhost)
 * regardless of metadataBase. Building it here means the tag is correct in
 * every environment and carries the publish version, which is what makes a
 * republish actually reach WhatsApp's preview cache.
 *
 * Twitter has no image of its own and falls back to og:image, so only the
 * card type and the text are declared there.
 *
 * A Space that is unavailable, or whose product has no guest app, gets no
 * preview at all rather than an empty-looking one.
 */
export function spaceMetadata(space: SocialSpace | null, path: string): Metadata {
  const base = { metadataBase: new URL(GUEST_PUBLIC_ORIGIN) };
  if (!space || !space.identity || space.access === "unavailable") return base;

  const url = `${GUEST_PUBLIC_ORIGIN}${path}`;
  const { identity } = space;

  // A code-protected Space must not advertise its contents. Name only -
  // the same thing its Guest Access screen already shows to everyone - and
  // never indexed.
  if (space.access === "code-required") {
    return {
      ...base,
      title: identity.name,
      robots: { index: false, follow: false },
      alternates: { canonical: url },
      openGraph: { type: "profile", title: identity.name, url, siteName: "InnerDweS" },
      twitter: { card: "summary_large_image", title: identity.name },
    };
  }

  const title = socialTitle(identity);
  const description = identity.description || undefined;
  const images = space.slug
    ? [
        {
          url: socialImageUrl(GUEST_PUBLIC_ORIGIN, space.slug, identity.version),
          width: OG_SIZE.width,
          height: OG_SIZE.height,
          alt: title,
          type: "image/png",
        },
      ]
    : undefined;

  return {
    ...base,
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "profile",
      title,
      description,
      url,
      siteName: "InnerDweS",
      images,
    },
    twitter: { card: "summary_large_image", title, description, images },
  };
}
