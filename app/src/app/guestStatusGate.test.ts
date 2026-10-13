import { beforeEach, describe, expect, it, vi } from "vitest";
import { Suspense, createElement, type ReactElement } from "react";
import { collectElements, findByType } from "@/lib/spaceTypes/elementTree.test-util";

/**
 * TASK 033 fix - Guest routes keep their real HTTP 404.
 *
 * Next.js commits a response to 200 as soon as a Suspense fallback is
 * flushed; a notFound() that fires inside the stream can then only become a
 * soft not-found (200 + noindex). A REAL 404 status therefore requires the
 * page's notFound() to run with no Suspense boundary above it (Next docs,
 * "Streaming > The HTTP contract"). vitest has no HTTP pipeline, so this
 * asserts that contract structurally, per request (layout + page, as one
 * render):
 *
 *   - denying outcome  -> the layout renders the page with NO Suspense
 *                         boundary AND the page calls notFound();
 *   - code-protected   -> no boundary, the access screen, no app (200);
 *   - public & granted -> the page sits inside the branded loading boundary
 *                         and renders the Guest App.
 *
 * Only I/O seams are mocked (public client, admin client, billing decision,
 * access mode, cookie check) - the real loader, the real resolveGuestAccess,
 * the real isSpacePubliclyAvailable, the real registry and gate run. React's
 * cache() is a pass-through under vitest, so it is replaced by a memo scoped
 * to one test (one "request") - the contract the routes rely on.
 */

