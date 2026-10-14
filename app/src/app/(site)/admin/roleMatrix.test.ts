import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Role matrix for EVERY Admin page, layout and server action (Batch 1, owner priority 1 + 6).
 *
 * Each entry point is called for real with the real gate (lib/billing/admin/auth.ts); only the two Supabase clients
 * and Next's navigation helpers are stand-ins. The service-role client throws on ANY read other than the gate's own
 * admin_users lookup and records it, so the test proves two things per persona:
 *   - the outcome (log in / 404 / MFA redirect / allowed), and
 *   - that a denied caller never caused a single service-role data read (the gate runs first).
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/billing/deps.server", () => ({ isStripeConfigured: () => false, getBillingDeps: () => { throw new Error("DATA:stripe"); } }));

type Persona = { claims: Record<string, unknown> | null; row: { role: string; disabled_at: string | null } | null; factors: { status: string }[] };
let persona: Persona;
const reads: string[] = [];
const mfaCalls: string[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => (persona.claims ? { data: { claims: persona.claims }, error: null } : { data: null, error: new Error("no session") }),
      mfa: {
        listFactors: async () => ({ data: { totp: persona.factors, all: persona.factors }, error: null }),
        enroll: async () => { mfaCalls.push("enroll"); throw new Error("DATA:mfa.enroll"); },
        unenroll: async () => { mfaCalls.push("unenroll"); return { error: null }; },
        challengeAndVerify: async () => { mfaCalls.push("challengeAndVerify"); throw new Error("DATA:mfa.verify"); },
      },
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      // Only the gate's own single-row lookup is answered; any other admin_users access counts as a data read.
      if (table === "admin_users") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: persona.row, error: null }), is: () => { reads.push("admin_users:list"); throw new Error("DATA:admin_users"); } }) }) };
      reads.push(table);
      throw new Error(`DATA:${table}`);
    },
    get auth() { reads.push("auth.admin"); throw new Error("DATA:auth.admin"); },
    rpc: (fn: string) => { reads.push(`rpc:${fn}`); throw new Error(`DATA:rpc:${fn}`); },
  }),
}));

const U = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const nowSec = () => Math.floor(Date.now() / 1000);
const aal2 = (totpAgoSec = 30) => ({ sub: U, email: "admin@example.test", aal: "aal2", amr: [{ method: "password", timestamp: nowSec() - 120 }, { method: "totp", timestamp: nowSec() - totpAgoSec }] });
const aal1 = () => ({ sub: U, email: "admin@example.test", aal: "aal1", amr: [{ method: "password", timestamp: nowSec() - 60 }] });
const VERIFIED = [{ status: "verified", id: ID }];

const PERSONAS = {
  anon: { claims: null, row: null, factors: [] },
  nonAdmin: { claims: aal2(), row: null, factors: VERIFIED },
  disabledOwner: { claims: aal2(), row: { role: "owner", disabled_at: "2026-10-01T00:00:00Z" }, factors: VERIFIED },
  billingAdmin: { claims: aal2(), row: { role: "billing_admin", disabled_at: null }, factors: VERIFIED },
  billingAdminAal1: { claims: aal1(), row: { role: "billing_admin", disabled_at: null }, factors: VERIFIED },
  owner: { claims: aal2(), row: { role: "owner", disabled_at: null }, factors: VERIFIED },
  ownerAal1: { claims: aal1(), row: { role: "owner", disabled_at: null }, factors: VERIFIED },
  ownerNoFactor: { claims: aal1(), row: { role: "owner", disabled_at: null }, factors: [] },
  ownerStaleTotp: { claims: aal2(3600), row: { role: "owner", disabled_at: null }, factors: VERIFIED },
} satisfies Record<string, Persona>;
type PersonaName = keyof typeof PERSONAS;

beforeEach(() => { reads.length = 0; mfaCalls.length = 0; });

