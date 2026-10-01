import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import * as engine from "./legacyMigration";
import { deterministicUploadId } from "./legacyMigration";
import { makeMigrationFake, type MigrationFake } from "./migrationFake.test-util";
import { SCOPE_SCHEMA, ScopeViolation, destinationFor, parseScope, planVsScope, runScopedTenant, scopeUploadId, type Engine } from "./migrationScope";

const T = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const DIGEST = "58733df75aee7a8ae47028541a62ff1d1ff49ff24481ce0b051c331f663bcb56";
const PREFIX = "migrations/task-027/2026-10-01/36833956781-1";
const T0 = "2026-01-01T00:00:00.000Z";
const PUBLISHED_AT = "2026-01-02T00:00:00.000Z";
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

type A = { asset: string; mk: string; item: string; pair: boolean; body: string };
const ASSETS: A[] = [
  { asset: "a01", mk: "meals", item: "item-1", pair: true, body: "meal-bytes" },
  { asset: "a02", mk: "brand", item: "hero", pair: false, body: "hero-bytes" },
  { asset: "a03", mk: "arrivalInfo", item: "_cover", pair: false, body: "cover-bytes" },
];
const legacy = (t: string, a: A, role: "draft" | "published") => `${t}/${a.mk}/${a.item}/${role}.webp`;

function seed(f: MigrationFake, assets: A[] = ASSETS, tenant = T) {
  if (!f.tables.tenants.some((r) => r.id === tenant)) f.tables.tenants.push({ id: tenant, content_updated_at: T0 });
  const modules: Record<string, unknown> = {};
  for (const a of assets) {
    f.put(legacy(tenant, a, "draft"), a.body);
    if (a.pair) f.put(legacy(tenant, a, "published"), a.body);
    const ref = legacy(tenant, a, "draft");
    if (a.item === "_cover") f.tables.module_configs.push({ tenant_id: tenant, module_key: a.mk, image_ref: ref });
    else if (a.mk === "brand") {
      const row = f.tables.brand_configs.find((r) => r.tenant_id === tenant) ?? (f.tables.brand_configs.push({ tenant_id: tenant }), f.tables.brand_configs[f.tables.brand_configs.length - 1]);
      row[`${a.item}_image_ref`] = ref;
    } else {
      f.tables.module_items.push({ id: a.item, tenant_id: tenant, module_key: a.mk, image_ref: ref });
      if (a.pair) modules[a.mk] = [{ name: "x", imageRef: legacy(tenant, a, "published") }];
    }
  }
  f.tables.published_spaces.push({ tenant_id: tenant, published_at: PUBLISHED_AT, modules });
}

function scopeDoc(assets: A[] = ASSETS, tenant = T, over: Record<string, unknown> = {}) {
  return {
    schema: SCOPE_SCHEMA,
    task_id: "TASK-027",
    approved_manifest_sha256: DIGEST,
    recovery_manifest_sha256: "c".repeat(64),
    snapshot_prefix: PREFIX,
    snapshot_run_id: "36833956781",
    snapshot_attempt: "1",
    snapshot_infra_commit_sha: "a".repeat(40),
    gate_commit_sha: "b".repeat(40),
    gate_run_id: "123",
    gate_run_attempt: "1",
    tenant_id: tenant,
    assets: assets.map((a) => {
      const dKey = legacy(tenant, a, "draft");
      const h = sha(a.body);
      const obj = (role: "draft" | "published") => ({ role, source_key: legacy(tenant, a, role), destination_key: destinationFor(tenant, dKey, h, role), size: a.body.length, sha256: h });
      return { asset: a.asset, objects: a.pair ? [obj("draft"), obj("published")] : [obj("draft")] };
    }),
    ...over,
  };
}
type Doc = ReturnType<typeof scopeDoc>;
const rawOf = (d: unknown) => Buffer.from(JSON.stringify(d));
const parse = (d: unknown, over: Partial<Parameters<typeof parseScope>[1]> = {}) => {
  const raw = rawOf(d);
  return parseScope(raw, { scopeSha256: sha(raw), manifestSha256: DIGEST, tenantId: T, ...over });
};
const mutate = (fn: (d: Doc) => void, tenant = T, assets = ASSETS): Doc => {
  const d = JSON.parse(JSON.stringify(scopeDoc(assets, tenant)));
  fn(d);
  return d;
};

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof ScopeViolation) return e.code;
    throw e;
  }
  return "no-violation";
}
async function violation(p: Promise<unknown>): Promise<ScopeViolation> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ScopeViolation) return e;
    throw e;
  }
  throw new Error("expected a ScopeViolation");
}
const writes = (f: MigrationFake) => f.log.filter((l) => /^(upload|update|remove)/.test(l));
const run = (f: MigrationFake, mode: "dry-run" | "apply", doc: unknown = scopeDoc(), eng: Engine = engine, tenant = T) =>
  runScopedTenant(f.client, parse(doc, { tenantId: tenant }), mode, eng);
