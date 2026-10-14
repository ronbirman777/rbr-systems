import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Controllable stand-ins for the two clients the gate uses.
let claims: { data: { claims: Record<string, unknown> } | null; error: unknown } = { data: null, error: new Error("no session") };
type F = { status: string; id?: string; created_at?: string };
let factors: { data: { totp: F[] } | null; error?: unknown } = { data: { totp: [] } };
let adminFactorCalls = 0;
let adminRow: { data: { role: string; disabled_at: string | null } | null; error: unknown } = { data: null, error: null };
const redirectCalls: string[] = [];
let notFoundCalled = false;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: async () => claims, mfa: { listFactors: async () => factors } } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => adminRow }) }) }),
    // The gate reads factors FRESH through the Auth Admin API (service role), not from the session.
    auth: { admin: { mfa: { listFactors: async () => {
      adminFactorCalls++;
      return factors.data
        ? { data: { factors: factors.data.totp.map((f, i) => ({ id: f.id ?? `f${i}`, factor_type: "totp", status: f.status, created_at: f.created_at ?? "2026-01-01T00:00:00Z" })) }, error: factors.error ?? null }
        : { data: null, error: factors.error ?? new Error("no data") };
    } } } },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => { redirectCalls.push(to); throw new Error(`NEXT_REDIRECT:${to}`); },
  notFound: () => { notFoundCalled = true; throw new Error("NEXT_NOT_FOUND"); },
}));

import { AdminAuthError, OWNER_ONLY, __resetFactorCacheForTests, requireAdminAction, requireAdminForMfaPages, requireAdminPage } from "./auth";

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
  adminFactorCalls = 0;
  __resetFactorCacheForTests();
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
  it("step-up with no TOTP timestamp at all is refused (the session is not Admin AAL2 without one)", async () => {
    claims = session({ amr: [{ method: "password", timestamp: nowSec() }] });
    expect(await denial(requireAdminAction({ recentMfa: true }))).toBe("mfa_challenge_required");
    expect(await denial(requireAdminAction())).toBe("mfa_challenge_required");
  });
  it("step-up re-reads the factors: a removed factor (AAL2 JWT still valid) cannot satisfy step-up", async () => {
    factors = { data: { totp: [] } };
    expect(await denial(requireAdminAction({ recentMfa: true }))).toBe("step_up_required");
    factors = { data: { totp: [{ status: "unverified" }] } };
    expect(await denial(requireAdminAction({ recentMfa: true }))).toBe("step_up_required");
    // ...and a failing factor lookup fails closed
    factors = { data: null, error: new Error("auth down") };
    expect(await denial(requireAdminAction({ recentMfa: true }))).toBe("step_up_required");
  });
  it("AAL1 with a failing factor lookup is sent to enrol (never treated as verified)", async () => {
    claims = session({ aal: "aal1" });
    factors = { data: null, error: new Error("auth down") };
    expect(await denial(requireAdminAction())).toBe("mfa_enroll_required");
  });
  it("an unknown role value in admin_users is no role at all (fail closed)", async () => {
    adminRow = { data: { role: "superuser", disabled_at: null }, error: null };
    expect(await denial(requireAdminAction())).toBe("not_admin");
    adminRow = { data: { role: "", disabled_at: null }, error: null };
    expect(await denial(requireAdminAction())).toBe("not_admin");
  });
});