/** Calls an entry point and classifies the outcome. Anything past the gate counts as allowed. */
async function outcome(fn: () => unknown): Promise<string> {
  try {
    const r = await fn();
    if (r && typeof r === "object" && "ok" in (r as object) && (r as { ok: boolean }).ok === false) {
      const err = (r as { error: string }).error;
      if (["unauthenticated", "not_admin", "mfa_required", "step_up_required"].includes(err)) return `denied:${err}`;
    }
    return "allowed";
  } catch (e) {
    const m = (e as Error).message;
    if (m.startsWith("NEXT_REDIRECT:") || m === "NEXT_NOT_FOUND") return m;
    if (m.startsWith("DATA:")) return "allowed"; // got past the gate and reached a data read
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Pages and layouts
// ---------------------------------------------------------------------------------------------------------------------

type Access = "any_admin" | "owner_only";
const params = Promise.resolve({ id: ID });
const searchParams = Promise.resolve({});
const PAGES: { file: string; access: Access; load: () => Promise<{ default: (p: never) => unknown }>; props?: unknown }[] = [
  { file: "page.tsx", access: "any_admin", load: () => import("./page") },
  { file: "billing/layout.tsx", access: "any_admin", load: () => import("./billing/layout"), props: { children: null } },
  { file: "billing/page.tsx", access: "any_admin", load: () => import("./billing/page") },
  { file: "billing/subscriptions/page.tsx", access: "any_admin", load: () => import("./billing/subscriptions/page"), props: { searchParams } },
  { file: "billing/subscriptions/[id]/page.tsx", access: "any_admin", load: () => import("./billing/subscriptions/[id]/page"), props: { params } },
  { file: "billing/coupons/page.tsx", access: "any_admin", load: () => import("./billing/coupons/page") },
  { file: "billing/coupons/new/page.tsx", access: "any_admin", load: () => import("./billing/coupons/new/page") },
  { file: "billing/coupons/[id]/page.tsx", access: "any_admin", load: () => import("./billing/coupons/[id]/page"), props: { params } },
  { file: "billing/payments/page.tsx", access: "any_admin", load: () => import("./billing/payments/page"), props: { searchParams } },
  { file: "billing/audit/page.tsx", access: "any_admin", load: () => import("./billing/audit/page"), props: { searchParams } },
  { file: "billing/settings/page.tsx", access: "any_admin", load: () => import("./billing/settings/page") },
  { file: "(console)/layout.tsx", access: "owner_only", load: () => import("./(console)/layout"), props: { children: null } },
  { file: "(console)/overview/page.tsx", access: "owner_only", load: () => import("./(console)/overview/page") },
  { file: "(console)/spaces/page.tsx", access: "owner_only", load: () => import("./(console)/spaces/page"), props: { searchParams } },
  { file: "(console)/spaces/[id]/page.tsx", access: "owner_only", load: () => import("./(console)/spaces/[id]/page"), props: { params } },
  { file: "(console)/usage/page.tsx", access: "owner_only", load: () => import("./(console)/usage/page") },
  { file: "(console)/infrastructure/page.tsx", access: "owner_only", load: () => import("./(console)/infrastructure/page") },
  { file: "(console)/backups/page.tsx", access: "owner_only", load: () => import("./(console)/backups/page") },
  { file: "(console)/alerts/page.tsx", access: "owner_only", load: () => import("./(console)/alerts/page") },
  { file: "(console)/costs/page.tsx", access: "owner_only", load: () => import("./(console)/costs/page") },
  { file: "(console)/integrations/page.tsx", access: "owner_only", load: () => import("./(console)/integrations/page") },
];
/** MFA screens + the chrome-free root layout have their own (documented) gates; checked separately below. */
const SPECIAL = ["layout.tsx", "mfa/enroll/page.tsx", "mfa/verify/page.tsx"];

const EXPECT_PAGE: Record<PersonaName, Record<Access, string>> = {
  anon: { any_admin: "NEXT_REDIRECT:/log-in?next=/admin", owner_only: "NEXT_REDIRECT:/log-in?next=/admin" },
  nonAdmin: { any_admin: "NEXT_NOT_FOUND", owner_only: "NEXT_NOT_FOUND" },
  disabledOwner: { any_admin: "NEXT_NOT_FOUND", owner_only: "NEXT_NOT_FOUND" },
  billingAdmin: { any_admin: "allowed", owner_only: "NEXT_NOT_FOUND" },
  billingAdminAal1: { any_admin: "NEXT_REDIRECT:/admin/mfa/verify", owner_only: "NEXT_NOT_FOUND" },
  owner: { any_admin: "allowed", owner_only: "allowed" },
  ownerAal1: { any_admin: "NEXT_REDIRECT:/admin/mfa/verify", owner_only: "NEXT_REDIRECT:/admin/mfa/verify" },
  ownerNoFactor: { any_admin: "NEXT_REDIRECT:/admin/mfa/enroll", owner_only: "NEXT_REDIRECT:/admin/mfa/enroll" },
  ownerStaleTotp: { any_admin: "allowed", owner_only: "allowed" }, // pages need AAL2, not a fresh code
};

describe("every Admin page/layout file is in the matrix", () => {
  it("no page or layout under /admin exists without a matrix entry", () => {
    const root = join(process.cwd(), "src/app/(site)/admin");
    const found: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f === "page.tsx" || f === "layout.tsx") found.push(relative(root, p)); } };
    walk(root);
    expect(found.sort()).toEqual([...PAGES.map((p) => p.file), ...SPECIAL].sort());
  });
});