const draftRef = (f: MigrationFake) => f.tables.module_items[0].image_ref as string;

function world(): MigrationFake {
  const f = makeMigrationFake();
  seed(f);
  return f;
}

describe("scope parsing (anti-widening, fail closed)", () => {
  it("accepts a well-formed tenant scope", () => {
    const s = parse(scopeDoc());
    expect(s.tenant_id).toBe(T);
    expect(s.assets).toHaveLength(3);
  });
  it("shares the deterministic upload id with legacyMigration (pinned vectors)", () => {
    const vectors: [string, string, string, string][] = [
      [T, `${T}/meals/item-1/draft.webp`, sha("meal-bytes"), "838a1ae2-eebd-41e9-8193-bf8ee5c3d2a3"],
      [T2, `${T2}/brand/hero/draft.jpg`, "0".repeat(64), "3830b2e8-bb2c-4d66-8449-8eada53b0e75"],
      ["aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/arrivalInfo/_cover/draft.png", "f".repeat(64), "5d6162c9-1137-4084-97f5-ed3159c5ba11"],
    ];
    for (const [t, p, h, id] of vectors) {
      expect(scopeUploadId(t, p, h)).toBe(id);
      expect(deterministicUploadId(t, p, h)).toBe(id);
    }
  });
  it("wrong scope sha256 (raw bytes are what is hashed)", () => {
    const raw = rawOf(scopeDoc());
    expect(codeOf(() => parseScope(raw, { scopeSha256: sha("other"), manifestSha256: DIGEST, tenantId: T }))).toBe("scope-sha256-mismatch");
    const reformatted = Buffer.from(JSON.stringify(scopeDoc(), null, 2));
    expect(codeOf(() => parseScope(reformatted, { scopeSha256: sha(raw), manifestSha256: DIGEST, tenantId: T }))).toBe("scope-sha256-mismatch");
  });
  it("wrong digest", () => {
    expect(codeOf(() => parse(scopeDoc(), { manifestSha256: "9".repeat(64) }))).toBe("scope-wrong-manifest-digest");
    expect(codeOf(() => parse(mutate((d) => (d.approved_manifest_sha256 = "9".repeat(64)))))).toBe("scope-wrong-manifest-digest");
  });
  it("wrong tenant", () => {
    expect(codeOf(() => parse(scopeDoc(), { tenantId: T2 }))).toBe("scope-wrong-tenant");
    expect(codeOf(() => parse(scopeDoc(ASSETS, T2), { tenantId: T }))).toBe("scope-wrong-tenant");
    expect(codeOf(() => parse(mutate((d) => (d.assets[0].objects[0].source_key = d.assets[0].objects[0].source_key.replace(T, T2)))))).toBe("scope-unexpected-source-key");
  });
  it("wrong snapshot", () => {
    expect(codeOf(() => parse(scopeDoc(), { snapshotPrefix: "migrations/task-027/2026-10-01/1-1" }))).toBe("scope-wrong-snapshot");
    expect(codeOf(() => parse(mutate((d) => (d.snapshot_run_id = "7"))))).toBe("scope-snapshot-run");
    expect(codeOf(() => parse(mutate((d) => (d.snapshot_prefix = "elsewhere/1-1"))))).toBe("scope-snapshot-prefix");
  });
  it("wrong deterministic destination", () => {
    expect(codeOf(() => parse(mutate((d) => (d.assets[0].objects[0].destination_key = d.assets[0].objects[0].source_key))))).toBe("scope-wrong-destination");
    expect(codeOf(() => parse(mutate((d) => (d.assets[0].objects[1].destination_key = d.assets[0].objects[0].destination_key))))).toBe("scope-duplicate-record");
  });
  it("duplicate records, unexpected keys, bad sizes and shas", () => {
    expect(codeOf(() => parse(mutate((d) => d.assets.push({ ...d.assets[1], asset: "a09" }))))).toBe("scope-duplicate-record");
    expect(codeOf(() => parse(mutate((d) => d.assets.push({ ...d.assets[1] }))))).toBe("scope-asset-id");
    expect(codeOf(() => parse(mutate((d) => (d.assets[1].objects[0].source_key = `${T}/brand/hero/extra/draft.webp`))))).toBe("scope-unexpected-source-key");
    expect(codeOf(() => parse(mutate((d) => (d.assets[1].objects[0].source_key = `${T}/brand/hero/published.webp`))))).toBe("scope-unexpected-source-key");
    expect(codeOf(() => parse(mutate((d) => (d.assets[1].objects[0].size = 0))))).toBe("scope-object-size");
    expect(codeOf(() => parse(mutate((d) => (d.assets[1].objects[0].sha256 = "A".repeat(64)))))).toBe("scope-object-sha");
    expect(codeOf(() => parse(mutate((d) => ((d.assets[0].objects[1] as { size: number }).size += 1))))).toBe("scope-asset-pair-mismatch");
    expect(codeOf(() => parse(mutate((d) => ((d.assets[0].objects[1] as { sha256: string }).sha256 = "e".repeat(64)))))).toBe("scope-asset-pair-mismatch");
    expect(codeOf(() => parse(mutate((d) => ((d as Record<string, unknown>).extra = 1))))).toBe("scope-fields");
    expect(codeOf(() => parse(mutate((d) => ((d.assets[1].objects[0] as Record<string, unknown>).extra = 1))))).toBe("scope-object-fields");
    expect(codeOf(() => parse(mutate((d) => (d.assets = []))))).toBe("scope-assets");
    expect(codeOf(() => parse(mutate((d) => (d.assets[0].objects = [d.assets[0].objects[1]]))))).toBe("scope-asset-roles");
    expect(codeOf(() => parseScope(Buffer.from("not json"), { scopeSha256: sha("not json"), manifestSha256: DIGEST, tenantId: T }))).toBe("scope-malformed");
  });
});

