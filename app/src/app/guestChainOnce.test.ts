import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TASK 033 (plan 4.3 / 4.6): /g/[tenantId] used to run the published read
 * and the availability/access chain TWICE per request - once through the
 * layout's socialSpaceByTenantId(), again inline in the page. The page now
 * uses the same React-cached loader, so the chain runs once.
 *
 * React's `cache()` only memoizes inside a real RSC request; under vitest it
 * is a pass-through. It is replaced here by a memo scoped to one test (one
 * "request"), which is exactly the contract the route relies on. The
 * counters are on the real I/O seams: the public client and
 * resolveGuestAccess().
 */

const io = vi.hoisted(() => ({
  selects: [] as string[],
  accessCalls: 0,
  access: "granted" as "granted" | "code-required" | "unavailable",
  row: null as Record<string, unknown> | null,
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
    from: () => ({
      select: (cols: string) => ({
        eq: () => ({
          maybeSingle: async () => {
            io.selects.push(cols);
            if (!io.row) return { data: null, error: null };
            return cols.startsWith("spaceSettings:") ? { data: { spaceSettings: null }, error: null } : { data: io.row, error: null };
          },
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/guestAccess/effectiveAccess", () => ({
  resolveGuestAccess: async () => {
    io.accessCalls++;
    return io.access;
  },
}));
vi.mock("@/components/guest/published-space-screen", () => ({ PublishedSpaceScreen: function RetreatApp() { return null; } }));
vi.mock("@/components/teach/teach-published-screen", () => ({ TeachPublishedSpaceScreen: function TeachApp() { return null; } }));
vi.mock("@/components/guest/guest-access-screen", () => ({ GuestAccessScreen: function AccessScreen() { return null; } }));

const TENANT = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  vi.resetModules();
  io.selects = [];
  io.accessCalls = 0;
  io.access = "granted";
  io.row = { tenant_id: TENANT, product_type: "retreat", name: "N", theme: {}, timezone: "UTC", enabled_modules: [], modules: {}, slug: null, published_at: null };
});

/** Layout + generateMetadata + page, as one request renders them. */
async function oneRequest() {
  const { default: Layout } = await import("./(guest)/g/[tenantId]/layout");
  const page = await import("./(guest)/g/[tenantId]/page");
  const params = Promise.resolve({ tenantId: TENANT });
  await Layout({ children: null, params });
  await page.generateMetadata({ params });
  return page.default({ params });
}

describe("/g/[tenantId] runs the access chain once per request", () => {
  it.each(["granted", "code-required"] as const)("access %s: one full read, one access resolution", async (access) => {
    io.access = access;
    await oneRequest();
    expect(io.accessCalls).toBe(1);
    const full = io.selects.filter((c) => !c.startsWith("spaceSettings:"));
    expect(full).toHaveLength(1);
    // TASK 033 fix: the layout learns the locale from the same gated
    // snapshot (access is decided before streaming), so no separate light
    // locale read remains.
    expect(io.selects.filter((c) => c.startsWith("spaceSettings:"))).toHaveLength(0);
  });

  it("parity: unavailable is still a 404, after the same single chain", async () => {
    io.access = "unavailable";
    await expect(oneRequest()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(io.accessCalls).toBe(1);
  });

  it("parity: no published row is a 404 without consulting access", async () => {
    io.row = null;
    await expect(oneRequest()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(io.accessCalls).toBe(0);
  });
});