describe.each(Object.keys(PERSONAS) as PersonaName[])("persona %s", (name) => {
  it.each(PAGES.map((p) => [p.file, p] as const))("%s", async (_file, p) => {
    persona = PERSONAS[name];
    const mod = await p.load();
    const got = await outcome(() => mod.default((p.props ?? {}) as never));
    let want = EXPECT_PAGE[name][p.access];
    // /admin itself redirects an allowed admin to their landing section.
    if (p.file === "page.tsx" && want === "allowed") want = persona.row?.role === "owner" ? "NEXT_REDIRECT:/admin/overview" : "NEXT_REDIRECT:/admin/billing";
    expect(got).toBe(want);
    if (want !== "allowed") expect(reads, "a denied caller caused a data read").toEqual([]);
  });
});

describe("MFA screens: only an active admin may reach them; they never read Admin data", () => {
  const enroll = () => import("./mfa/enroll/page");
  const verify = () => import("./mfa/verify/page");
  it.each<[PersonaName, string, string]>([
    ["anon", "NEXT_REDIRECT:/log-in?next=/admin", "NEXT_REDIRECT:/log-in?next=/admin"],
    ["nonAdmin", "NEXT_NOT_FOUND", "NEXT_NOT_FOUND"],
    ["disabledOwner", "NEXT_NOT_FOUND", "NEXT_NOT_FOUND"],
    ["ownerAal1", "allowed", "allowed"],
    ["billingAdminAal1", "allowed", "allowed"],
    ["owner", "NEXT_REDIRECT:/admin", "NEXT_REDIRECT:/admin"],
  ])("%s -> enroll %s, verify %s", async (name, wantEnroll, wantVerify) => {
    persona = PERSONAS[name];
    expect(await outcome(async () => (await enroll()).default())).toBe(wantEnroll);
    expect(await outcome(async () => (await verify()).default({ searchParams: Promise.resolve({}) }))).toBe(wantVerify);
    expect(reads).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Server actions (public POST endpoints: each must gate itself)
// ---------------------------------------------------------------------------------------------------------------------

const fd = (o: Record<string, string> = {}) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
type Act = { name: string; stepUp: boolean; ownerOnly: boolean; call: (a: typeof import("./billing/actions")) => Promise<unknown> };
const ACTIONS: Act[] = [
  { name: "createCouponAction", stepUp: false, ownerOnly: false, call: (a) => a.createCouponAction(null, fd({ code: "ADM1TEST", discountType: "percent", percentOff: "10", durationType: "once", usageRule: "once_per_space" })) },
  { name: "updateCouponAction", stepUp: false, ownerOnly: false, call: (a) => a.updateCouponAction(ID, null, fd()) },
  { name: "setCouponActiveAction", stepUp: false, ownerOnly: false, call: (a) => a.setCouponActiveAction(ID, true) },
  { name: "syncCouponAction", stepUp: false, ownerOnly: false, call: (a) => a.syncCouponAction(ID) },
  { name: "syncPlanAction", stepUp: true, ownerOnly: false, call: (a) => a.syncPlanAction() },
  { name: "setExemptAction", stepUp: true, ownerOnly: false, call: (a) => a.setExemptAction(ID, null, fd({ reason: "x" })) },
  { name: "clearExemptAction", stepUp: true, ownerOnly: false, call: (a) => a.clearExemptAction(ID, null, fd({ reason: "x" })) },
  { name: "setPaidCheckoutAction", stepUp: true, ownerOnly: false, call: (a) => a.setPaidCheckoutAction(false) },
  { name: "grantAdminAction", stepUp: true, ownerOnly: true, call: (a) => a.grantAdminAction(null, fd({ email: "x@example.test", role: "billing_admin" })) },
  { name: "revokeAdminAction", stepUp: true, ownerOnly: true, call: (a) => a.revokeAdminAction(ID) },
  { name: "resyncSubscriptionAction", stepUp: false, ownerOnly: false, call: (a) => a.resyncSubscriptionAction("sub_123") },
  { name: "reconcileCheckoutAction", stepUp: false, ownerOnly: false, call: (a) => a.reconcileCheckoutAction(ID) },
];

function expectAction(name: PersonaName, act: Act): string {
  switch (name) {
    case "anon": return "denied:unauthenticated";
    case "nonAdmin": case "disabledOwner": return "denied:not_admin";
    case "billingAdmin": return act.ownerOnly ? "denied:not_admin" : "allowed";
    case "billingAdminAal1": return act.ownerOnly ? "denied:not_admin" : "denied:mfa_required";
    case "owner": return "allowed";
    case "ownerAal1": case "ownerNoFactor": return "denied:mfa_required";
    case "ownerStaleTotp": return act.stepUp ? "denied:step_up_required" : "allowed";
  }
}

describe("every billing server action is in the matrix", () => {
  it("the matrix covers every exported action", async () => {
    const a = await import("./billing/actions");
    expect(Object.keys(a).filter((k) => typeof (a as Record<string, unknown>)[k] === "function").sort()).toEqual(ACTIONS.map((x) => x.name).sort());
  });
});

describe.each(Object.keys(PERSONAS) as PersonaName[])("actions as %s", (name) => {
  it.each(ACTIONS.map((x) => [x.name, x] as const))("%s", async (_n, act) => {
    persona = PERSONAS[name];
    const a = await import("./billing/actions");
    const want = expectAction(name, act);
    expect(await outcome(() => act.call(a))).toBe(want);
    if (want !== "allowed") expect(reads, "a denied caller caused a data read").toEqual([]);
  });
});

describe("MFA actions refuse anyone who is not an active admin before touching the MFA API", () => {
  it.each<PersonaName>(["anon", "nonAdmin", "disabledOwner"])("%s", async (name) => {
    persona = PERSONAS[name];
    const m = await import("./mfa/actions");
    const want = name === "anon" ? "NEXT_REDIRECT:/log-in?next=/admin" : "NEXT_NOT_FOUND";
    expect(await outcome(() => m.startMfaEnrollmentAction())).toBe(want);
    expect(await outcome(() => m.completeMfaEnrollmentAction(ID, null, fd({ code: "123456" })))).toBe(want);
    expect(await outcome(() => m.verifyMfaAction("/admin", null, fd({ code: "123456" })))).toBe(want);
    expect(await outcome(() => m.stepUpVerifyAction(null, fd({ code: "123456" })))).toBe(want);
    expect(mfaCalls).toEqual([]);
    expect(reads).toEqual([]);
  });
});
