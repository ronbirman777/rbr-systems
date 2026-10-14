import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_METRIC_ROWS, fetchAllPaged, overviewCountSpecs, type CountedMetric } from "@/lib/billing/admin/metrics";
import { applyCountFilters } from "@/lib/billing/admin/queries";
import { errorState, fromBoundedRead, ok, settle, type MetricState } from "../contracts/metric";
import { COUNT, exactCount } from "./count";

/**
 * Spaces & Customers read-side (docs/admin/ADMIN-METRIC-CONTRACTS.md §3.2). Service-role client; the caller has
 * ALREADY passed requireAdminPage({ roles: ["owner"] }).
 *
 * Rules:
 *  - Counts are exact database counts (count.ts). No `.limit` truncation; list pages use `.range` paging with an
 *    exact total. A failed read is an `error` state, never 0.
 *  - Privacy (contracts §1.4): aggregates only. Nothing here reads guest identity, IPs or guest-access attempt rows.
 *    The only personal data is the Space owner's user id on ONE Space's detail; resolving it to an email is the
 *    page's job, after the view is audited (lib/admin/audit/views.ts).
 */

export const KNOWN_SPACE_TYPES = ["retreat", "teach", "client_hub"] as const;
export type KnownSpaceType = (typeof KNOWN_SPACE_TYPES)[number];

const SRC_CORE = "supabase_sql:tenants";
const SRC_BILL = "billing_synced:space_subscriptions";
/** Reason codes are translated by the page (admin dictionary `rsn_<code>`). */
const BILLING_MISSING = "billing_missing";

/** Not archived = the contract's `spaces.total` (status <> 'archived' and archived_at is null): applied inline as
 *  `.neq("status", "archived").is("archived_at", null)` everywhere below. */

export function monthStartUtc(d: Date, offsetMonths = 0): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offsetMonths, 1));
}

export type BillingSpaceCounts = Record<"paidSubscriptions" | "paidSpaces" | "exempt" | "guestSuspended" | "studioSuspended", MetricState> & {
  /** The availability probe: no_source on an environment without the billing tables. */
  available: MetricState;
  /** Not-archived Spaces with no space_subscriptions row. */
  legacy: MetricState;
};

export type SpacesSummary = {
  asOf: Date;
  /** count(auth.users). There is no approved QA/demo exclusion list yet: the page labels it "includes internal/demo accounts". */
  accounts: MetricState;
  total: MetricState;
  archived: MetricState;
  byType: { type: string; metric: MetricState }[];
  published: MetricState;
  draft: MetricState;
  editsPending: MetricState;
  publishedThisMonth: MetricState;
  billing: BillingSpaceCounts;
  /** Six UTC months, oldest first; per known type. Current rows only (deleted Spaces are gone until ADM-M1 snapshots). */
  newByMonth: { monthStart: string; byType: Record<KnownSpaceType, MetricState> }[];
};

export async function countAccounts(db: SupabaseClient, asOf: Date): Promise<MetricState> {
  return settle("supabase_auth:users", async () => {
    // GoTrue's admin list answers with the exact total of auth.users (X-Total-Count); one row is transferred.
    const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) return errorState("supabase_auth:users", error.message.slice(0, 200));
    return ok((data as { total?: unknown } | null)?.total, { asOf, source: "supabase_auth:users" });
  });
}

export async function countSpaceTotals(db: SupabaseClient, asOf: Date) {
  const meta = { source: SRC_CORE, asOf };
  const others = `(${KNOWN_SPACE_TYPES.join(",")})`;
  const [total, archived, byKnown, other] = await Promise.all([
    exactCount(db.from("tenants").select("id", COUNT).neq("status", "archived").is("archived_at", null), meta),
    exactCount(db.from("tenants").select("id", COUNT).or("status.eq.archived,archived_at.not.is.null"), meta),
    Promise.all(KNOWN_SPACE_TYPES.map((t) => exactCount(db.from("tenants").select("id", COUNT).neq("status", "archived").is("archived_at", null).eq("product_type", t), meta))),
    exactCount(db.from("tenants").select("id", COUNT).neq("status", "archived").is("archived_at", null).not("product_type", "in", others), meta),
  ]);
  const byType: { type: string; metric: MetricState }[] = KNOWN_SPACE_TYPES.map((type, i) => ({ type, metric: byKnown[i] }));
  // An unknown type is listed as "other", never dropped (contracts §3.2). Shown only when it is not a confident 0.
  if (!(other.state === "ok" && other.value === 0)) byType.push({ type: "other", metric: other });
  return { total, archived, byType };
}

