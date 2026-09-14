import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { buildGuestSpaceUrl } from "@/lib/guestSpaceUrl";

/**
 * Generates the Share Your Space QR code on demand - nothing is ever
 * stored. The target URL is always re-derived server-side from this
 * tenant's own slug (never trusted from a query param), so the QR can
 * never be pointed at an arbitrary URL by a crafted request, and it
 * automatically follows the current slug the moment it changes.
 *
 * Organizer-only: uses the RLS-scoped client exactly like the
 * configurator page itself, so a tenant id that isn't this signed-in
 * user's own Space simply returns nothing to select, same fail-closed
 * shape as every other Studio read.
 *
 * `format=png` today; a later PDF/print export can branch on the same
 * query param without a new route - not built now, per the Distribution
 * phase brief's "don't build a large print-design system yet".
 */
export async function GET(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Not found", { status: 404 });

  const { data: tenant } = await supabase.from("tenants").select("id, slug").eq("id", tenantId).maybeSingle();
  if (!tenant) return new NextResponse("Not found", { status: 404 });

  const url = buildGuestSpaceUrl(tenant.id, tenant.slug);
  const png = await QRCode.toBuffer(url, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 640,
    color: { dark: "#1B2E24", light: "#F3EFE7" },
  });

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
    },
  });
}