describe("roles option (additive; omitted = today's behaviour)", () => {
  it("omitted: owner AND billing_admin pass, exactly as before roles existed", async () => {
    await expect(requireAdminAction()).resolves.toMatchObject({ role: "owner" });
    adminRow = { data: { role: "billing_admin", disabled_at: null }, error: null };
    await expect(requireAdminAction()).resolves.toMatchObject({ role: "billing_admin" });
  });
  it("owner-only: owner passes, billing_admin is refused with role_forbidden", async () => {
    await expect(requireAdminAction({ roles: OWNER_ONLY })).resolves.toMatchObject({ role: "owner" });
    adminRow = { data: { role: "billing_admin", disabled_at: null }, error: null };
    expect(await denial(requireAdminAction({ roles: OWNER_ONLY }))).toBe("role_forbidden");
  });
  it("the role is checked before MFA: an AAL1 billing_admin is refused, not walked through a code prompt", async () => {
    adminRow = { data: { role: "billing_admin", disabled_at: null }, error: null };
    claims = session({ aal: "aal1" });
    expect(await denial(requireAdminAction({ roles: OWNER_ONLY }))).toBe("role_forbidden");
    // while an AAL1 owner is still sent to MFA
    adminRow = { data: { role: "owner", disabled_at: null }, error: null };
    expect(await denial(requireAdminAction({ roles: OWNER_ONLY }))).toBe("mfa_challenge_required");
  });
  it("an empty role list admits nobody (misconfiguration fails closed)", async () => {
    expect(await denial(requireAdminAction({ roles: [] }))).toBe("role_forbidden");
  });
  it("the role comes from admin_users only: JWT/app metadata claiming owner does not help a billing_admin", async () => {
    adminRow = { data: { role: "billing_admin", disabled_at: null }, error: null };
    claims = session({ role: "owner", app_metadata: { role: "owner" }, user_metadata: { role: "owner" } });
    expect(await denial(requireAdminAction({ roles: OWNER_ONLY }))).toBe("role_forbidden");
  });
  it("a disabled owner or a non-admin is still not_admin (role check never runs first)", async () => {
    adminRow = { data: { role: "owner", disabled_at: "2026-10-01T00:00:00Z" }, error: null };
    expect(await denial(requireAdminAction({ roles: OWNER_ONLY }))).toBe("not_admin");
    adminRow = { data: null, error: null };
    expect(await denial(requireAdminAction({ roles: OWNER_ONLY }))).toBe("not_admin");
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
  it("owner-only page: a billing_admin gets a plain 404 (not a 403, not a redirect)", async () => {
    adminRow = { data: { role: "billing_admin", disabled_at: null }, error: null };
    expect(await run(requireAdminPage({ roles: OWNER_ONLY }))).toBe("NEXT_NOT_FOUND");
    expect(redirectCalls).toEqual([]);
    claims = session({ aal: "aal1" });
    expect(await run(requireAdminPage({ roles: OWNER_ONLY }))).toBe("NEXT_NOT_FOUND");
    expect(redirectCalls).toEqual([]);
  });
  it("owner-only page: signed-out still goes to log in, AAL1 owner to MFA, owner sees it", async () => {
    expect(await run(requireAdminPage({ roles: OWNER_ONLY }))).toBe("rendered");
    claims = session({ aal: "aal1" });
    expect(await run(requireAdminPage({ roles: OWNER_ONLY }))).toBe("NEXT_REDIRECT:/admin/mfa/verify");
    claims = { data: null, error: new Error("x") };
    expect(await run(requireAdminPage({ roles: OWNER_ONLY }))).toBe("NEXT_REDIRECT:/log-in?next=/admin");
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
  it("a disabled admin, an unknown role or a failing lookup cannot reach the MFA screens either (404)", async () => {
    adminRow = { data: { role: "owner", disabled_at: "2026-10-01T00:00:00Z" }, error: null };
    await expect(requireAdminForMfaPages()).rejects.toThrow("NEXT_NOT_FOUND");
    adminRow = { data: { role: "superuser", disabled_at: null }, error: null };
    await expect(requireAdminForMfaPages()).rejects.toThrow("NEXT_NOT_FOUND");
    adminRow = { data: null, error: new Error("db down") };
    await expect(requireAdminForMfaPages()).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("signed-out goes to log in", async () => {
    claims = { data: null, error: new Error("x") };
    await expect(requireAdminForMfaPages()).rejects.toThrow("NEXT_REDIRECT:/log-in?next=/admin");
  });
});

describe("stale factor: a removed factor never authorizes via a still-valid AAL2 JWT", () => {
  const isoAgo = (sec: number) => new Date(Date.now() - sec * 1000).toISOString();
  it("every server action re-reads factors fresh (no cache)", async () => {
    await requireAdminAction(); await requireAdminAction();
    expect(adminFactorCalls).toBe(2);
  });
  it("factor removed (no verified factor left): actions -> mfa_required path, step-up -> step_up_required, pages -> enrol", async () => {
    factors = { data: { totp: [] } };
    expect(await denial(requireAdminAction())).toBe("mfa_enroll_required");
    expect(await denial(requireAdminAction({ recentMfa: true }))).toBe("step_up_required");
    await expect(requireAdminPage()).rejects.toThrow("NEXT_REDIRECT:/admin/mfa/enroll");
  });
  it("factor replaced: a NEW factor created after this session's TOTP verification does not back it", async () => {
    factors = { data: { totp: [{ status: "verified", created_at: isoAgo(5) }] } }; // session TOTP was 30 s ago
    expect(await denial(requireAdminAction())).toBe("mfa_challenge_required");
    await expect(requireAdminPage()).rejects.toThrow("NEXT_REDIRECT:/admin/mfa/verify");
    // the MFA screens then treat the session as NOT aal2, so verify/enrol does not loop back to /admin
    await expect(requireAdminForMfaPages()).resolves.toMatchObject({ aal2: false });
  });
  it("a factor created before the verification (the one that verified it, or an older backup) backs it", async () => {
    factors = { data: { totp: [{ status: "verified", created_at: isoAgo(3600) }] } };
    await expect(requireAdminAction({ recentMfa: true })).resolves.toMatchObject({ userId: U });
    await expect(requireAdminForMfaPages()).resolves.toMatchObject({ aal2: true });
  });
  it("the factor lookup failing fails closed for actions, step-up and pages", async () => {
    factors = { data: null, error: new Error("auth admin down") };
    expect(await denial(requireAdminAction())).toBe("mfa_enroll_required");
    expect(await denial(requireAdminAction({ recentMfa: true }))).toBe("step_up_required");
    await expect(requireAdminPage()).rejects.toThrow(/NEXT_REDIRECT:\/admin\/mfa\//);
  });
  it("page reads cache only a POSITIVE check briefly; a removal after the cache window is caught; negatives are never cached", async () => {
    await requireAdminPage(); await requireAdminPage();
    expect(adminFactorCalls).toBe(1); // cached for FACTOR_CACHE_MS
    // step-up pages and actions never use the cache
    await requireAdminPage({ recentMfa: true });
    expect(adminFactorCalls).toBe(2);
    __resetFactorCacheForTests(); // = the 60 s window elapsed
    factors = { data: { totp: [] } };
    await expect(requireAdminPage()).rejects.toThrow("NEXT_REDIRECT:/admin/mfa/enroll");
    await expect(requireAdminPage()).rejects.toThrow("NEXT_REDIRECT:/admin/mfa/enroll");
    expect(adminFactorCalls).toBe(4);
  });
});
