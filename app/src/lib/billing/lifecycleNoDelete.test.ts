import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runBillingJobs } from "./lifecycleJob";
import { checkoutAndPay, makeHarness } from "./testing/harness";

/**
 * TASK 032 C2 regression: Day 14 of the failed-payment lifecycle is deletion ELIGIBILITY only.
 * Nothing the scheduled job (Vercel Cron -> /api/cron/billing -> runBillingJobs -> billing_apply_lifecycle)
 * can reach may delete a Space, its media, its data or an account. Any automatic deletion needs an approved
 * retention and recovery workflow first (docs/billing/LIFECYCLE.md) - and must change this test deliberately.
 */

const SRC = resolve(__dirname, "../..");
const MIGRATIONS = resolve(__dirname, "../../../supabase/migrations");

/** Follows value (non-`import type`) imports from the entry files, within src/. */
function reachableSources(entries: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const queue = [...entries];
  const resolveSpec = (from: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
    else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
    else return null; // packages (stripe SDK, supabase-js, node:*) are not ours to scan
    for (const cand of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) if (existsSync(cand) && cand.match(/\.tsx?$/)) return cand;
    return null;
  };
  while (queue.length) {
    const file = queue.shift()!;
    if (out.has(file)) continue;
    const text = readFileSync(file, "utf8");
    out.set(file, text);
    for (const m of text.matchAll(/^\s*(import|export)\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)) {
      const next = resolveSpec(file, m[2]);
      if (next && !out.has(next)) queue.push(next);
    }
  }
  return out;
}

const FORBIDDEN: [string, RegExp][] = [
  ["delete_space RPC", /delete_space/],
  ["deleteSpaceCompletely", /deleteSpaceCompletely/],
  ["tenant media cleanup", /tenantCleanup|removeTenantMedia/],
  ["Storage API", /\.storage\b/],
  ["PostgREST row delete", /\.delete\s*\(/],
  ["Storage remove", /\.remove\s*\(/],
  ["account deletion", /deleteUser|delete_account|deleteAccount/],
];

describe("billing lifecycle never deletes (Day 14 = eligibility only)", () => {
  const entries = [join(SRC, "app/api/cron/billing/route.ts"), join(SRC, "lib/billing/lifecycleJob.ts")];
  const files = reachableSources(entries);

  it("the cron route reaches the real job, store and lifecycle code (sanity of the scan)", () => {
    const names = [...files.keys()].map((f) => f.slice(SRC.length + 1));
    expect(names).toEqual(expect.arrayContaining(["lib/billing/lifecycleJob.ts", "lib/billing/deps.server.ts", "lib/billing/store.ts", "lib/billing/sync.ts"]));
  });

  it("no code reachable from the cron job calls a delete / remove / Storage / account-deletion path", () => {
    const hits: string[] = [];
    for (const [file, text] of files) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1"); // comments may mention deletion
      for (const [label, re] of FORBIDDEN) if (re.test(code)) hits.push(`${file.slice(SRC.length + 1)}: ${label}`);
    }
    expect(hits).toEqual([]);
  });

  it("the BillingStore interface exposes no delete/remove/purge operation", () => {
    const store = readFileSync(join(SRC, "lib/billing/store.ts"), "utf8");
    const iface = store.slice(store.indexOf("export interface BillingStore"), store.indexOf("\n}", store.indexOf("export interface BillingStore")));
    expect(iface.length).toBeGreaterThan(100);
    const methods = [...iface.matchAll(/^\s*(\w+)\s*\(/gm)].map((m) => m[1]);
    expect(methods).toContain("applyLifecycle");
    expect(methods.filter((m) => /delet|remove|purge|destroy|drop|wipe/i.test(m))).toEqual([]);
  });

  it("billing_apply_lifecycle (every definition in every migration) only stamps columns: no DELETE / TRUNCATE / DROP", () => {
    const defs: string[] = [];
    for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql")).sort()) {
      const sql = readFileSync(join(MIGRATIONS, f), "utf8");
      for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.billing_apply_lifecycle\b[\s\S]*?\$\$([\s\S]*?)\$\$/gi)) defs.push(`${f}\n${m[1]}`);
    }
    expect(defs.length).toBeGreaterThanOrEqual(1);
    for (const body of defs) {
      expect(body).not.toMatch(/\bdelete\s+from\b|\btruncate\b|\bdrop\s+/i);
      expect(body).toMatch(/eligible_for_deletion_at\s*=/);
      expect(body).not.toMatch(/delete_space|storage\.objects|auth\.users/i);
    }
  });

  it("the other SQL functions the job calls (expiry of checkouts / reservations, next action) only UPDATE", () => {
    const all = readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql")).sort().map((f) => readFileSync(join(MIGRATIONS, f), "utf8")).join("\n");
    for (const fn of ["billing_expire_open_checkouts", "billing_expire_stale_reservations", "billing_release_coupon_reservation", "billing_set_next_action"]) {
      const bodies = [...all.matchAll(new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${fn}\\b[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, "gi"))].map((m) => m[1]);
      expect(bodies.length, fn).toBeGreaterThanOrEqual(1);
      for (const b of bodies) expect(b, fn).not.toMatch(/\bdelete\s+from\b|\btruncate\b|\bdrop\s+/i);
    }
  });

  it("no migration schedules database-side jobs (pg_cron) that could act on eligibility", () => {
    for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql"))) {
      expect(readFileSync(join(MIGRATIONS, f), "utf8"), f).not.toMatch(/cron\.schedule|pg_cron/i);
    }
  });

  it("at runtime the job calls no store method that deletes, even long after Day 14, and the Space survives", async () => {
    const h = makeHarness();
    const called = new Set<string>();
    const real = h.deps.store;
    h.deps.store = new Proxy(real, {
      get(target, prop, recv) {
        const v = Reflect.get(target, prop, recv);
        if (typeof v === "function" && typeof prop === "string") return (...args: unknown[]) => { called.add(prop); return v.apply(target, args); };
        return v;
      },
    });
    const paid = await checkoutAndPay(h);
    await h.deliver("checkout.session.completed", paid.sessionId);
    const sub = [...h.store.subs.values()][0];
    expect(sub).toBeDefined();
    h.advance(30 * 86400_000);
    const failed = h.stripe.failRenewal(sub.stripeSubscriptionId!);
    await h.deliver("invoice.payment_failed", failed.id, "evt_fail");
    const actions: string[] = [];
    for (const days of [1.1, 7, 12, 14, 30, 365]) {
      h.advance(days * 86400_000);
      const r = await runBillingJobs(h.deps, null);
      actions.push(...r.lifecycleActions.map((a) => a.action));
    }
    expect(actions).toContain("deletion_eligible");
    expect([...called].filter((m) => /delet|remove|purge|destroy|drop|wipe/i.test(m))).toEqual([]);
    expect(h.store.subs.get(sub.id)!.eligibleForDeletionAt).not.toBeNull();
    expect(h.store.tenants.has(sub.tenantId)).toBe(true);
  });
});