describe("planning against the scope", () => {
  it("pending tenant: dry run verifies the scope and writes nothing", async () => {
    const f = world();
    const r = await run(f, "dry-run");
    expect(r).toMatchObject({ mode: "dry-run", scopeObjects: 4, pendingObjects: 4, alreadyDoneObjects: 0 });
    expect(writes(f)).toEqual([]);
    expect(f.files.size).toBe(4);
  });
  it("a live legacy asset outside the approved scope fails before any write", async () => {
    const f = world();
    f.put(`${T}/facilitators/item-9/draft.webp`, "stranger");
    f.tables.module_items.push({ id: "item-9", tenant_id: T, module_key: "facilitators", image_ref: `${T}/facilitators/item-9/draft.webp` });
    for (const mode of ["dry-run", "apply"] as const) {
      const v = await violation(run(f, mode));
      expect(v).toMatchObject({ code: "unexpected-asset", phase: "pre-write" });
    }
    expect(writes(f)).toEqual([]);
  });
  it("an unsnapshotted legacy published object is also out of scope", async () => {
    const f = world();
    f.put(`${T}/meals/item-2/published.webp`, "orphan-pub");
    (f.tables.published_spaces[0].modules as Record<string, { imageRef: string }[]>).meals.push({ imageRef: `${T}/meals/item-2/published.webp` });
    expect((await violation(run(f, "apply"))).code).toBe("unexpected-asset");
    expect(writes(f)).toEqual([]);
  });
  it("scope missing one live asset, wrong sha and a conflict all refuse before writes", async () => {
    let f = world();
    expect((await violation(run(f, "apply", scopeDoc(ASSETS.slice(0, 2))))).code).toBe("unexpected-asset");
    f = world();
    expect((await violation(run(f, "apply", scopeDoc([{ ...ASSETS[0], body: "different!!" }, ...ASSETS.slice(1)])))).code).toBe("size-mismatch");
    f = world();
    expect((await violation(run(f, "apply", scopeDoc([{ ...ASSETS[0], body: "meal-BYTES" }, ...ASSETS.slice(1)])))).code).toBe("sha-mismatch");
    f = world();
    f.put(legacy(T, ASSETS[0], "published"), "meal-DIFFER");
    expect((await violation(run(f, "apply"))).code).toBe("plan-conflict");
    expect(writes(f)).toEqual([]);
  });
  it("a scope entry that the live data does not contain and that is not migrated refuses", async () => {
    const f = world();
    const extra: A = { asset: "a04", mk: "treatments", item: "item-4", pair: false, body: "ghost-bytes" };
    expect((await violation(run(f, "apply", scopeDoc([...ASSETS, extra])))).code).toBe("destination-missing");
    expect(writes(f)).toEqual([]);
  });
  it("planVsScope rejects another tenant's plan", async () => {
    const f = world();
    const plan = await engine.planTenant(f.client, T);
    expect(codeOf(() => planVsScope({ ...plan, tenantId: T2 }, parse(scopeDoc())))).toBe("plan-wrong-tenant");
  });
  it("a plan destination that differs from the scope's deterministic one is refused", async () => {
    const f = world();
    const plan = await engine.planTenant(f.client, T);
    (plan.assets[0].draft as { new: string }).new = `${T}/meals/item-1/${scopeUploadId(T, "x", "y")}/draft.webp`;
    expect(codeOf(() => planVsScope(plan, parse(scopeDoc())))).toBe("destination-mismatch");
  });
});

