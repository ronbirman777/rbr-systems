import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildGuestSpaceUrl } from "@/lib/guestSpaceUrl";
import { qrPngBuffer } from "@/lib/share/qr";
import { parseTeachItems } from "@/lib/teach/schemas";
import { buildRegistrationCta } from "@/lib/teach/links";

/**
 * Generates a QR code on demand - nothing is ever stored. Two targets, and
 * in BOTH cases the encoded URL is re-derived server-side from this
 * tenant's own stored data, never taken from a query parameter, so a
 * crafted request can never point a QR at an arbitrary URL.
 *
 *   (no params)      the public Guest App address (/s/<slug>), the one QR
 *                    that belongs on a flyer or a studio wall. It follows
 *                    the current slug the moment it changes.
 *   ?class=<itemId>  that class's WhatsApp registration link: opens a chat
 *                    with the teacher's own configured public number, with
 *                    the enquiry prefilled. WhatsApp never sends it - the
 *                    person still presses Send.
 *
 * The class QR exists ONLY for a class whose registration method is
 * actually WhatsApp. Any other method (website, Instagram, venue booking)
 * returns 404 rather than inventing a WhatsApp link, and a class whose
 * stored number is not a valid public number does the same - so a number
 * the teacher never published as a registration contact can never leak
 * into a QR.
 *
 * Organizer-only: uses the RLS-scoped client exactly like the configurator
 * page itself, so a tenant id that isn't this signed-in user's own Space
 * simply returns nothing to select, the same fail-closed shape as every
 * other Studio read.
 */
export async function GET(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Not found", { status: 404 });

  const { data: tenant } = await supabase.from("tenants").select("id, name, slug").eq("id", tenantId).maybeSingle();
  if (!tenant) return new NextResponse("Not found", { status: 404 });

  const spaceUrl = buildGuestSpaceUrl(tenant.id, tenant.slug);
  const classId = new URL(request.url).searchParams.get("class");

  let target = spaceUrl;
  if (classId) {
    const classUrl = await whatsappClassUrl(supabase, tenant.id, tenant.name ?? "", classId, spaceUrl);
    if (!classUrl) return new NextResponse("Not found", { status: 404 });
    target = classUrl;
  }

  const png = await qrPngBuffer(target);

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
    },
  });
}

async function whatsappClassUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  teacherName: string,
  classId: string,
  spaceUrl: string
): Promise<string | null> {
  const { data: row } = await supabase
    .from("module_items")
    .select("id, title, metadata")
    .eq("tenant_id", tenantId)
    .eq("module_key", "teachClasses")
    .eq("id", classId)
    .maybeSingle<{ id: string; title: string | null; metadata: unknown }>();
  if (!row) return null;

  const [item] = parseTeachItems("teachClasses", [row]);
  if (!item || item.metadata.registration.method !== "whatsapp") return null;

  // Reuses the Guest App's own registration-CTA builder, so the printed QR
  // and the in-app button can never drift apart; the only difference is
  // that the QR also carries the public Space URL, because whoever scans a
  // flyer has no other context.
  const cta = buildRegistrationCta(teacherName, item.title || "your class", item.metadata, spaceUrl);
  return cta && cta.href.startsWith("https://wa.me/") ? cta.href : null;
}
