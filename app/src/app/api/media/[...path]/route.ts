import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { MEDIA_BUCKET, collectImageRefs } from "@/lib/media/path";

/**
 * The ONLY way an anonymous guest can ever reach a file in the private
 * `tenant-media` bucket. It never trusts the requested path by itself:
 * it re-derives the tenant from the path, loads that tenant's actual
 * published snapshot (through the same public/anon client the guest route
 * uses - no elevated access at this step), and only mints a signed URL if
 * the requested path is one this tenant genuinely published right now.
 *
 * This means removing an image, or disabling/never-publishing a module,
 * makes its file unreachable here immediately - not just hidden from the
 * rendered UI. The admin (service-role) client only appears after that
 * check has already passed, is never exposed to the browser, and is only
 * ever used to mint a short-lived signed URL - never to serve or expose
 * the bucket directly.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  if (!path || path.length < 2) {
    return new NextResponse("Not found", { status: 404 });
  }

  const objectPath = path.join("/");
  const tenantId = path[0];

  const publicClient = createPublicClient();
  const { data: space } = await publicClient
    .from("published_spaces")
    .select("modules")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!space) {
    return new NextResponse("Not found", { status: 404 });
  }

  const publishedRefs = collectImageRefs(space.modules);
  if (!publishedRefs.has(objectPath)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(objectPath, 3600);

  if (error || !signed) {
    return new NextResponse("Not found", { status: 404 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
