import { NextResponse } from "next/server";
import { previewableIdentity, socialSpaceBySlug } from "@/lib/share/publishedSocialSpace";
import { buildShareImage } from "@/lib/share/shareImage";

/**
 * The link-preview image for a published Space, generated per request from
 * that Space's own published snapshot - no upload step, nothing stored.
 *
 * Deliberately a route handler rather than the `opengraph-image` file
 * convention: this needs a URL whose path carries the publish version
 * (socialImageUrl builds it), and it must never be collected or
 * prerendered at build time, since it reads live published state and a
 * live guest-access decision.
 *
 * Why the version is in the PATH: WhatsApp caches a link preview against
 * the og:image URL and will serve a stale card for days. A new publish
 * changes the version segment, so it is a new URL and a fresh fetch, while
 * within one version the image is immutable and cached hard. The segment
 * is a cache key only - a stale version still renders the Space's current
 * card rather than 404ing, so an old shared message never breaks.
 *
 * Nothing private can appear here: the only source is published_spaces,
 * and previewableIdentity further reduces a code-protected Space to the
 * name and hero its own Guest Access screen already shows publicly.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; version: string }> }) {
  const { slug } = await params;
  const space = await socialSpaceBySlug(slug);
  if (!space) return new NextResponse("Not found", { status: 404 });

  const identity = previewableIdentity(space);
  if (!identity) return new NextResponse("Not found", { status: 404 });

  return buildShareImage({ identity, modules: space.modules, variant: "og" });
}