describe("applying a scoped tenant", () => {
  it("migrates every approved object, verifies destinations, and keeps the legacy sources", async () => {
    const f = world();
    const r = await run(f, "apply");
    expect(r.statuses).toEqual({ migrated: 3 });
    expect(r.alreadyDoneObjects).toBe(0);
    const d = scopeDoc();
    for (const a of d.assets) for (const o of a.objects) {
      expect(f.text(o.destination_key)).toBe(ASSETS.find((x) => x.asset === a.asset)?.body);
      expect(f.files.has(o.source_key)).toBe(true);
    }
    expect(draftRef(f)).toBe(d.assets[0].objects[0].destination_key);
    expect(f.tables.brand_configs[0].hero_image_ref).toBe(d.assets[1].objects[0].destination_key);
    expect(f.tables.module_configs[0].image_ref).toBe(d.assets[2].objects[0].destination_key);
    expect(JSON.stringify(f.tables.published_spaces[0].modules)).toContain(d.assets[0].objects[1].destination_key);
    expect(writes(f).some((l) => l.startsWith("remove"))).toBe(false);
  });
  it("rerun after success: every object is strictly verified already-done and nothing is written", async () => {
    const f = world();
    await run(f, "apply");
    const before = f.log.length;
    const r = await run(f, "apply");
    expect(r).toMatchObject({ pendingObjects: 0, alreadyDoneObjects: 4, statuses: {} });
    expect(f.log.length).toBe(before);
  });
  it("rerun after one tenant migrated recognises only strictly verified already-done state", async () => {
    const f = world();
    seed(f, ASSETS, T2);
    await run(f, "apply");
    expect(await run(f, "dry-run")).toMatchObject({ pendingObjects: 0, alreadyDoneObjects: 4 });
    const other = await run(f, "dry-run", scopeDoc(ASSETS, T2), engine, T2);
    expect(other).toMatchObject({ pendingObjects: 4, alreadyDoneObjects: 0 });
    f.files.get(scopeDoc().assets[1].objects[0].destination_key)!.bytes = Buffer.from("tampered!!");
    expect((await violation(run(f, "dry-run"))).code).toBe("destination-sha-mismatch");
    expect(await run(f, "dry-run", scopeDoc(ASSETS, T2), engine, T2)).toMatchObject({ pendingObjects: 4 });
  });
  it("absent from the plan with the exact migrated state is already-done (draft slot and snapshot slot)", async () => {
    const f = world();
    await run(f, "apply");
    const r = await run(f, "dry-run");
    expect(r.alreadyDoneObjects).toBe(4);
  });
  it("absent from the plan but only the legacy source exists: fails", async () => {
    const f = world();
    f.tables.brand_configs[0].hero_image_ref = null;
    const v = await violation(run(f, "apply"));
    expect(v).toMatchObject({ code: "destination-missing", phase: "pre-write" });
    expect(writes(f)).toEqual([]);
    expect(f.files.has(legacy(T, ASSETS[1], "draft"))).toBe(true);
  });
  it("legacy source still referenced and destination bytes present but ref never moved is pending, not done", async () => {
    const f = world();
    const o = scopeDoc().assets[1].objects[0];
    f.put(o.destination_key, ASSETS[1].body);
    const r = await run(f, "dry-run");
    expect(r.pendingObjects).toBe(4);
    expect(r.alreadyDoneObjects).toBe(0);
  });
  it("absent from the plan with a wrong destination ref fails", async () => {
    const f = world();
    await run(f, "apply");
    const wrong = `${T}/meals/item-1/${scopeUploadId(T, "other", "other")}/draft.webp`;
    f.put(wrong, ASSETS[0].body);
    f.tables.module_items[0].image_ref = wrong;
    expect((await violation(run(f, "apply"))).code).toBe("draft-ref-not-at-destination");
  });
  it("destination bytes mismatch (content or size) fails", async () => {
    let f = world();
    await run(f, "apply");
    const dest = scopeDoc().assets[2].objects[0].destination_key;
    f.files.get(dest)!.bytes = Buffer.from("cover-BYTES");
    expect((await violation(run(f, "apply"))).code).toBe("destination-sha-mismatch");
    f = world();
    await run(f, "apply");
    f.files.get(dest)!.bytes = Buffer.from("short");
    expect((await violation(run(f, "apply"))).code).toBe("destination-size-mismatch");
  });
  it("a missing destination object (unresolved expected ref) fails", async () => {
    const f = world();
    await run(f, "apply");
    f.files.delete(scopeDoc().assets[0].objects[1].destination_key);
    expect((await violation(run(f, "apply"))).code).toBe("destination-missing");
  });
  it("a migrated draft ref in the wrong slot does not count", async () => {
    const f = world();
    await run(f, "apply");
    const dest = scopeDoc().assets[1].objects[0].destination_key;
    f.tables.brand_configs[0].hero_image_ref = null;
    f.tables.brand_configs[0].logo_ref = dest;
    expect((await violation(run(f, "apply"))).code).toBe("draft-ref-not-at-destination");
  });
  it("a published snapshot still pointing at the legacy source is not already-done", async () => {
    const f = world();
    await run(f, "apply");
    (f.tables.published_spaces[0].modules as Record<string, { imageRef: string }[]>).meals[0].imageRef = legacy(T, ASSETS[0], "published");
    const r = await run(f, "dry-run");
    expect(r.pendingObjects).toBe(1);
  });
});