export async function countPublishing(db: SupabaseClient, now: Date) {
  const meta = { source: "supabase_sql:published_spaces", asOf: now };
  const pubNotArchived = () => db.from("published_spaces").select("tenant_id, tenants!inner(status, archived_at)", COUNT).neq("tenants.status", "archived").is("tenants.archived_at", null);
  const [published, draft, publishedThisMonth, editsPending] = await Promise.all([
    exactCount(pubNotArchived(), meta),
    // Never published: draft/ready_to_publish, not archived, and NO published_spaces row (anti-join).
    exactCount(db.from("tenants").select("id, published_spaces(tenant_id)", COUNT).in("status", ["draft", "ready_to_publish"]).is("archived_at", null).is("published_spaces", null), { ...meta, source: SRC_CORE }),
    exactCount(pubNotArchived().gte("published_at", monthStartUtc(now).toISOString()), meta),
    countEditsPending(db, now),
  ]);
  return { published, draft, publishedThisMonth, editsPending };
}

/**
 * "Published (edits pending)": content_updated_at > published_at. PostgREST cannot compare two columns, so this one
 * figure reads the published rows (two timestamps each) in bounded pages. Past MAX_METRIC_ROWS it is `truncated`.
 */
async function countEditsPending(db: SupabaseClient, now: Date): Promise<MetricState> {
  return settle("supabase_sql:published_spaces", async () => {
    const { rows, truncated } = await fetchAllPaged((from, to) =>
      db.from("published_spaces").select("tenant_id, published_at, tenants!inner(content_updated_at, status, archived_at)")
        .neq("tenants.status", "archived").is("tenants.archived_at", null).order("tenant_id").range(from, to),
    );
    let n = 0;
    for (const r of rows as unknown as { published_at: string; tenants: { content_updated_at: string } | null }[]) {
      if (r.tenants && Date.parse(r.tenants.content_updated_at) > Date.parse(r.published_at)) n++;
    }
    return fromBoundedRead(n, truncated, MAX_METRIC_ROWS, { asOf: now, source: "supabase_sql:published_spaces" });
  });
}

const BILLING_KEYS = ["paidSubscriptions", "paidSpaces", "exempt", "guestSuspended", "studioSuspended"] as const satisfies readonly CountedMetric[];

/** Billing-derived Space states, reusing the billing Overview's exact count specs (docs/billing/METRICS.md). */
export async function countBillingSpaces(db: SupabaseClient, now: Date, total: MetricState): Promise<BillingSpaceCounts> {
  const meta = { source: SRC_BILL, asOf: now, missingReason: BILLING_MISSING };
  const available = await exactCount(db.from("space_subscriptions").select("id", COUNT), meta);
  if (available.state === "no_source") {
    // Production before the release: every Space is legacy. Show that, not "0 paid" (contracts §3.2).
    const all = Object.fromEntries(BILLING_KEYS.map((k) => [k, available])) as Record<(typeof BILLING_KEYS)[number], MetricState>;
    return { ...all, available, legacy: total };
  }
  const specs = overviewCountSpecs(now);
  const [counts, legacy] = await Promise.all([
    Promise.all(BILLING_KEYS.map((k) => exactCount(applyCountFilters(db.from("space_subscriptions").select("id", COUNT), specs[k]), meta))),
    exactCount(db.from("tenants").select("id, space_subscriptions(id)", COUNT).neq("status", "archived").is("archived_at", null).is("space_subscriptions", null), { ...meta, source: SRC_CORE }),
  ]);
  return { ...(Object.fromEntries(BILLING_KEYS.map((k, i) => [k, counts[i]])) as Record<(typeof BILLING_KEYS)[number], MetricState>), available, legacy };
}

