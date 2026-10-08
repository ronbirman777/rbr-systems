import "server-only";
import { socialSpaceBySlug, socialSpaceByTenantId } from "@/lib/share/publishedSocialSpace";
import { canonicalFlowGuestUrl, parseFlowGuestUrl } from "./retreats";

/**
 * Proves, on the server, that a teacher's "linked InnerDweS retreat" really
 * is a Flow Space that guests can open RIGHT NOW.
 *
 * It reuses the Guest App's own read path: published_spaces through the
 * session-free public client (so a draft Space has no row at all, and an
 * archived one is hidden by RLS), then resolveGuestAccess (commercial
 * availability, then guest-access mode). Nothing here uses the admin
 * client to widen what a visitor could see, and no access control is
 * bypassed - a Space behind an access code is reported as "notPublic" and
 * is never linked.
 */
export type FlowLinkCheck =
  | { ok: true; canonicalUrl: string; name: string }
  | { ok: false; reason: "invalid" | "notFound" | "notFlow" | "notPublic" };

export async function checkFlowGuestUrl(raw: string | null | undefined): Promise<FlowLinkCheck> {
  const ref = parseFlowGuestUrl(raw);
  if (!ref) return { ok: false, reason: "invalid" };

  const space = ref.kind === "slug" ? await socialSpaceBySlug(ref.slug) : await socialSpaceByTenantId(ref.tenantId);
  if (!space) return { ok: false, reason: "notFound" };
  if (space.row.product_type !== "retreat") return { ok: false, reason: "notFlow" };
  if (space.access !== "granted") return { ok: false, reason: "notPublic" };

  return {
    ok: true,
    canonicalUrl: canonicalFlowGuestUrl({ tenantId: space.tenantId, slug: space.slug }),
    name: space.row.name,
  };
}
