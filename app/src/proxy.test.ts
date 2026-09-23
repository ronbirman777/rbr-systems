import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { PRODUCTION_APEX, PRODUCTION_APP } from "@/lib/hostname";

/**
 * Task 011A: the entire site (not just app/product routes) is gated while
 * INNERDWES_PREVIEW_PASSWORD is set - the marketing-page exemption that
 * used to live in proxy.ts's PUBLIC_MARKETING_PATHS is gone. These tests
 * exercise `proxy()` directly against real NextRequest objects (no jsdom
 * needed - Next's Request/URL implementation runs fine under plain Node),
 * so the gating behavior is proven by running the actual middleware
 * function, not by re-describing it. INNERDWES_PREVIEW_PASSWORD is set/
 * unset per test via process.env and always restored in afterEach - its
 * value here is a disposable test literal, never read from or written to
 * anywhere outside this in-memory test run.
 */

const ORIGINAL_ENV = { ...process.env };
const TEST_PASSWORD = "test-only-password-never-real";

function req(url: string, options: { host?: string; cookie?: string } = {}) {
  const headers = new Headers();
  if (options.host) headers.set("host", options.host);
  if (options.cookie) headers.set("cookie", options.cookie);
  return new NextRequest(url, { headers });
}

function expectGatedTo(response: Response | null, expectedNextPath: string) {
  expect(response).not.toBeNull();
  expect(response!.status).toBe(307);
  const location = new URL(response!.headers.get("location")!, "https://innerdwes.com");
  expect(location.pathname).toBe("/preview-access");
  expect(location.searchParams.get("next")).toBe(expectedNextPath);
}

function expectNotGated(response: Response) {
  // Either NextResponse.next() (no redirect at all) or, for a
  // rewrite-target host, NextResponse.rewrite() - neither is a redirect
  // to /preview-access.
  if (response.status === 307 || response.status === 308) {
    const location = new URL(response.headers.get("location") ?? "", "https://innerdwes.com");
    expect(location.pathname).not.toBe("/preview-access");
  }
}