export async function countNewByMonth(db: SupabaseClient, now: Date, months = 6): Promise<SpacesSummary["newByMonth"]> {
  const meta = { source: SRC_CORE, asOf: now };
  const starts = Array.from({ length: months }, (_, i) => monthStartUtc(now, i - (months - 1)));
  return Promise.all(starts.map(async (start) => {
    const end = monthStartUtc(start, 1);
    const counts = await Promise.all(KNOWN_SPACE_TYPES.map((t) =>
      exactCount(db.from("tenants").select("id", COUNT).eq("product_type", t).gte("created_at", start.toISOString()).lt("created_at", end.toISOString()), meta)));
    return { monthStart: start.toISOString(), byType: Object.fromEntries(KNOWN_SPACE_TYPES.map((t, i) => [t, counts[i]])) as Record<KnownSpaceType, MetricState> };
  }));
}

export async function loadSpacesSummary(db: SupabaseClient, now: Date = new Date()): Promise<SpacesSummary> {
  const [accounts, totals, publishing, newByMonth] = await Promise.all([countAccounts(db, now), countSpaceTotals(db, now), countPublishing(db, now), countNewByMonth(db, now)]);
  const billing = await countBillingSpaces(db, now, totals.total);
  return { asOf: now, accounts, ...totals, ...publishing, billing, newByMonth };
}

// ---------------------------------------------------------------------------------------------------------------------
// List + detail
// ---------------------------------------------------------------------------------------------------------------------

export const SPACES_PAGE_SIZE = 50;
export const SPACE_STATE_FILTERS = ["active", "draft", "archived"] as const;
export type SpaceStateFilter = (typeof SPACE_STATE_FILTERS)[number];

export type SpaceListRow = {
  id: string; name: string; productType: string; status: string; createdAt: string; archivedAt: string | null;
  publishedAt: string | null; editsPending: boolean;
  /** space_subscriptions.status, null = legacy (no row); "unavailable" when the billing tables are absent or failed. */
  billingStatus: string | null | "unavailable";
};

export type SpaceList = { rows: SpaceListRow[]; total: MetricState; page: number; pageSize: number };

