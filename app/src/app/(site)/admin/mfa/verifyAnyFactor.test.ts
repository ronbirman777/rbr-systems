import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sign-in verification and the inline step-up must accept a valid code from ANY verified authenticator of the admin
 * (backup factor). Supabase Auth lists factors in no stable order, so "verify against the first factor" refused the
 * backup device's code on alternate attempts (seen with real TOTP on an isolated local stack, 2026-10-14).
 */

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));
vi.mock("@/lib/billing/admin/auth", () => ({
  AdminAuthError: class extends Error {},
  requireAdminAction: async () => ({ userId: "u", email: null, role: "owner" }),
  requireAdminForMfaPages: async () => ({ userId: "u", email: null, aal2: false }),
}));

let factors: { id: string; factor_type: string; status: string }[] = [];
let accepts: Record<string, string> = {}; // factorId -> the one code that factor accepts
const calls: string[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      mfa: {
        listFactors: async () => ({ data: { all: factors, totp: factors.filter((f) => f.status === "verified") }, error: null }),
        challengeAndVerify: async ({ factorId, code }: { factorId: string; code: string }) => {
          calls.push(factorId);
          return accepts[factorId] === code ? { data: {}, error: null } : { data: null, error: { code: "mfa_verification_failed" } };
        },
      },
    },
  }),
}));

const fd = (code: string) => { const f = new FormData(); f.set("code", code); return f; };
async function outcome(fn: () => Promise<unknown>) {
  try { return await fn(); } catch (e) { return String((e as Error).message); }
}

beforeEach(() => {
  calls.length = 0;
  factors = [
    { id: "primary", factor_type: "totp", status: "verified" },
    { id: "backup", factor_type: "totp", status: "verified" },
    { id: "abandoned", factor_type: "totp", status: "unverified" },
  ];
  accepts = { primary: "111111", backup: "222222", abandoned: "333333" };
});

describe("MFA verify accepts a code from any verified factor", () => {
  it.each([["first-listed factor", "111111"], ["backup factor listed second", "222222"]])("sign-in verify: %s", async (_n, code) => {
    const m = await import("./actions");
    expect(await outcome(() => m.verifyMfaAction("/admin/launch", null, fd(code)))).toBe("NEXT_REDIRECT:/admin/launch");
  });
  it.each([["first-listed factor", "111111"], ["backup factor listed second", "222222"]])("inline step-up: %s", async (_n, code) => {
    const m = await import("./actions");
    expect(await m.stepUpVerifyAction(null, fd(code))).toMatchObject({ ok: true });
  });
  it("the factor order does not matter (Auth reorders factors after each challenge)", async () => {
    factors.reverse();
    const m = await import("./actions");
    expect(await m.stepUpVerifyAction(null, fd("111111"))).toMatchObject({ ok: true });
    expect(await m.stepUpVerifyAction(null, fd("222222"))).toMatchObject({ ok: true });
  });
  it("a wrong code is refused after trying each VERIFIED factor once; an unverified factor is never used", async () => {
    const m = await import("./actions");
    expect(await m.stepUpVerifyAction(null, fd("333333"))).toEqual({ ok: false, error: "invalid_code" });
    expect(await outcome(() => m.verifyMfaAction("/admin", null, fd("999999")))).toEqual({ ok: false, error: "invalid_code" });
    expect(calls).toEqual(["primary", "backup", "primary", "backup"]);
  });
  it("stops at the first factor that accepts", async () => {
    const m = await import("./actions");
    await m.stepUpVerifyAction(null, fd("111111"));
    expect(calls).toEqual(["primary"]);
  });
  it("no verified factor: sent to enrolment, no challenge", async () => {
    factors = factors.filter((f) => f.status !== "verified");
    const m = await import("./actions");
    expect(await outcome(() => m.verifyMfaAction("/admin", null, fd("111111")))).toBe("NEXT_REDIRECT:/admin/mfa/enroll");
    expect(await outcome(() => m.stepUpVerifyAction(null, fd("111111")))).toBe("NEXT_REDIRECT:/admin/mfa/enroll");
    expect(calls).toEqual([]);
  });
  it("a malformed code never reaches Auth", async () => {
    const m = await import("./actions");
    expect(await m.stepUpVerifyAction(null, fd("12345"))).toEqual({ ok: false, error: "invalid_code" });
    expect(calls).toEqual([]);
  });
});
