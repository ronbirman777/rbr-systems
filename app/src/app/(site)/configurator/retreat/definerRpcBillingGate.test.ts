import { beforeEach, describe, expect, it, vi } from "vitest";
import { translateAccount } from "@/lib/i18n/account";
import { localeFromFormData } from "@/lib/i18n";

/**
 * TASK 032: set_guest_access_code / disable_guest_access_code /
 * submit_featured_listing are SECURITY DEFINER, so the 0039 restrictive
 * "billing allows studio writes" policies never apply to them. The actions
 * ask space_studio_writable() first; a billing-locked Space never reaches the RPC.
 */
const state = vi.hoisted(() => ({
  writable: true as boolean | null,
  writableError: null as { code: string; message: string } | null,
  /** Error the guarded RPC itself returns (0044: the database refuses with hint BILLING_LOCKED). */
  rpcError: null as { code?: string; message: string; hint?: string } | null,
  calls: [] as string[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    rpc: (name: string) => {
      state.calls.push(name);
      const query = {
        then: (res: (v: unknown) => unknown) =>
          res(name === "space_studio_writable" ? { data: state.writable, error: state.writableError } : { data: null, error: state.rpcError }),
        maybeSingle: async () => ({ data: { mode: "public", has_code: false, updated_at: null }, error: null }),
      };
      return query;
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
}));

const T = "11111111-1111-4111-8111-111111111111";
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const settings = { mode: "public" as const, hasCode: false, updatedAt: null };

describe("SECURITY DEFINER Studio writes are billing-gated in the action", () => {
  beforeEach(() => {
    state.writable = true;
    state.writableError = null;
    state.rpcError = null;
    state.calls = [];
  });

  it("set code: refused for a billing-locked Space, RPC never called", async () => {
    state.writable = false;
    const { setGuestAccessCode } = await import("./guestAccessActions");
    const r = await setGuestAccessCode({ error: null, settings }, fd({ tenantId: T, code: "123456" }));
    expect(r.error).toBeTruthy();
    expect(state.calls).not.toContain("set_guest_access_code");
  });

  it("set code: writable (incl. every legacy Space) proceeds", async () => {
    const { setGuestAccessCode } = await import("./guestAccessActions");
    const r = await setGuestAccessCode({ error: null, settings }, fd({ tenantId: T, code: "123456" }));
    expect(r.error).toBeNull();
    expect(state.calls).toContain("set_guest_access_code");
  });

  it("set code: an unreadable billing decision fails closed", async () => {
    state.writableError = { code: "XX000", message: "boom" };
    const { setGuestAccessCode } = await import("./guestAccessActions");
    await setGuestAccessCode({ error: null, settings }, fd({ tenantId: T, code: "123456" }));
    expect(state.calls).not.toContain("set_guest_access_code");
  });

  it("disable code: refused for a billing-locked Space", async () => {
    state.writable = false;
    const { disableGuestAccessCode } = await import("./guestAccessActions");
    const r = await disableGuestAccessCode({ error: null, settings }, fd({ tenantId: T }));
    expect(r.error).toBeTruthy();
    expect(state.calls).not.toContain("disable_guest_access_code");
  });

  it("featured listing: refused for a billing-locked Space", async () => {
    state.writable = false;
    const { submitFeaturedListing } = await import("./featuredActions");
    const r = await submitFeaturedListing({ error: null, submission: undefined as never }, fd({ tenantId: T, description: "x" }));
    expect(r.error).toBeTruthy();
    expect(state.calls).not.toContain("submit_featured_listing");
  });

  it("featured listing: writable proceeds to the RPC", async () => {
    const { submitFeaturedListing } = await import("./featuredActions");
    await submitFeaturedListing({ error: null, submission: undefined as never }, fd({ tenantId: T, description: "x", additionalLinks: "[]" }));
    expect(state.calls).toContain("submit_featured_listing");
  });

  describe("0044: the database refusal (hint BILLING_LOCKED) reads as the localized billing message", () => {
    // The pre-check passed (e.g. the Space was suspended between the check and the RPC) and the
    // SECURITY DEFINER RPC itself refused. The raw database text must never reach the organizer.
    const locked = { code: "P0001", message: "Billing must be resolved before Guest Access can be changed", hint: "BILLING_LOCKED" };
    const expected = (f: FormData) => translateAccount(localeFromFormData(f), "billing", "studioSuspendedTitle");

    it("set code", async () => {
      state.rpcError = locked;
      const { setGuestAccessCode } = await import("./guestAccessActions");
      const f = fd({ tenantId: T, code: "123456" });
      const r = await setGuestAccessCode({ error: null, settings }, f);
      expect(state.calls).toContain("set_guest_access_code");
      expect(r.error).toBe(expected(f));
      expect(r.error).not.toContain("Billing must be resolved");
    });

    it("disable code", async () => {
      state.rpcError = locked;
      const { disableGuestAccessCode } = await import("./guestAccessActions");
      const f = fd({ tenantId: T });
      const r = await disableGuestAccessCode({ error: null, settings }, f);
      expect(state.calls).toContain("disable_guest_access_code");
      expect(r.error).toBe(expected(f));
    });

    it("featured listing", async () => {
      state.rpcError = { ...locked, message: "Billing must be resolved before a Featured listing can be submitted" };
      const { submitFeaturedListing } = await import("./featuredActions");
      const f = fd({ tenantId: T, description: "x", additionalLinks: "[]" });
      const r = await submitFeaturedListing({ error: null, submission: undefined as never }, f);
      expect(state.calls).toContain("submit_featured_listing");
      expect(r.error).toBe(expected(f));
    });

    it("other RPC errors are passed through unchanged (no over-mapping)", async () => {
      state.rpcError = { code: "P0001", message: "Space is archived" };
      const { setGuestAccessCode } = await import("./guestAccessActions");
      const r = await setGuestAccessCode({ error: null, settings }, fd({ tenantId: T, code: "123456" }));
      expect(r.error).toBe("Space is archived");
    });
  });
});
