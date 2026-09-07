import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  PREVIEW_COOKIE_NAME,
  PREVIEW_GATE_PATH,
  isPreviewGateEnabled,
} from "@/lib/preview-gate/config";
import { sha256Hex, timingSafeEqual } from "@/lib/preview-gate/hash";
import { classifyHostname, PRODUCTION_APEX } from "@/lib/hostname";

/**
 * Public InnerDweS marketing routes - deliberately excluded from the
 * preview-password gate below. Everything else (sign-up, log-in, create,
 * the configurator, the published guest route) keeps exactly the gating
 * behavior it had before the marketing site existed - this list only ever
 * grows to admit more marketing pages, never product/account routes.
 */
const PUBLIC_MARKETING_PATHS = new Set([
  "/",
  "/time-to-heal",
  "/time-to-elevate",
  "/robots.txt",
  "/sitemap.xml",
  "/icon",
]);

/**
 * Three steps, in order:
 *
 * 1. Hostname resolution (Domain Phase 2 - see lib/hostname.ts, the only
 *    place the Host header is interpreted). www canonicalizes to the
 *    apex; app.innerdwes.com's bare root becomes the Studio entry point;
 *    a guest Space subdomain's bare root is rewritten to the exact same
 *    /s/[slug] route that already exists - a lookup key only, nothing
 *    here ever grants access to anything. A hostname recognizably under
 *    *.innerdwes.com but not a valid target (reserved word, malformed
 *    label, multi-level subdomain) fails closed with a 404 rather than
 *    ever falling through to marketing content. None of this fires for
 *    localhost or a Netlify preview hostname, so local dev and staging
 *    are completely unaffected until the real DNS names exist - see the
 *    Domain Phase 2 report for how to exercise these paths before then
 *    (a spoofed Host header, e.g. `curl -H "Host: app.innerdwes.com"`).
 * 2. The temporary InnerDweS preview password gate (see lib/preview-gate) -
 *    entirely separate from customer auth. No-ops automatically once
 *    INNERDWES_PREVIEW_PASSWORD is unset for public launch. Evaluated
 *    against the EFFECTIVE path (after step 1's rewrite, if any), so a
 *    guest-subdomain or app-root request is gated exactly as if the
 *    visitor had gone directly to /s/[slug] or /space - unchanged from
 *    today's behavior, not loosened or tightened by this step existing.
 * 3. Refreshes the Supabase auth session on every request so Server
 *    Components always see a valid (non-expired) session via cookies.
 */
export async function proxy(request: NextRequest) {
  const hostResult = classifyHostname(request.headers.get("host"));

  if (hostResult.kind === "marketing-www") {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.hostname = PRODUCTION_APEX;
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  // Domain Phase 2 hardening: a hostname recognizably under
  // *.innerdwes.com that isn't a valid target (reserved word, malformed
  // label, multi-level subdomain - see hostname.ts's "blocked" kind)
  // must never silently render the marketing homepage. Rewritten to a
  // path nothing defines, so Next's own existing not-found handling
  // renders (the same 404 already used everywhere else) - no new error
  // system, no branded page of its own.
  if (hostResult.kind === "blocked") {
    const url = request.nextUrl.clone();
    url.pathname = "/__blocked-hostname__";
    url.search = "";
    return NextResponse.rewrite(url);
  }

  let rewriteTo: string | null = null;
  if (hostResult.kind === "guest" && request.nextUrl.pathname === "/") {
    rewriteTo = `/s/${hostResult.slug}`;
  } else if (hostResult.kind === "app" && request.nextUrl.pathname === "/") {
    // app.innerdwes.com's own root isn't a page that exists - /space
    // already redirects an unauthenticated visitor to /log-in itself
    // (see space/page.tsx), so reusing it here means Studio's "am I
    // signed in" logic stays defined in exactly one place.
    rewriteTo = "/space";
  }

  const effectivePathname = rewriteTo ?? request.nextUrl.pathname;

  const gateResponse = await checkPreviewGate(request, effectivePathname);
  if (gateResponse) return gateResponse;

  if (rewriteTo) {
    const url = request.nextUrl.clone();
    url.pathname = rewriteTo;
    return NextResponse.rewrite(url);
  }

  let response = NextResponse.next({ request });

  // Until real Supabase credentials are set in .env.local, let requests
  // through unauthenticated rather than hard-crashing every route.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return response;
}

async function checkPreviewGate(
  request: NextRequest,
  effectivePathname: string
): Promise<NextResponse | null> {
  if (!isPreviewGateEnabled()) return null;

  const { search } = request.nextUrl;
  if (effectivePathname === PREVIEW_GATE_PATH) return null; // the gate page itself - never gate it
  if (PUBLIC_MARKETING_PATHS.has(effectivePathname)) return null; // public InnerDweS marketing pages
  // Next.js appends a content hash to a route-group-colocated opengraph-image
  // file (e.g. /opengraph-image-abc123) - not a fixed path we can list
  // exactly, so this one's checked by prefix. Social crawlers fetching it
  // must never hit the gate, or every shared marketing link loses its preview.
  if (effectivePathname.startsWith("/opengraph-image")) return null;

  const cookieValue = request.cookies.get(PREVIEW_COOKIE_NAME)?.value;
  if (cookieValue) {
    const expected = await sha256Hex(process.env.INNERDWES_PREVIEW_PASSWORD!);
    if (timingSafeEqual(cookieValue, expected)) return null; // already granted
  }

  const url = request.nextUrl.clone();
  url.pathname = PREVIEW_GATE_PATH;
  url.search = "";
  url.searchParams.set("next", effectivePathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
