import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import { valueOf, type MetricState } from "../contracts/metric";
import { getSpaceDetail, listSpaces, loadSpacesSummary, type SpacesSummary } from "./spaces";
import { loadConsoleOverview, type ConsoleOverview } from "./overview";

/**
 * Exact counts against seeded fixtures on a LOCAL Supabase stack only (never hosted).
 *
 * Enabled with ADMIN_LOCAL_INT=1 plus ADMIN_INT_SUPABASE_URL (must be http://127.0.0.1:<port>), ADMIN_INT_SERVICE_KEY
 * and ADMIN_INT_PSQL (a command that runs psql as the local superuser, reading SQL from stdin). Fixtures are named
 * `adm1-int-*`. Tenants are inserted with session_replication_role=replica because the Space-creation triggers
 * require an end-user session; children are written and removed explicitly (FK actions are off in that mode).
 *
 * The test compares BEFORE/AFTER deltas, so pre-existing local data does not matter (a concurrent writer could make
 * it flaky; it then fails loudly rather than passing).
 */
const ENABLED = process.env.ADMIN_LOCAL_INT === "1";
const URL_ = process.env.ADMIN_INT_SUPABASE_URL ?? "";
const KEY = process.env.ADMIN_INT_SERVICE_KEY ?? "";
const PSQL = process.env.ADMIN_INT_PSQL ?? "";

const psql = (sql: string) => execFileSync(PSQL, ["-At", "-v", "ON_ERROR_STOP=1"], { input: sql }).toString();
const v = (m: MetricState) => valueOf(m);

