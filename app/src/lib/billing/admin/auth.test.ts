import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Controllable stand-ins for the two clients the gate uses.
let claims: { data: { claims: Record<string, unknown> } | null; error: unknown } = { data: null, error: new Error("no session") };
let factors: { data: { totp: { status: string }[] } | null } = { data: { totp: [] } };
let adminRow: { data: { role: string; disabled_at: string | null } | null; error: unknown } = { data: null, error: null };
const redirectCalls: string[] = [];
let notFoundCalled = false;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: async () => claims, mfa: { listFactors: async () => factors } } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => adminRow }) }) }) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => { redirectCalls.push(to); throw new Error(`NEXT_REDIRECT:${to}`); },
  notFound: () => { notFoundCalled = true; throw new Error("NEXT_NOT_FOUND"); },
}));

import { AdminAuthError, requireAdminAction, requireAdminForMfaPages, requireAdminPage } from "./auth";

const U = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const nowSec = () => Math.floor(Date.now() / 1000);
const session = (o: Record<string, unknown> = {}) => ({ data: { claims: { sub: U, email: "a@example.com", aal: "aal2", amr: [{ method: "totp", timestamp: nowSec() - 30 }], ...o } }, error: null });
const denial = async (p: Promise<unknown>) => { try { await p; return "allowed"; } catch (e) { return e instanceof AdminAuthError ? e.denial : `other:${(e as Error).message}`; } };

beforeEach(() => {
  claims = session();
  factors = { data: { totp: [{ status: "verified" }] } };
  adminRow = { data: { role: "owner", disabled_at: null }, error: null };
  redirectCalls.length = 0;
  notFoundCalled = false;
});

describe("requireAdminAction - the server-side gate behind every Admin mutation", () => {
  it("allows an authorised admin on an AAL2 session", async () => {
    await expect(requireAdminAction()).resolves.toEqual({ userId: U, email: "a@example.com", role: "owner" });
  });
  it("denies a missing or invalid session (unauthenticated)", async () => {
    claims = { data: null, error: new Error("bad jwt") };
    expect(await denial(requireAdminAction())).toBe("unauthenticated");
    claims = { data: { claims: {} }, error: null };
    expect(await denial(requireAdminAction())).toBe("unauthenticated");
  });
  it("denies a signed-in user who is not in admin_users", async () => {
    adminRow = { data: null, error: null };
    expect(await denial(requireAdminAction())).toBe("not_admin");
  });
  it("denies a DISABLED admin", async () => {
    adminRow = { data: { role: "owner", disabled_at: "2026-10-01T00:00:00Z" }, error: null };
    expect(await denial(requireAdminAction())).toBe("not_admin");
  });
  it("FAILS CLOSED when the admin lookup itself errors", async () => {
    adminRow = { data: { role: "owner", disabled_at: null }, error: new Error("db down") };
    expect(await denial(requireAdminAction())).toBe("not_admin");
  });
  it("an authorised admin WITHOUT an AAL2 session is refused: challenge when a verified factor exists", async () => {
    claims = session({ aal: "aal1", amr: [{ method: "password", timestamp: nowSec() }] });
    expect(await denial(requireAdminAction())).toBe("mfa_challenge_required");
  });
  it("...and told to enrol when no verified authenticator exists (an unverified factor does not count)", async () => {
    claims = session({ aal: "aal1" });
    factors = { data: { totp: [] } };
    expect(await denial(requireAdminAction())).toBe("mfa_enroll_required");
    factors = { data: { totp: [{ status: "unverified" }] } };
    expect(await denial(requireAdminAction())).toBe("mfa_enroll_required");
  });
  it("client-writable metadata cannot make anyone an admin or raise their assurance level", async () => {
    adminRow = { data: null, error: null };
    claims = session({ user_metadata: { role: "admin", is_admin: true, aal: "aal2" }, app_metadata: { role: "admin" }, aal: "aal1" });
    expect(await denial(requireAdminAction())).toBe("not_admin");
  });
  it("step-up: a dangerous action needs a TOTP within the window; a stale one is refused", async () => {
    claims = session({ amr: [{ method: "totp", timestamp: nowSec() - 30 }] });
    await expect(requireAdminAction({ recentMfa: true })).resolves.toMatchObject({ userId: U });
    claims = session({ amr: [{ method: "totp", timestamp: nowSec() - 3600 }] });
    expect(await denial(requireAdminAction({ recentMfa: true }))).toBe("step_up_required");
    // ...while an ordinary (non step-up) action is still allowed on that same AAL2 session
    await expect(requireAdminAction()).resolves.toMatchObject({ userId: U });
  });
  it("step-up with no TOTP timestamp at all is refused", async () => {
    claims = session({ amr: [{ method: "password", timestamp: nowSec() }] });
    expect(await denial(requireAdminAction({ recentMfa: true }))).toBe("step_up_required");
  });
});

describe("requireAdminPage - what a visitor is sent to", () => {
  const run = async (p: Promise<unknown>) => { try { await p; return "rendered"; } catch (e) { return (e as Error).message; } };
  it("signed-out -> log in", async () => {
    claims = { data: null, error: new Error("x") };
    expect(await run(requireAdminPage())).toBe("NEXT_REDIRECT:/log-in?next=/admin");
  });
  it("signed-in NON-admin -> a plain 404 (the Admin area does not advertise itself)", async () => {
    adminRow = { data: null, error: null };
    expect(await run(requireAdminPage())).toBe("NEXT_NOT_FOUND");
    expect(notFoundCalled).toBe(true);
  });
  it("admin without MFA -> enrol/verify, never any Admin content", async () => {
    claims = session({ aal: "aal1" });
    factors = { data: { totp: [] } };
    expect(await run(requireAdminPage())).toBe("NEXT_REDIRECT:/admin/mfa/enroll");
    factors = { data: { totp: [{ status: "verified" }] } };
    expect(await run(requireAdminPage())).toBe("NEXT_REDIRECT:/admin/mfa/verify");
  });
  it("stale step-up -> re-verify page flagged as step-up", async () => {
    claims = session({ amr: [{ method: "totp", timestamp: nowSec() - 4000 }] });
    expect(await run(requireAdminPage({ recentMfa: true }))).toBe("NEXT_REDIRECT:/admin/mfa/verify?stepup=1");
  });
  it("a fully authorised admin sees the page", async () => {
    expect(await run(requireAdminPage())).toBe("rendered");
  });
});

describe("requireAdminForMfaPages - only an authorised admin may even reach the MFA screens", () => {
  it("returns who they are and whether they are already AAL2", async () => {
    claims = session({ aal: "aal1" });
    await expect(requireAdminForMfaPages()).resolves.toEqual({ userId: U, email: "a@example.com", aal2: false });
  });
  it("a stranger cannot enrol an authenticator against Admin (404)", async () => {
    adminRow = { data: null, error: null };
    await expect(requireAdminForMfaPages()).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("signed-out goes to log in", async () => {
    claims = { data: null, error: new Error("x") };
    await expect(requireAdminForMfaPages()).rejects.toThrow("NEXT_REDIRECT:/log-in?next=/admin");
  });
});
