import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  PREVIEW_COOKIE_NAME,
  PREVIEW_GATE_PATH,
  isPreviewGateEnabled,
} from "@/lib/preview-gate/config";
import { sha256Hex, timingSafeEqual } from "@/lib/preview-gate/hash";

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
 * Two independent checks, in order:
 *
 * 1. The temporary InnerDweS preview password gate (see lib/preview-gate) -
 *    entirely separate from customer auth. No-ops automatically once
 *    INNERDWES_PREVIEW_PASSWORD is unset for public launch.
 * 2. Refreshes the Supabase auth session on every request so Server
 *    Components always see a valid (non-expired) session via cookies.
 */
export async function proxy(request: NextRequest) {
  const gateResponse = await checkPreviewGate(request);
  if (gateResponse) return gateResponse;

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

async function checkPreviewGate(request: NextRequest): Promise<NextResponse | null> {
  if (!isPreviewGateEnabled()) return null;

  const { pathname, search } = request.nextUrl;
  if (pathname === PREVIEW_GATE_PATH) return null; // the gate page itself - never gate it
  if (PUBLIC_MARKETING_PATHS.has(pathname)) return null; // public InnerDweS marketing pages
  // Next.js appends a content hash to a route-group-colocated opengraph-image
  // file (e.g. /opengraph-image-abc123) - not a fixed path we can list
  // exactly, so this one's checked by prefix. Social crawlers fetching it
  // must never hit the gate, or every shared marketing link loses its preview.
  if (pathname.startsWith("/opengraph-image")) return null;

  const cookieValue = request.cookies.get(PREVIEW_COOKIE_NAME)?.value;
  if (cookieValue) {
    const expected = await sha256Hex(process.env.INNERDWES_PREVIEW_PASSWORD!);
    if (timingSafeEqual(cookieValue, expected)) return null; // already granted
  }

  const url = request.nextUrl.clone();
  url.pathname = PREVIEW_GATE_PATH;
  url.search = "";
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
