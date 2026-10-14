import { errorState, noSource, ok, type MetricState } from "../contracts/metric";

/**
 * Exact counts for the Admin console, mapped onto the metric contract.
 *
 * Every count is `select(<col>, { count: "exact" })` + `.limit(0)`: PostgREST computes the exact count in the
 * database and transfers no rows, so there is no row cap that could truncate it. (A HEAD count is NOT used here: for
 * a table PostgREST does not know it answers 204 with neither a count nor an error, which would read as 0. A GET
 * answers 404/PGRST205, which we can classify.)
 *
 *   count is a number            -> ok (a real 0 is allowed here, after a successful read)
 *   table/relation not present   -> no_source (e.g. Production before the TASK 032 billing migrations, P-2)
 *   any other error / no count   -> error  (rendered "Could not load", never 0)
 */
export type CountResult = { count: number | null; error: { code?: string; message: string } | null };

/** PostgREST "table not in the schema cache" and Postgres "undefined table". */
const MISSING_RELATION = new Set(["PGRST205", "42P01", "PGRST200"]);

export function countToMetric(r: CountResult, meta: { source: string; asOf: Date; missingReason?: string }): MetricState {
  if (r.error) {
    if (r.error.code && MISSING_RELATION.has(r.error.code)) return noSource(meta.missingReason ?? "table_missing");
    return errorState(meta.source, r.error.message?.slice(0, 200));
  }
  return ok(r.count, { asOf: meta.asOf, source: meta.source });
}

type LimitableCount = { limit(n: number): PromiseLike<CountResult> };

/** Runs a count query (already `.select(..., { count: "exact" })` + filters) without transferring rows. */
export async function exactCount(q: LimitableCount, meta: { source: string; asOf: Date; missingReason?: string }): Promise<MetricState> {
  try {
    return countToMetric(await q.limit(0), meta);
  } catch (e) {
    return errorState(meta.source, e instanceof Error ? e.message.slice(0, 200) : undefined);
  }
}

export const COUNT = { count: "exact" } as const;