describe.skipIf(!ENABLED)("Spaces & Overview exact counts vs adm1 fixtures (local stack)", () => {
  let db: SupabaseClient;
  const t = { T1: randomUUID(), T2: randomUUID(), T3: randomUUID(), T4: randomUUID(), T5: randomUUID(), T6: randomUUID() };
  const users: string[] = [];
  let before: SpacesSummary; let after: SpacesSummary;
  let ovBefore: ConsoleOverview; let ovAfter: ConsoleOverview;
  let hubBefore: number | null; let hubAfter: number | null;

  beforeAll(async () => {
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(URL_)) throw new Error("refusing: ADMIN_INT_SUPABASE_URL is not a local stack");
    db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const now = new Date();
    before = await loadSpacesSummary(db, now);
    ovBefore = await loadConsoleOverview(db, now);
    hubBefore = v((await listSpaces(db, { type: "client_hub", state: "active" })).total);

    for (const n of ["a", "b"]) {
      const { data, error } = await db.auth.admin.createUser({ email: `adm1-int-${n}-${Date.now()}@example.test`, email_confirm: true });
      if (error || !data.user) throw new Error(`fixture user: ${error?.message}`);
      users.push(data.user.id);
    }
    const A = users[0];
    psql(`
      begin;
      set local session_replication_role = replica;
      insert into public.tenants (id, name, product_type, status, created_by, created_at, content_updated_at, archived_at) values
        ('${t.T1}', 'adm1-int-T1', 'retreat', 'live', '${A}', now(), now() - interval '1 hour', null),
        ('${t.T2}', 'adm1-int-T2', 'retreat', 'live', '${A}', now(), now(), null),
        ('${t.T3}', 'adm1-int-T3', 'teach', 'draft', '${A}', now(), now(), null),
        ('${t.T4}', 'adm1-int-T4', 'teach', 'ready_to_publish', '${A}', now(), now(), null),
        ('${t.T5}', 'adm1-int-T5', 'teach', 'archived', '${A}', now(), now(), now()),
        ('${t.T6}', 'adm1-int-T6', 'client_hub', 'live', '${A}', now(), now(), null);
      insert into public.tenant_members (tenant_id, user_id, role) select id, '${A}', 'owner' from public.tenants where name like 'adm1-int-%' and id in ('${Object.values(t).join("','")}');
      insert into public.published_spaces (tenant_id, product_type, name, theme, published_at) values
        ('${t.T1}', 'retreat', 'adm1-int-T1', '{}'::jsonb, now() - interval '2 minutes'),
        ('${t.T2}', 'retreat', 'adm1-int-T2', '{}'::jsonb, now() - interval '1 minute');
      insert into public.space_subscriptions (tenant_id, status, stripe_mode, stripe_subscription_id, currency, base_amount_minor, payment_failed_at, exempt_reason, exempt_at) values
        ('${t.T1}', 'active', 'test', 'sub_adm1_int_1', 'USD', 2500, null, null, null),
        ('${t.T2}', 'exempt', null, null, null, null, null, 'adm1 fixture', now()),
        ('${t.T3}', 'past_due', 'test', 'sub_adm1_int_3', 'USD', 2500, now() - interval '48 hours', null, null),
        ('${t.T6}', 'active', 'test', 'sub_adm1_int_6', null, 1000, null, null, null);
      commit;`);
    const later = new Date();
    after = await loadSpacesSummary(db, later);
    ovAfter = await loadConsoleOverview(db, later);
    hubAfter = v((await listSpaces(db, { type: "client_hub", state: "active" })).total);
  }, 60_000);

  afterAll(async () => {
    if (!ENABLED) return;
    const ids = `'${Object.values(t).join("','")}'`;
    psql(`
      begin;
      set local session_replication_role = replica;
      delete from public.space_subscriptions where tenant_id in (${ids});
      delete from public.published_spaces where tenant_id in (${ids});
      delete from public.tenant_members where tenant_id in (${ids});
      delete from public.tenants where id in (${ids}) and name like 'adm1-int-%';
      commit;`);
    for (const u of users) await db.auth.admin.deleteUser(u);
    const left = psql(`select count(*) from public.tenants where name like 'adm1-int-%';`).trim();
    expect(left).toBe("0");
  }, 60_000);

  const d = (a: MetricState, b: MetricState) => {
    expect(a.state, "before").toBe("ok"); expect(b.state, "after").toBe("ok");
    return (v(b) as number) - (v(a) as number);
  };
  const byType = (s: SpacesSummary, ty: string) => s.byType.find((x) => x.type === ty)!.metric;
  const month = (s: SpacesSummary) => s.newByMonth[s.newByMonth.length - 1].byType;

  it("accounts and Space totals", () => {
    expect(d(before.accounts, after.accounts)).toBe(2);
    expect(d(before.total, after.total)).toBe(5);
    expect(d(before.archived, after.archived)).toBe(1);
    expect(d(byType(before, "retreat"), byType(after, "retreat"))).toBe(2);
    expect(d(byType(before, "teach"), byType(after, "teach"))).toBe(2);
    expect(d(byType(before, "client_hub"), byType(after, "client_hub"))).toBe(1);
  });
  it("publishing states", () => {
    expect(d(before.published, after.published)).toBe(2);
    expect(d(before.draft, after.draft)).toBe(2);
    expect(d(before.editsPending, after.editsPending)).toBe(1);
    expect(d(before.publishedThisMonth, after.publishedThisMonth)).toBe(2);
  });
  it("billing-derived states (reusing the billing count specs)", () => {
    const b0 = before.billing, b1 = after.billing;
    expect(d(b0.paidSubscriptions, b1.paidSubscriptions)).toBe(2);
    expect(d(b0.paidSpaces, b1.paidSpaces)).toBe(3);
    expect(d(b0.exempt, b1.exempt)).toBe(1);
    expect(d(b0.guestSuspended, b1.guestSuspended)).toBe(1);
    expect(d(b0.studioSuspended, b1.studioSuspended)).toBe(0);
    expect(d(b0.legacy, b1.legacy)).toBe(1);
  });
  it("new Spaces this month, per type (archived included: current rows)", () => {
    expect(d(month(before).retreat, month(after).retreat)).toBe(2);
    expect(d(month(before).teach, month(after).teach)).toBe(3);
    expect(d(month(before).client_hub, month(after).client_hub)).toBe(1);
  });
  it("list totals are exact", () => {
    expect((hubAfter as number) - (hubBefore as number)).toBe(1);
  });
  it("console Overview reuses the billing loader: paid, failures, MRR per currency, missing-currency warning", () => {
    expect(d(ovBefore.paidSpaces, ovAfter.paidSpaces)).toBe(2);
    expect(d(ovBefore.paymentFailures, ovAfter.paymentFailures)).toBe(1);
    expect(d(ovBefore.mrrCurrencyMissing, ovAfter.mrrCurrencyMissing)).toBe(1);
    expect(d(ovBefore.spacesTotal, ovAfter.spacesTotal)).toBe(5);
    expect(d(ovBefore.publishedThisMonth, ovAfter.publishedThisMonth)).toBe(2);
    // Baseline only: no USD line before the fixtures means there was no USD MRR (a successful, empty read).
    const usd = (o: ConsoleOverview): number => {
      if ("state" in o.mrr) throw new Error(`MRR not loaded: ${o.mrr.state}`);
      const m = o.mrr.current.USD;
      return m ? (v(m) as number) : 0;
    };
    // The null-currency subscription (T6) is NOT added to USD: it is excluded and counted in mrrCurrencyMissing.
    expect(usd(ovAfter) - usd(ovBefore)).toBe(2500);
    expect(ovAfter.netNewPaidMonth.state).toBe("not_measured");
    expect(ovAfter.watchdog.state).toBe("not_connected");
  });
  it("Space detail", async () => {
    const s = await getSpaceDetail(db, t.T2);
    expect(s).toMatchObject({ name: "adm1-int-T2", editsPending: true, subscription: { state: "present", status: "exempt" } });
    expect(v(s!.members.owner)).toBe(1);
    expect(s!.ownerUserIds).toEqual([users[0]]);
    expect(await getSpaceDetail(db, randomUUID())).toBeNull();
  });
});