type TenantListRow = {
  id: string; name: string; product_type: string; status: string; created_at: string; archived_at: string | null; content_updated_at: string;
  published_spaces: { published_at: string } | { published_at: string }[] | null;
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export async function listSpaces(db: SupabaseClient, f: { page?: number; type?: string; state?: SpaceStateFilter }, now: Date = new Date()): Promise<SpaceList> {
  const page = Math.max(1, Math.floor(f.page ?? 1));
  const from = (page - 1) * SPACES_PAGE_SIZE;
  let q = db.from("tenants").select("id, name, product_type, status, created_at, archived_at, content_updated_at, published_spaces(published_at)", COUNT);
  if (f.type && (KNOWN_SPACE_TYPES as readonly string[]).includes(f.type)) q = q.eq("product_type", f.type);
  if (f.state === "active") q = q.neq("status", "archived").is("archived_at", null);
  else if (f.state === "archived") q = q.or("status.eq.archived,archived_at.not.is.null");
  else if (f.state === "draft") q = q.in("status", ["draft", "ready_to_publish"]).is("archived_at", null);
  const { data, error, count } = await q.order("created_at", { ascending: false }).order("id").range(from, from + SPACES_PAGE_SIZE - 1);
  if (error) return { rows: [], total: errorState(SRC_CORE, error.message.slice(0, 200)), page, pageSize: SPACES_PAGE_SIZE };
  const tenants = (data ?? []) as unknown as TenantListRow[];
  const ids = tenants.map((t) => t.id);
  const billing = new Map<string, string>();
  let billingOk = true;
  if (ids.length) {
    // At most one page of ids (SPACES_PAGE_SIZE), so this read is complete by construction.
    const { data: subs, error: subErr } = await db.from("space_subscriptions").select("tenant_id, status").in("tenant_id", ids);
    if (subErr) billingOk = false;
    for (const s of (subs ?? []) as { tenant_id: string; status: string }[]) billing.set(s.tenant_id, s.status);
  }
  const rows = tenants.map((t): SpaceListRow => {
    const pub = one(t.published_spaces);
    return {
      id: t.id, name: t.name, productType: t.product_type, status: t.status, createdAt: t.created_at, archivedAt: t.archived_at,
      publishedAt: pub?.published_at ?? null,
      editsPending: !!pub && Date.parse(t.content_updated_at) > Date.parse(pub.published_at),
      billingStatus: billingOk ? billing.get(t.id) ?? null : "unavailable",
    };
  });
  return { rows, total: ok(count, { asOf: now, source: SRC_CORE }), page, pageSize: SPACES_PAGE_SIZE };
}

export type SpaceDetail = {
  id: string; name: string; productType: string; status: string; slug: string | null; timezone: string;
  createdAt: string; contentUpdatedAt: string; archivedAt: string | null;
  publishedAt: string | null; publishedSlug: string | null; editsPending: boolean;
  subscription: { state: "none" } | { state: "unavailable" } | {
    state: "present"; id: string; status: string; currency: string | null; baseAmountMinor: number | null;
    currentEffectiveAmountMinor: number | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean;
    paymentFailedAt: string | null; exemptReason: string | null;
  };
  members: Record<"owner" | "practitioner" | "client", MetricState>;
  contentItems: MetricState;
  /** user ids of the Space's owners (tenant_members role owner). Resolved to emails only after an audited view. */
  ownerUserIds: string[];
  ownerIdsTruncated: boolean;
};

export async function getSpaceDetail(db: SupabaseClient, id: string, now: Date = new Date()): Promise<SpaceDetail | null> {
  const { data: t, error } = await db.from("tenants")
    .select("id, name, product_type, status, slug, timezone, created_at, content_updated_at, archived_at").eq("id", id).maybeSingle();
  if (error) throw new Error(`space detail failed: ${error.message}`);
  if (!t) return null;
  const meta = { source: "supabase_sql:tenant_members", asOf: now };
  const [pub, sub, owner, practitioner, client, items, owners] = await Promise.all([
    db.from("published_spaces").select("published_at, slug").eq("tenant_id", id).maybeSingle(),
    db.from("space_subscriptions")
      .select("id, status, currency, base_amount_minor, current_effective_amount_minor, current_period_end, cancel_at_period_end, payment_failed_at, exempt_reason")
      .eq("tenant_id", id).maybeSingle(),
    exactCount(db.from("tenant_members").select("user_id", COUNT).eq("tenant_id", id).eq("role", "owner"), meta),
    exactCount(db.from("tenant_members").select("user_id", COUNT).eq("tenant_id", id).eq("role", "practitioner"), meta),
    exactCount(db.from("tenant_members").select("user_id", COUNT).eq("tenant_id", id).eq("role", "client"), meta),
    exactCount(db.from("module_items").select("id", COUNT).eq("tenant_id", id), { source: "supabase_sql:module_items", asOf: now }),
    fetchAllPaged((from, to) => db.from("tenant_members").select("user_id").eq("tenant_id", id).eq("role", "owner").order("user_id").range(from, to), { max: 20, pageSize: 20 }),
  ]);
  if (pub.error) throw new Error(`space detail (published) failed: ${pub.error.message}`);
  const s = sub.data as null | {
    id: string; status: string; currency: string | null; base_amount_minor: number | null; current_effective_amount_minor: number | null;
    current_period_end: string | null; cancel_at_period_end: boolean; payment_failed_at: string | null; exempt_reason: string | null;
  };
  const tenant = t as { id: string; name: string; product_type: string; status: string; slug: string | null; timezone: string; created_at: string; content_updated_at: string; archived_at: string | null };
  const p = pub.data as { published_at: string; slug: string | null } | null;
  return {
    id: tenant.id, name: tenant.name, productType: tenant.product_type, status: tenant.status, slug: tenant.slug, timezone: tenant.timezone,
    createdAt: tenant.created_at, contentUpdatedAt: tenant.content_updated_at, archivedAt: tenant.archived_at,
    publishedAt: p?.published_at ?? null, publishedSlug: p?.slug ?? null,
    editsPending: !!p && Date.parse(tenant.content_updated_at) > Date.parse(p.published_at),
    subscription: sub.error ? { state: "unavailable" } : !s ? { state: "none" } : {
      state: "present", id: s.id, status: s.status, currency: s.currency, baseAmountMinor: s.base_amount_minor,
      currentEffectiveAmountMinor: s.current_effective_amount_minor, currentPeriodEnd: s.current_period_end,
      cancelAtPeriodEnd: s.cancel_at_period_end, paymentFailedAt: s.payment_failed_at, exemptReason: s.exempt_reason,
    },
    members: { owner, practitioner, client },
    contentItems: items,
    ownerUserIds: (owners.rows as { user_id: string }[]).map((r) => r.user_id),
    ownerIdsTruncated: owners.truncated,
  };
}
