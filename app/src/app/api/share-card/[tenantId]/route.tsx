import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildGuestSpaceUrl } from "@/lib/guestSpaceUrl";
import { socialSpaceByTenantId } from "@/lib/share/publishedSocialSpace";
import { buildShareImage } from "@/lib/share/shareImage";

/**
 * The downloadable Share Card: the same generated design as the link
 * preview, in a portrait format sized for messaging, email and light
 * printing, plus the QR and its CTA.
 *
 * Rendered deterministically from the PUBLISHED snapshot - not from draft
 * Studio state - so what a teacher hands out always matches what a guest
 * actually opens. Before the first publish there is nothing to render and
 * this is a 404, exactly like the QR endpoint.
 *
 * Organizer-only, with the same shape as /api/qr: the RLS-scoped client
 * means a tenant id that isn't this signed-in user's own Space simply
 * selects nothing. The QR target is re-derived server-side from that
 * tenant's own slug and never read from the request, so this endpoint
 * cannot be pointed at an arbitrary URL.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Not found", { status: 404 });

  const { data: tenant } = await supabase.from("tenants").select("id, slug").eq("id", tenantId).maybeSingle();
  if (!tenant) return new NextResponse("Not found", { status: 404 });

  const space = await socialSpaceByTenantId(tenant.id);
  if (!space?.identity) return new NextResponse("Not found", { status: 404 });

  return buildShareImage({
    identity: space.identity,
    modules: space.modules,
    variant: "card",
    qrUrl: buildGuestSpaceUrl(tenant.id, tenant.slug),
    // The organizer's own copy of their card is never a public, cacheable
    // asset - it follows their draft slug the moment it changes.
    headers: { "Cache-Control": "private, no-store" },
  });
}
