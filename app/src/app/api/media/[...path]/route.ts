import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import {
  MEDIA_BUCKET,
  MEDIA_SIGNED_URL_TTL_SECONDS,
  collectMediaRefs,
  isWellFormedMediaPath,
  parseVersionedMediaPath,
} from "@/lib/media/path";
import { AUDIO_EXTENSIONS, parseAudioDraftRef } from "@/lib/media/audio";
import { isReferencedDraftAudio } from "@/lib/media/draftAuthorization";
import { resolveGuestAccess } from "@/lib/guestAccess/effectiveAccess";
import { publishedIdentityImageRefs } from "@/lib/guestAccess/publishedIdentity";

/**
 * The ONLY way an anonymous guest can ever reach a file in the private
 * `tenant-media` bucket. A request is served only when BOTH hold:
 *
 *   1. the requested path is one this tenant genuinely published right now
 *      (its actual published snapshot, read through the same public/anon
 *      client the guest route uses - Storage existence is never
 *      authorization), AND
 *   2. this request may currently see that Space at all - the exact same
 *      policy the Guest App applies (resolveGuestAccess: commercial
 *      availability, then guest access code + cookie).
 *
 * The one deliberate exception is the code screen's own hero/logo: a
 * Space protected by an access code already shows those two brand images
 * to every visitor on the code-entry screen, so they are served without
 * the cookie (publishedIdentityImageRefs is the single definition of that
 * set). Everything else - item images, module covers, custom pages - needs
 * the cookie. A lapsed/unavailable Space serves nothing, brand images
 * included.
 *
 * Every denial is the same bare 404, so the response never reveals whether
 * a path exists, is unpublished, or belongs to a Space that is lapsed or
 * code-protected. Responses are never cacheable: they depend on the
 * caller's cookie and on live commercial/access state.
 *
 * Audio follows the same rules. A published audio object is served only
 * when the snapshot references that exact `published.<ext>` path (a
 * `draft.*` audio path is never served to a guest, even if a snapshot were
 * to name it). The one other caller is a signed-in member of the tenant
 * previewing a versioned DRAFT audio object: it is served only while that
 * member's own (RLS-scoped) draft data references that exact path - a
 * replaced version, an unattached upload, a published sibling or another
 * tenant's path is the same bare 404. Draft IMAGES are not served here
 * (the Studio signs those through its own session, as before).
 *
 * Only NEW requests obey current access. A signed URL already handed out
 * stays valid until it expires, which is why the TTL is deliberately short
 * (MEDIA_SIGNED_URL_TTL_SECONDS). The admin (service-role) client only
 * appears after both checks pass, is never exposed to the browser, and is
 * only ever used to mint that signed URL.
 */
const NO_STORE = { "Cache-Control": "private, no-store" };

function notFound() {
  return new NextResponse("Not found", { status: 404, headers: NO_STORE });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  if (!path || path.length < 2 || !isWellFormedMediaPath(path)) return notFound();

  const objectPath = path.join("/");
  const tenantId = path[0];

  if (parseAudioDraftRef(objectPath)) return serveDraftAudio(objectPath, tenantId);

  const publicClient = createPublicClient();
  const { data: space } = await publicClient
    .from("published_spaces")
    .select("modules")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!space) return notFound();

  const publishedRefs = collectMediaRefs(space.modules);
  if (!publishedRefs.has(objectPath)) return notFound();
  const versioned = parseVersionedMediaPath(objectPath);
  if (versioned && AUDIO_EXTENSIONS.has(versioned.ext) && versioned.kind !== "published") return notFound();

  let access;
  try {
    access = await resolveGuestAccess(tenantId);
  } catch {
    return new NextResponse("Service unavailable", { status: 503, headers: NO_STORE });
  }

  if (access === "unavailable") return notFound();
  if (access === "code-required") {
    const { heroImageRef, logoImageRef } = publishedIdentityImageRefs(space.modules);
    if (objectPath !== heroImageRef && objectPath !== logoImageRef) return notFound();
  }

  return signAndRedirect(objectPath);
}

async function signAndRedirect(objectPath: string) {
  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(objectPath, MEDIA_SIGNED_URL_TTL_SECONDS);

  if (error || !signed) return notFound();

  return NextResponse.redirect(signed.signedUrl, { headers: NO_STORE });
}

async function serveDraftAudio(objectPath: string, tenantId: string) {
  let allowed = false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    allowed = !!user && (await isReferencedDraftAudio(supabase, tenantId, objectPath));
  } catch {
    allowed = false;
  }
  if (!allowed) return notFound();
  return signAndRedirect(objectPath);
}