describe("failures after the first write exit nonzero (violation), never a silent pass", () => {
  it("cas-lost fails", async () => {
    const f = world();
    f.hooks.set("update:module_items", () => {
      f.tables.module_items[0].image_ref = "someone/else/entirely";
    });
    const v = await violation(run(f, "apply"));
    expect(v).toMatchObject({ code: "cas-lost", phase: "post-write" });
    expect(v.statuses["cas-lost"]).toBe(1);
  });
  it("snapshot CAS failure fails, and the partial state converges on rerun", async () => {
    const f = world();
    f.hooks.set("update:published_spaces", () => {
      f.tables.published_spaces[0].published_at = "2026-01-03T00:00:00.000Z";
      f.hooks.delete("update:published_spaces");
    });
    const v = await violation(run(f, "apply"));
    expect(v).toMatchObject({ code: "snapshot-failed", phase: "post-write" });
    expect(draftRef(f)).toBe(scopeDoc().assets[0].objects[0].destination_key);
    const r = await run(f, "apply");
    expect(r.statuses).toEqual({ migrated: 1 });
    expect(r.alreadyDoneObjects).toBe(3);
    expect(JSON.stringify(f.tables.published_spaces[0].modules)).toContain(scopeDoc().assets[0].objects[1].destination_key);
  });
  it("a source that changes between plan and copy fails as source-changed", async () => {
    const f = world();
    const racing: Engine = {
      ...engine,
      planTenant: async (sb, t) => {
        const p = await engine.planTenant(sb, t);
        f.files.get(legacy(T, ASSETS[0], "draft"))!.bytes = Buffer.from("meal-BYTES");
        return p;
      },
    };
    expect(await violation(run(f, "apply", scopeDoc(), racing))).toMatchObject({ code: "source-changed", phase: "post-write" });
  });
  it("a source that already differs at plan time is refused before any write", async () => {
    const f = world();
    f.files.get(legacy(T, ASSETS[0], "draft"))!.bytes = Buffer.from("meal-BYTES");
    f.files.get(legacy(T, ASSETS[0], "published"))!.bytes = Buffer.from("meal-BYTES");
    expect(await violation(run(f, "apply"))).toMatchObject({ code: "sha-mismatch", phase: "pre-write" });
    expect(writes(f)).toEqual([]);
  });
  it("a generic per-asset failure and a post-run unresolved ref both fail", async () => {
    let f = world();
    f.failOn(`upload:${scopeDoc().assets[1].objects[0].destination_key}`, { message: "boom" });
    expect((await violation(run(f, "apply"))).code).toBe("failed");
    f = world();
    const broken: Engine = { ...engine, verifyTenantRefs: async () => ({ checked: 1, missing: [`${T}/x/y/draft.webp`] }) };
    expect((await violation(run(f, "apply", scopeDoc(), broken))).code).toBe("unresolved-refs");
  });
  it("tenant-level errors fail even when every asset claims success", async () => {
    const f = world();
    const eng: Engine = { ...engine, applyTenantPlan: async (sb, p) => ({ ...(await engine.applyTenantPlan(sb, p)), errors: ["could not restore content_updated_at"] }) };
    expect((await violation(run(f, "apply", scopeDoc(), eng))).code).toBe("tenant-errors");
  });
});

