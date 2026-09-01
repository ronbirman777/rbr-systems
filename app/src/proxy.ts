import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  PREVIEW_COOKIE_NAME,
  PREVIEW_GATE_PATH,
  isPreviewGateEnabled,
} from "@/lib/preview-gate/config";
import { sha256Hex, timingSafeEqual } from "@/lib/preview-gate/hash";

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
