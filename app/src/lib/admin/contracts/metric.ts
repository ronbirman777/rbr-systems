/**
 * Metric contract (docs/admin/ADMIN-METRIC-CONTRACTS.md §1, §4): every number the Admin console shows is a
 * MetricState, and only the `ok` / `stale` / `truncated` states carry a number. Missing is never zero:
 * a null, an absent field, a thrown read or an unconnected source becomes `error` / `no_source` /
 * `not_measured`, never `{ state: "ok", value: 0 }`.
 *
 * Pure module (no I/O, no server imports): shared by queries, pages and tests.
 */

export type Quality = "actual" | "estimated" | "manual";
export type Unit = "count" | "bytes" | "minutes" | "hours" | "percent" | { minor: string /* ISO 4217 */ };

export type MetricSource =
  | "supabase_sql" | "billing_synced" | "watchdog_kv" | "manual" | "derived" | "evidence_register" | `provider_api:${string}`;

type Valued = { value: number; asOf: string; quality: Quality; unit: Unit };

export type MetricState =
  | ({ state: "ok" } & Valued)
  | ({ state: "stale"; staleSince: string } & Valued)
  | ({ state: "truncated"; bound: number } & Valued)
  | { state: "no_source"; reason: string }
  | { state: "not_measured"; reason: string }
  | { state: "not_applicable"; reason: string }
  | { state: "error"; source: string; detail?: string };

export type MetricStateName = MetricState["state"];

/** Money is ALWAYS per currency. There is no cross-currency number anywhere in this module. */
export type MoneyMetric = Record<string, MetricState>;

/** The explicit bucket for amounts whose currency is null/blank: never assumed to be USD (contracts §1.3). */
export const UNKNOWN_CURRENCY = "unknown";

export type MetricDefinition = {
  key: string;
  section: "overview" | "spaces" | "billing" | "usage" | "infrastructure" | "backups" | "alerts" | "costs" | "integrations";
  definition: string;
  source: MetricSource;
  freshness: "live" | "snapshot";
  quality: Quality;
  unit: Unit;
  privacy: "aggregate_only" | "owner_pii_detail" | "none";
  status: "AVAILABLE NOW" | "PARTIALLY IMPLEMENTED" | "PLANNED" | "REQUIRES RESEARCH";
};

// ---------------------------------------------------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------------------------------------------------

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * A successful read. Anything that is not a finite number (null, undefined, NaN, a string) is an ERROR for that
 * source - this is the single place a value becomes renderable, so a nullish fallback to zero can never sneak in.
 */
export function ok(value: unknown, meta: { asOf: Date | string; quality?: Quality; unit?: Unit; source: string }): MetricState {
  if (!isFiniteNumber(value)) return { state: "error", source: meta.source, detail: "no value returned" };
  return { state: "ok", value, asOf: toIso(meta.asOf), quality: meta.quality ?? "actual", unit: meta.unit ?? "count" };
}

export const noSource = (reason: string): MetricState => ({ state: "no_source", reason });
export const notMeasured = (reason: string): MetricState => ({ state: "not_measured", reason });
export const notApplicable = (reason: string): MetricState => ({ state: "not_applicable", reason });
export const errorState = (source: string, detail?: string): MetricState => ({ state: "error", source, ...(detail ? { detail } : {}) });

/** A bounded row read: the value is a lower bound when the read hit its bound. */
export function fromBoundedRead(value: number, truncated: boolean, bound: number, meta: { asOf: Date | string; quality?: Quality; unit?: Unit; source: string }): MetricState {
  const base = ok(value, meta);
  if (base.state !== "ok" || !truncated) return base;
  return { ...base, state: "truncated", bound };
}

/** Marks a value older than maxAgeMs as stale. Non-valued states pass through unchanged. */
export function withFreshness(m: MetricState, now: Date, maxAgeMs: number): MetricState {
  if (m.state !== "ok") return m;
  const age = now.getTime() - Date.parse(m.asOf);
  if (!(age <= maxAgeMs)) return { ...m, state: "stale", staleSince: new Date(Date.parse(m.asOf) + maxAgeMs).toISOString() };
  return m;
}

/** Runs a read; a throw becomes `error` for that source (never 0, never an unhandled page crash for one tile). */
export async function settle(source: string, read: () => Promise<MetricState>): Promise<MetricState> {
  try {
    return await read();
  } catch (e) {
    return errorState(source, e instanceof Error ? e.message.slice(0, 200) : undefined);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------------------------------------------------

export function hasValue(m: MetricState): m is Extract<MetricState, { value: number }> {
  return m.state === "ok" || m.state === "stale" || m.state === "truncated";
}

/** The number to render, or null when there is none (the caller then renders the state's message, not 0). */
export function valueOf(m: MetricState): number | null {
  return hasValue(m) ? m.value : null;
}

/**
 * Health verdict (contracts §1.2 rule 3): green needs EVERY input to be a fresh `ok`. `stale`, `error`,
 * `no_source`, `not_measured` and `truncated` produce `unknown` (grey), never `healthy`.
 * `not_applicable` inputs are ignored (they are defined only under a condition that does not hold).
 */
export function healthOf(inputs: MetricState[]): "healthy" | "unknown" {
  const relevant = inputs.filter((m) => m.state !== "not_applicable");
  if (!relevant.length) return "unknown";
  return relevant.every((m) => m.state === "ok") ? "healthy" : "unknown";
}

/**
 * Aggregate over several sources (contracts §1.2 rule 2): the total is labelled partial and lists what is missing
 * whenever any component has no value. Never adds across currencies: callers aggregate one currency at a time.
 */
export function partialSum(parts: { label: string; metric: MetricState }[]): { total: number | null; partial: boolean; missing: string[] } {
  const missing = parts.filter((p) => !hasValue(p.metric)).map((p) => p.label);
  const values = parts.map((p) => valueOf(p.metric)).filter((v): v is number => v != null);
  return { total: values.length ? values.reduce((a, b) => a + b, 0) : null, partial: missing.length > 0, missing };
}

/** Normalises a currency code for bucketing; null/blank/non-ISO-shaped land in UNKNOWN_CURRENCY. */
export function currencyBucket(currency: string | null | undefined): string {
  const c = (currency ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : UNKNOWN_CURRENCY;
}

/**
 * Per-currency sums of minor-unit amounts. A row with a null amount is not 0: it marks that currency `error`
 * ("amount missing") so the figure is never silently understated. A null currency goes to UNKNOWN_CURRENCY.
 */
export function moneyByCurrency(rows: { currency: string | null | undefined; amountMinor: number | null | undefined }[], meta: { asOf: Date | string; source: string }): MoneyMetric {
  const sums = new Map<string, number>();
  const broken = new Set<string>();
  for (const r of rows) {
    const cur = currencyBucket(r.currency);
    if (!isFiniteNumber(r.amountMinor)) { broken.add(cur); continue; }
    const prev = sums.get(cur);
    sums.set(cur, prev === undefined ? r.amountMinor : prev + r.amountMinor);
  }
  const out: MoneyMetric = {};
  for (const cur of new Set([...sums.keys(), ...broken])) {
    out[cur] = broken.has(cur)
      ? errorState(meta.source, "amount missing on at least one row")
      : ok(sums.get(cur), { asOf: meta.asOf, unit: { minor: cur }, source: meta.source });
  }
  return out;
}

function toIso(d: Date | string): string {
  return typeof d === "string" ? new Date(d).toISOString() : d.toISOString();
}
