import { beforeEach, describe, expect, it, vi } from "vitest";
import { findByType, renderOnce } from "@/lib/spaceTypes/elementTree.test-util";

/**
 * TASK 027.5 Phase 2B: product-aware Guest routing on top of main's
 * hardened resolveGuestAccess(). Real registry + real guestRenderers +
 * real guestAccessCopy; only I/O and the leaf screens are mocked.
 */

const state = vi.hoisted(() => ({
  space: null as Record<string, unknown> | null,
  access: "granted" as "unavailable" | "code-required" | "granted",
  selectedColumns: [] as string[],
  accessCalls: [] as string[],
}));

vi.mock("server-only", () => ({}));
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
        select: (cols: string) => {
          state.selectedColumns.push(cols);
          return { eq: () => ({ maybeSingle: async () => ({ data: state.space }) }) };
        },
      };
    },
  }),
}));
vi.mock("@/lib/guestAccess/effectiveAccess", () => ({
  resolveGuestAccess: async (tenantId: string) => {
    state.accessCalls.push(tenantId);
    return state.access;
  },
}));
vi.mock("@/lib/guestAccess/publishedIdentity", () => ({
  extractPublishedGuestIdentity: () => ({ name: "Identity", heroImageUrl: null, logoUrl: null, vars: {} }),
}));
vi.mock("@/components/guest/published-space-screen", () => ({ PublishedSpaceScreen: function RetreatApp() { return null; } }));
vi.mock("@/components/teach/teach-published-screen", () => ({ TeachPublishedSpaceScreen: function TeachApp() { return null; } }));
vi.mock("@/components/guest/guest-access-screen", () => ({ GuestAccessScreen: function AccessScreen() { return null; } }));

import { PublishedSpaceScreen } from "@/components/guest/published-space-screen";
import { TeachPublishedSpaceScreen } from "@/components/teach/teach-published-screen";
import { GuestAccessScreen } from "@/components/guest/guest-access-screen";
import GuestByTenantPage from "./g/[tenantId]/page";
import GuestBySlugPage from "./s/[slug]/page";

const TENANT = "11111111-2222-4333-8444-555555555555";

const ROUTES = [
  { label: "/g/[tenantId]", render: () => GuestByTenantPage({ params: Promise.resolve({ tenantId: TENANT }) }) },
  { label: "/s/[slug]", render: () => GuestBySlugPage({ params: Promise.resolve({ slug: "samadhi" }) }) },
] as const;

function row(product_type: string) {
  return { tenant_id: TENANT, product_type, name: "N", theme: {}, timezone: "UTC", enabled_modules: [], modules: {} };
}

beforeEach(() => {
  state.space = null;
  state.access = "granted";
  state.selectedColumns = [];
  state.accessCalls = [];
});

describe.each(ROUTES)("guest routing - $label", ({ render }) => {
  it("renders a Retreat with the Retreat guest app (unchanged)", async () => {
    state.space = row("retreat");
    const el = renderOnce(await render());
    expect(el.type).toBe(PublishedSpaceScreen);
    expect(state.accessCalls).toEqual([TENANT]);
  });

  it("dispatches a Teach Space to the Teach published renderer", async () => {
    state.space = row("teach");
    const el = renderOnce(await render());
    expect(el.type).toBe(TeachPublishedSpaceScreen);
  });

  it.each([["client_hub"], ["mystery"], [""]])("returns 404 for unsupported product_type %j once access is granted", async (type) => {
    state.space = row(type);
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("returns 404 when there is no published row, without consulting access", async () => {
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.accessCalls).toEqual([]);
  });

  it.each([["retreat"], ["teach"], ["client_hub"], ["mystery"]])("a commercially unavailable %s Space is a plain 404 (availability first, nothing rendered)", async (type) => {
    state.space = row(type);
    state.access = "unavailable";
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("a code-protected Retreat shows the access screen with its existing Retreat wording, never the app", async () => {
    state.space = row("retreat");
    state.access = "code-required";
    const el = await render();
    expect(el.type).toBe(GuestAccessScreen);
    expect(el.props.copy).toEqual({ title: "Private Retreat", openLabel: "Open Retreat", askHint: "Ask your retreat organizer for the access code." });
    expect(findByType(el, PublishedSpaceScreen)).toHaveLength(0);
  });

  it("before a code is entered, Teach / unsupported / unknown Spaces are indistinguishable (same screen, same neutral copy, no 404 tell)", async () => {
    const copies: unknown[] = [];
    for (const type of ["teach", "client_hub", "mystery"]) {
      state.space = row(type);
      state.access = "code-required";
      const el = await render();
      expect(el.type).toBe(GuestAccessScreen);
      copies.push(el.props.copy);
    }
    expect(copies[0]).toEqual(copies[1]);
    expect(copies[0]).toEqual(copies[2]);
    expect(JSON.stringify(copies[0])).not.toMatch(/teach|teacher|retreat/i);
  });

  it("never renders any guest app while a code is still required", async () => {
    state.space = row("teach");
    state.access = "code-required";
    const el = await render();
    expect(el.type).toBe(GuestAccessScreen);
  });

  it("reads only published_spaces with an explicit column list (never select *)", async () => {
    state.space = row("retreat");
    await render();
    expect(state.selectedColumns).toHaveLength(1);
    expect(state.selectedColumns[0]).not.toContain("*");
    expect(state.selectedColumns[0]).toContain("product_type");
  });
});