const io = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  tenantStatus: "active" as string,
  commerciallyAvailable: true,
  commercialThrows: false,
  mode: "public" as "public" | "code",
  modeThrows: false,
  cookieValid: false,
  modeCalls: 0,
  availabilityCalls: 0,
  fullReads: 0,
  hold: null as Promise<void> | null,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      const memo = new Map<string, R>();
      return (...args: A) => {
        const key = JSON.stringify(args);
        if (!memo.has(key)) memo.set(key, fn(...args));
        return memo.get(key)!;
      };
    },
  };
});
vi.mock("server-only", () => ({}));
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "--font-mock", className: "font-mock", style: {} });
  return { Geist: font, Geist_Mono: font, Fraunces: font, DM_Serif_Display: font, DM_Sans: font };
});
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({
    from: (table: string) => {
      if (table !== "published_spaces") throw new Error(`guest routes may only read published_spaces, not ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              io.fullReads++;
              return { data: io.row, error: null };
            },
          }),
        }),
      };
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== "tenants") throw new Error(`unexpected admin table ${table}`);
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: io.tenantStatus } }) }) }) };
    },
  }),
}));
vi.mock("@/lib/billing/commercialAccess", () => ({
  getSpaceCommercialAvailability: async () => {
    io.availabilityCalls++;
    if (io.hold) await io.hold;
    if (io.commercialThrows) throw new Error("billing read failed");
    return { isPubliclyAvailable: io.commerciallyAvailable };
  },
}));
vi.mock("@/lib/guestAccess/mode", () => ({
  getGuestAccessMode: async () => {
    io.modeCalls++;
    if (io.modeThrows) throw new Error("mode read failed");
    return io.mode;
  },
}));
vi.mock("@/lib/guestAccess/checkCookie", () => ({ hasValidGuestAccessCookie: async () => io.cookieValid }));
vi.mock("@/lib/guestAccess/publishedIdentity", () => ({
  extractPublishedGuestIdentity: () => ({ name: "Identity", heroImageUrl: null, logoUrl: null, vars: {} }),
  publishedIdentityImageRefs: () => ({ heroImageRef: null, logoImageRef: null }),
}));
vi.mock("@/components/guest/published-space-screen", () => ({ PublishedSpaceScreen: function RetreatApp() { return null; } }));
vi.mock("@/components/teach/teach-published-screen", () => ({ TeachPublishedSpaceScreen: function TeachApp() { return null; } }));
vi.mock("@/components/guest/guest-access-screen", () => ({ GuestAccessScreen: function AccessScreen() { return null; } }));

const TENANT = "11111111-2222-4333-8444-555555555555";

function publishedRow(product_type = "retreat") {
  return { tenant_id: TENANT, product_type, name: "N", theme: {}, timezone: "UTC", enabled_modules: [], modules: { spaceSettings: { locale: "de" } }, slug: "samadhi", published_at: null };
}

beforeEach(() => {
  vi.resetModules();
  Object.assign(io, {
    row: publishedRow(),
    tenantStatus: "active",
    commerciallyAvailable: true,
    commercialThrows: false,
    mode: "public",
    modeThrows: false,
    cookieValid: false,
    modeCalls: 0,
    availabilityCalls: 0,
    fullReads: 0,
    hold: null,
  });
});

type Outcome = { boundary: boolean; page: ReactElement | Error; layoutChildren: unknown };

const ROUTES = [
  {
    label: "/s/[slug]",
    layout: () => import("./(guest)/s/[slug]/layout"),
    page: () => import("./(guest)/s/[slug]/page"),
    params: () => Promise.resolve({ slug: "samadhi" }),
  },
  {
    label: "/g/[tenantId]",
    layout: () => import("./(guest)/g/[tenantId]/layout"),
    page: () => import("./(guest)/g/[tenantId]/page"),
    params: () => Promise.resolve({ tenantId: TENANT }),
  },
] as const;

/** One request: the root layout (which decides the boundary) then the page. */
async function oneRequest(route: (typeof ROUTES)[number]): Promise<Outcome> {
  const { default: Layout } = await route.layout();
  const { default: Page } = await route.page();
  const child = createElement("i", { "data-page": "" });
  const tree = (await Layout({ children: child, params: route.params() } as never)) as ReactElement<{ children: unknown }>;
  const layoutChildren = tree.props.children;
  const boundary = findByType(tree, Suspense).length > 0;
  let page: ReactElement | Error;
  try {
    page = (await Page({ params: route.params() } as never)) as ReactElement;
  } catch (e) {
    page = e as Error;
  }
  return { boundary, page, layoutChildren };
}

function expectReal404(o: Outcome) {
  // No Suspense boundary above the page -> nothing streams before the
  // page's notFound(), so Next can still send the 404 status.
  expect(o.boundary).toBe(false);
  expect(o.layoutChildren).toEqual(createElement("i", { "data-page": "" }));
  expect(o.page).toBeInstanceOf(Error);
  expect((o.page as Error).message).toBe("NEXT_NOT_FOUND");
}

const typeNames = (el: unknown) => collectElements(el).map((e) => (typeof e.type === "function" ? e.type.name : e.type));

describe.each(ROUTES)("$label keeps a real 404 for every denying outcome", (route) => {
  it("unknown address (no published row)", async () => {
    io.row = null;
    expectReal404(await oneRequest(route));
    expect(io.availabilityCalls).toBe(0);
  });

  it("unpublished / draft-only Space (no published_spaces row; drafts are never read)", async () => {
    io.row = null;
    io.tenantStatus = "active";
    expectReal404(await oneRequest(route));
  });

  it("suspended Space (tenant status archived)", async () => {
    io.tenantStatus = "archived";
    expectReal404(await oneRequest(route));
  });

  it("commercially unavailable (entitlement / subscription inactive, incl. payment-failure suspension)", async () => {
    io.commerciallyAvailable = false;
    expectReal404(await oneRequest(route));
  });

  it("availability check throws -> fail closed as a real 404", async () => {
    io.commercialThrows = true;
    expectReal404(await oneRequest(route));
  });

  it("access-mode check throws -> fail closed as a real 404 (never a 500, never streamed)", async () => {
    io.modeThrows = true;
    expectReal404(await oneRequest(route));
  });

  it("granted Space of a type without a Guest App -> real 404", async () => {
    io.row = publishedRow("client_hub");
    expectReal404(await oneRequest(route));
  });

  it("a code-protected Space of a guest-less type still shows the access screen (no 404 tell before a code)", async () => {
    io.row = publishedRow("client_hub");
    io.mode = "code";
    const o = await oneRequest(route);
    expect(o.boundary).toBe(false);
    expect(typeNames(o.page)).toEqual(["AccessScreen"]);
  });
});

describe.each(ROUTES)("$label allowed outcomes", (route) => {
  it("available public Space: streamed behind the branded loading boundary and renders the Guest App", async () => {
    const o = await oneRequest(route);
    expect(o.boundary).toBe(true);
    expect(o.page).not.toBeInstanceOf(Error);
    // The page's element is the registry wrapper; one level down is the app.
    const rendered = (o.page as ReactElement<Record<string, unknown>>).type as (p: unknown) => ReactElement;
    expect((rendered((o.page as ReactElement).props) as ReactElement).type).toHaveProperty("name", "RetreatApp");
  });

  it("code-protected Space without a valid cookie: the access screen, no boundary, no app, not a 404", async () => {
    io.mode = "code";
    io.cookieValid = false;
    const o = await oneRequest(route);
    expect(o.boundary).toBe(false);
    expect(o.page).not.toBeInstanceOf(Error);
    const names = typeNames(o.page);
    expect(names).toEqual(["AccessScreen"]);
    expect(names).not.toContain("RetreatApp");
  });

  it("code-protected Space WITH a valid cookie renders the app", async () => {
    io.mode = "code";
    io.cookieValid = true;
    const o = await oneRequest(route);
    expect(o.boundary).toBe(true);
    expect(o.page).not.toBeInstanceOf(Error);
  });

  it("the read + access chain still runs once per request (layout, page share the cached loader)", async () => {
    await oneRequest(route);
    expect(io.fullReads).toBe(1);
    expect(io.availabilityCalls).toBe(1);
    expect(io.modeCalls).toBe(1);
  });
});

describe("the layout decides access before any boundary is rendered", () => {
  it.each(ROUTES)("$label: the layout does not return (nothing can stream) while the access decision is pending", async (route) => {
    let release!: () => void;
    io.hold = new Promise<void>((r) => (release = r));
    io.commerciallyAvailable = false;
    const { default: Layout } = await route.layout();
    let settled = false;
    const pending = Promise.resolve(Layout({ children: null, params: route.params() } as never)).then((t) => {
      settled = true;
      return t;
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(settled).toBe(false);
    release();
    const tree = (await pending) as ReactElement;
    expect(findByType(tree, Suspense)).toHaveLength(0);
  });
});
