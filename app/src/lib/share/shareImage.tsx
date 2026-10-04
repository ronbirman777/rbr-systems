import "server-only";
import { ImageResponse } from "next/og";
import { qrSvgDataUri } from "./qr";
import { fetchPublishedImage } from "./publishedSocialSpace";
import { OG_SIZE, SHARE_CARD_SIZE, renderShareCard, type ShareCardVariant } from "./shareCard";
import type { SpaceSocialIdentity } from "./spaceSocial";

/**
 * Turns a published Space into a PNG. Shared by the public link-preview
 * route and the organizer-only Share Card download, so both always show
 * the same design from the same data.
 */

/** Long-lived: the URL carries a publish version, so a change means a new URL. */
export const SHARE_IMAGE_CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

function dataUri(image: { bytes: ArrayBuffer; contentType: string } | null): string | null {
  if (!image) return null;
  return `data:${image.contentType};base64,${Buffer.from(image.bytes).toString("base64")}`;
}

export async function buildShareImage({
  identity,
  modules,
  variant,
  qrUrl,
  cta,
  headers,
}: {
  identity: SpaceSocialIdentity;
  modules: unknown;
  variant: ShareCardVariant;
  /** "card" only - the public Guest App URL the QR must resolve to. */
  qrUrl?: string | null;
  cta?: string;
  headers?: Record<string, string>;
}): Promise<ImageResponse> {
  const size = variant === "card" ? SHARE_CARD_SIZE : OG_SIZE;

  // The portrait is read straight from Storage (verified against this very
  // snapshot) rather than through /api/media, so generation never depends
  // on the app being publicly reachable - which matters while the whole
  // site sits behind the InnerDweS preview gate.
  const [photo, qr] = await Promise.all([
    fetchPublishedImage(modules, identity.imageRef, size.width),
    variant === "card" && qrUrl ? qrSvgDataUri(qrUrl) : Promise.resolve(null),
  ]);

  return new ImageResponse(
    renderShareCard({
      identity,
      variant,
      imageDataUri: dataUri(photo),
      qrDataUri: qr,
      cta,
    }),
    {
      ...size,
      headers: { "Cache-Control": SHARE_IMAGE_CACHE_CONTROL, ...headers },
    }
  );
}
