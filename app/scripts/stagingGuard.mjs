/**
 * Single source of truth for "this script may write to Staging, and ONLY Staging".
 * Imported by scripts/billing-db-verify.mjs and the Staging integration test. It FAILS CLOSED:
 * anything unexpected (wrong URL, the Production ref, a key that is not a service-role JWT for
 * the Staging project, a production Node environment) throws before a single write happens.
 *
 * It never prints or returns the key.
 */
export const STAGING_REF = "kkqjsspxupyxytddiumf";
export const PRODUCTION_REF = "qzmsclkzbxrfohuxnitc";
export const STAGING_URL = `https://${STAGING_REF}.supabase.co`;

function jwtPayload(token) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/** Throws unless url+key unambiguously identify the Staging project. */
export function assertStagingTarget({ url, serviceKey, env = process.env }) {
  const fail = (why) => {
    throw new Error(`STAGING GUARD (fail closed): ${why}. Nothing was written.`);
  };
  if (env.NODE_ENV === "production") fail("NODE_ENV is production");
  if (env.VERCEL_ENV === "production") fail("VERCEL_ENV is production");
  const normalised = String(url ?? "").replace(/\/+$/, "");
  if (normalised.includes(PRODUCTION_REF)) fail("the URL names the PRODUCTION project");
  if (normalised !== STAGING_URL) fail("the URL is not exactly the Staging project URL");
  const claims = jwtPayload(serviceKey);
  if (!claims) fail("the key is not a verifiable legacy JWT (cannot prove which project it belongs to)");
  if (claims.ref === PRODUCTION_REF) fail("the key belongs to the PRODUCTION project");
  if (claims.ref !== STAGING_REF) fail("the key does not belong to the Staging project");
  if (claims.role !== "service_role") fail("the key is not a service-role key");
  return { ref: STAGING_REF };
}

/**
 * Run-scoped cleanup: delete ONLY rows the caller proves it created in THIS run.
 *   - `ids` are the exact primary keys recorded when the rows were created (never a prefix scan);
 *   - the count of existing rows for those ids is read FIRST and must not exceed the number created
 *     (and must equal it when `expected` is given) - otherwise cleanup ABORTS and deletes nothing;
 *   - after deletion the number removed must equal the number counted.
 * Returns the number deleted. Throws (leaving everything in place) on any mismatch.
 */
export async function runScopedDelete(client, { table, column = "id", ids, expected = null }) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return 0;
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true }).in(column, unique);
  if (error) throw new Error(`cleanup count failed for ${table}: ${error.message}`);
  if (count > unique.length) throw new Error(`cleanup ABORTED for ${table}: ${count} rows match but only ${unique.length} were created by this run`);
  if (expected != null && count !== expected) throw new Error(`cleanup ABORTED for ${table}: expected ${expected} rows, found ${count}`);
  if (count === 0) return 0;
  const { data, error: delErr } = await client.from(table).delete().in(column, unique).select(column);
  if (delErr) throw new Error(`cleanup delete failed for ${table}: ${delErr.message}`);
  if ((data ?? []).length !== count) throw new Error(`cleanup MISMATCH for ${table}: counted ${count}, deleted ${(data ?? []).length}`);
  return count;
}
