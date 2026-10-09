import { describe, expect, it } from "vitest";
import { PRODUCTION_REF, STAGING_REF, STAGING_URL, assertStagingTarget, runScopedDelete } from "./stagingGuard.mjs";

const jwt = (claims: Record<string, unknown>) => {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.sig`;
};
const stagingKey = jwt({ ref: STAGING_REF, role: "service_role" });

describe("assertStagingTarget fails closed", () => {
  it("accepts exactly the Staging URL with a Staging service-role JWT (trailing slash tolerated)", () => {
    expect(assertStagingTarget({ url: STAGING_URL, serviceKey: stagingKey, env: {} })).toEqual({ ref: STAGING_REF });
    expect(assertStagingTarget({ url: `${STAGING_URL}/`, serviceKey: stagingKey, env: {} }).ref).toBe(STAGING_REF);
  });
  it("refuses the PRODUCTION url, whatever the key", () => {
    expect(() => assertStagingTarget({ url: `https://${PRODUCTION_REF}.supabase.co`, serviceKey: stagingKey, env: {} })).toThrow(/PRODUCTION/);
    expect(() => assertStagingTarget({ url: `https://${PRODUCTION_REF}.supabase.co`, serviceKey: jwt({ ref: PRODUCTION_REF, role: "service_role" }), env: {} })).toThrow();
  });
  it("refuses a Production key even with the Staging URL (the two must agree)", () => {
    expect(() => assertStagingTarget({ url: STAGING_URL, serviceKey: jwt({ ref: PRODUCTION_REF, role: "service_role" }), env: {} })).toThrow(/PRODUCTION/);
  });
  it("refuses look-alike URLs (suffix/prefix tricks, http, other hosts)", () => {
    for (const url of [`${STAGING_URL}.evil.example`, `https://evil.example/${STAGING_REF}`, `http://${STAGING_REF}.supabase.co`, `https://x${STAGING_REF}.supabase.co`, "", undefined]) {
      expect(() => assertStagingTarget({ url: url as string, serviceKey: stagingKey, env: {} })).toThrow(/STAGING GUARD/);
    }
  });
  it("refuses keys that cannot PROVE their project (non-JWT, malformed, wrong project, not service-role)", () => {
    for (const key of ["sb_secret_abcdef", "", undefined, "a.b.c", "not-a-jwt", jwt({ ref: "someotherproject", role: "service_role" }), jwt({ ref: STAGING_REF, role: "anon" }), jwt({ role: "service_role" })]) {
      expect(() => assertStagingTarget({ url: STAGING_URL, serviceKey: key as string, env: {} })).toThrow(/STAGING GUARD/);
    }
  });
  it("refuses to run in a production Node/Vercel environment", () => {
    expect(() => assertStagingTarget({ url: STAGING_URL, serviceKey: stagingKey, env: { NODE_ENV: "production" } })).toThrow(/production/);
    expect(() => assertStagingTarget({ url: STAGING_URL, serviceKey: stagingKey, env: { VERCEL_ENV: "production" } })).toThrow(/production/);
  });
  it("never echoes the key in its error", () => {
    try { assertStagingTarget({ url: STAGING_URL, serviceKey: jwt({ ref: PRODUCTION_REF, role: "service_role" }), env: {} }); } catch (e) { expect(String(e)).not.toContain("eyJ"); expect(String(e)).not.toContain("sig"); }
  });
});

/** A tiny in-memory PostgREST-shaped client: enough to prove the cleanup's count rules. */
function fakeClient(rows: { id: string }[]) {
  const store = [...rows];
  const deleted: string[] = [];
  return {
    deleted,
    from: () => ({
      select: (_c: string, o?: { head?: boolean }) => ({ in: async (_col: string, ids: string[]) => ({ count: store.filter((r) => ids.includes(r.id)).length, error: null, data: o?.head ? null : [] }) }),
      delete: () => ({ in: (_col: string, ids: string[]) => ({ select: async () => { const gone = store.filter((r) => ids.includes(r.id)); for (const g of gone) { store.splice(store.indexOf(g), 1); deleted.push(g.id); } return { data: gone, error: null }; } }) }),
    }),
  };
}

describe("runScopedDelete", () => {
  it("deletes exactly the rows this run created, and only those", async () => {
    const c = fakeClient([{ id: "a" }, { id: "b" }, { id: "other-customer-row" }]);
    expect(await runScopedDelete(c, { table: "t", ids: ["a", "b"] })).toBe(2);
    expect(c.deleted.sort()).toEqual(["a", "b"]);
  });
  it("is a no-op for an empty id list (never an unscoped delete)", async () => {
    const c = fakeClient([{ id: "x" }]);
    expect(await runScopedDelete(c, { table: "t", ids: [] })).toBe(0);
    expect(c.deleted).toEqual([]);
  });
  it("ABORTS (deletes nothing) when the expected row count differs", async () => {
    const c = fakeClient([{ id: "a" }]);
    await expect(runScopedDelete(c, { table: "t", ids: ["a", "b"], expected: 2 })).rejects.toThrow(/ABORTED.*expected 2 rows, found 1/);
    expect(c.deleted).toEqual([]);
  });
  it("ABORTS when more rows match than the run could have created", async () => {
    const lying = { from: () => ({ select: () => ({ in: async () => ({ count: 5, error: null }) }), delete: () => ({ in: () => ({ select: async () => ({ data: [], error: null }) }) }) }) };
    await expect(runScopedDelete(lying, { table: "t", ids: ["a", "b"] })).rejects.toThrow(/ABORTED.*only 2 were created/);
  });
});