describe("proxy() - Task 011A strict site-wide password gate", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe("gate enabled (INNERDWES_PREVIEW_PASSWORD set)", () => {
    beforeEach(() => {
      process.env.INNERDWES_PREVIEW_PASSWORD = TEST_PASSWORD;
    });

    it("gates the bare marketing homepage", async () => {
      const res = await proxy(req(`https://${PRODUCTION_APEX}/`, { host: PRODUCTION_APEX }));
      expectGatedTo(res, "/");
    });

    it("gates marketing subpages (/time-to-heal, /time-to-elevate)", async () => {
      for (const path of ["/time-to-heal", "/time-to-elevate"]) {
        const res = await proxy(req(`https://${PRODUCTION_APEX}${path}`, { host: PRODUCTION_APEX }));
        expectGatedTo(res, path);
      }
    });

    it("gates login and signup", async () => {
      for (const path of ["/log-in", "/sign-up"]) {
        const res = await proxy(req(`https://${PRODUCTION_APEX}${path}`, { host: PRODUCTION_APEX }));
        expectGatedTo(res, path);
      }
    });

    it("gates My Spaces and the app host root (rewritten to /space)", async () => {
      const res = await proxy(req(`https://${PRODUCTION_APP}/`, { host: PRODUCTION_APP }));
      expectGatedTo(res, "/space");

      const res2 = await proxy(req(`https://${PRODUCTION_APEX}/space`, { host: PRODUCTION_APEX }));
      expectGatedTo(res2, "/space");
    });

    it("gates Studio/configurator routes", async () => {
      const res = await proxy(
        req(`https://${PRODUCTION_APEX}/configurator/retreat/t1`, { host: PRODUCTION_APEX })
      );
      expectGatedTo(res, "/configurator/retreat/t1");
    });

    it("gates Guest App routes, including a guest-subdomain root rewritten to /s/[slug]", async () => {
      const res = await proxy(
        req(`https://${PRODUCTION_APEX}/g/00000000-0000-0000-0000-000000000000`, { host: PRODUCTION_APEX })
      );
      expectGatedTo(res, "/g/00000000-0000-0000-0000-000000000000");

      const res2 = await proxy(req("https://myretreat.innerdwes.com/", { host: "myretreat.innerdwes.com" }));
      expectGatedTo(res2, "/s/myretreat");
    });

    it("no longer exempts opengraph-image (marketing-only exemption removed)", async () => {
      const res = await proxy(
        req(`https://${PRODUCTION_APEX}/opengraph-image-abc123`, { host: PRODUCTION_APEX })
      );
      expectGatedTo(res, "/opengraph-image-abc123");
    });

    it("preserves the requested path in the next= redirect param (safe internal redirect target)", async () => {
      const res = await proxy(
        req(`https://${PRODUCTION_APEX}/configurator/retreat/t1?step=publish`, { host: PRODUCTION_APEX })
      );
      expect(res).not.toBeNull();
      const location = new URL(res!.headers.get("location")!, "https://innerdwes.com");
      expect(location.searchParams.get("next")).toBe("/configurator/retreat/t1?step=publish");
    });

    it("never gates /preview-access itself - no redirect loop", async () => {
      const res = await proxy(req(`https://${PRODUCTION_APEX}/preview-access`, { host: PRODUCTION_APEX }));
      expectNotGated(res!);
    });

    it("never gates /preview-access even with a next= query string attached", async () => {
      const res = await proxy(
        req(`https://${PRODUCTION_APEX}/preview-access?next=%2Fspace`, { host: PRODUCTION_APEX })
      );
      expectNotGated(res!);
    });

    it("grants access with a valid preview cookie instead of redirecting", async () => {
      const { sha256Hex } = await import("@/lib/preview-gate/hash");
      const { PREVIEW_COOKIE_NAME } = await import("@/lib/preview-gate/config");
      const validCookieValue = await sha256Hex(TEST_PASSWORD);
      const res = await proxy(
        req(`https://${PRODUCTION_APEX}/`, {
          host: PRODUCTION_APEX,
          cookie: `${PREVIEW_COOKIE_NAME}=${validCookieValue}`,
        })
      );
      expectNotGated(res!);
    });
  });

  describe("gate disabled (INNERDWES_PREVIEW_PASSWORD unset) - unchanged baseline behavior", () => {
    beforeEach(() => {
      delete process.env.INNERDWES_PREVIEW_PASSWORD;
    });

    it("does not gate anything, including previously-marketing-exempt paths", async () => {
      for (const path of ["/", "/time-to-heal", "/log-in", "/configurator/retreat/t1"]) {
        const res = await proxy(req(`https://${PRODUCTION_APEX}${path}`, { host: PRODUCTION_APEX }));
        expectNotGated(res!);
      }
    });
  });

  describe("Next.js internal/static asset matcher exclusion (config.matcher, not runtime logic)", () => {
    it("the matcher regex excludes _next/static, _next/image, favicon.ico, and common image extensions", async () => {
      const { config } = await import("./proxy");
      // Next.js compiles this matcher to run anchored at the start of the
      // path; a plain unanchored RegExp.test() would let the negative
      // lookahead "succeed" from a later starting position in the same
      // string (e.g. skipping the leading "_" of "_next/static/...") and
      // falsely report a match - anchor with ^ to test the same semantics
      // Next.js actually applies.
      const matcher = new RegExp("^" + config.matcher[0]);
      // Real pathnames Next.js matches this pattern against always carry
      // the leading "/" the pattern itself expects.
      const mustBeExcluded = [
        "/_next/static/chunk.js",
        "/_next/image?url=x",
        "/favicon.ico",
        "/logo.svg",
        "/photo.png",
        "/photo.jpg",
        "/photo.jpeg",
        "/photo.gif",
        "/photo.webp",
      ];
      for (const path of mustBeExcluded) {
        expect(matcher.test(path)).toBe(false);
      }
      // Sanity check the matcher isn't simply matching nothing - an
      // ordinary app route must still match (i.e. still be middleware-
      // eligible) or this whole gate would silently no-op everywhere.
      expect(matcher.test("/space")).toBe(true);
      expect(matcher.test("/preview-access")).toBe(true);
    });
  });
});