const NODE_OK = (() => {
  const [maj, min] = process.versions.node.split(".").map(Number);
  return maj > 22 || (maj === 22 && min >= 18);
})();
describe.skipIf(!NODE_OK)("hosted CLI guards (spawned; no network is ever reached)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "scope-cli-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const raw = rawOf(scopeDoc());
  const file = path.join(dir, "scope.json");
  writeFileSync(file, raw, { mode: 0o600 });
  const SECRET = "svc-secret-do-not-print";
  const cli = (args: string[], url = "https://example.invalid") => {
    const r = spawnSync(process.execPath, ["scripts/migrate-legacy-media.mjs", ...args], {
      cwd: path.resolve(__dirname, "../../.."),
      env: { ...process.env, NODE_NO_WARNINGS: "1", NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: SECRET },
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(`${r.stdout}${r.stderr}`).not.toContain(SECRET);
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const good = ["--apply", "--allow-hosted", "--tenant", T, "--scope-file", file, "--scope-sha256", sha(raw), "--expect-manifest-sha256", DIGEST];
  const without = (flag: string) => {
    const i = good.indexOf(flag);
    return good.filter((_, j) => j !== i && (j !== i + 1 || !flag.startsWith("--") || flag === "--allow-hosted"));
  };

  it("hosted apply with no scope fails", () => {
    const r = cli(["--apply", "--allow-hosted", "--tenant", T]);
    expect(r.code).toBe(2);
    expect(r.out).toContain("--scope-file");
  });
  it("hosted apply with no tenant fails", () => {
    const r = cli(without("--tenant"));
    expect(r.code).toBe(2);
    expect(r.out).toContain("--tenant");
  });
  it.each(["--allow-hosted", "--scope-file", "--scope-sha256", "--expect-manifest-sha256"])("hosted apply without %s fails", (flag) => {
    expect(cli(without(flag)).code).toBe(2);
  });
  it("hosted cleanup is rejected outright, applied or not", () => {
    expect(cli(["--cleanup"]).code).toBe(2);
    expect(cli(["--cleanup", "--apply", "--allow-hosted", "--tenant", T]).code).toBe(2);
    expect(cli(["--cleanup", "--tenant", T, "--scope-file", file, "--scope-sha256", sha(raw), "--expect-manifest-sha256", DIGEST]).code).toBe(2);
  });
  it("a scope without a tenant, or a partial scope, is refused", () => {
    expect(cli(["--scope-file", file]).code).toBe(2);
    expect(cli(["--tenant", T, "--scope-file", file]).code).toBe(2);
  });
  it("wrong scope sha, wrong digest, wrong tenant, wrong snapshot and an unreadable file are refused before any network", () => {
    const withArg = (flag: string, v: string) => good.map((x, i) => (good[i - 1] === flag ? v : x));
    expect(cli(withArg("--scope-sha256", "d".repeat(64)))).toMatchObject({ code: 2 });
    expect(cli(withArg("--expect-manifest-sha256", "d".repeat(64))).out).toContain("scope-wrong-manifest-digest");
    expect(cli(withArg("--tenant", T2)).out).toContain("scope-wrong-tenant");
    expect(cli([...good, "--expect-snapshot-prefix", "migrations/task-027/2026-10-01/9-9"]).out).toContain("scope-wrong-snapshot");
    expect(cli(withArg("--scope-file", path.join(dir, "missing.json"))).out).toContain("scope-unreadable");
  });
});
