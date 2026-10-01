import { describe, expect, it } from "vitest";
import {
  BUCKET,
  UUID_RE,
  applyTenantPlan,
  cleanupTenantLegacy,
  collectSnapshotRefs,
  deterministicUploadId,
  parseMediaPath,
  planTenant,
  rewriteSnapshotRefs,
  verifyTenantRefs,
} from "./legacyMigration";
import { makeMigrationFake, type MigrationFake } from "./migrationFake.test-util";
import { MEDIA_BUCKET, collectImageRefs, isDraftMediaPathForTenant, isTenantId, isWellFormedMediaPath, publishedMediaPath } from "./path";

const T = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const T0 = "2026-01-01T00:00:00.000Z";
const PUBLISHED_AT = "2026-01-02T00:00:00.000Z";

function world(): MigrationFake {
  const f = makeMigrationFake();
  f.tables.tenants.push({ id: T, content_updated_at: T0 }, { id: T2, content_updated_at: T0 });
  return f;
}
const leg = (t: string, mk: string, item: string, kind: "draft" | "published", ext = "webp") => `${t}/${mk}/${item}/${kind}.${ext}`;

type Case = {
  label: string;
  mk: string;
  item: string;
  seed: (f: MigrationFake, t: string, ref: string) => void;
  snapshot: (pub: string) => Record<string, unknown>;
  readDraft: (f: MigrationFake, t: string) => string;
  readSnap: (modules: Record<string, unknown>) => string;
};
const itemCase = (label: string, mk: string): Case => ({
  label,
  mk,
  item: "item-1",
  seed: (f, t, ref) => f.tables.module_items.push({ id: `row-${Math.random()}`, tenant_id: t, module_key: mk, image_ref: ref }),
  snapshot: (pub) => ({ [mk]: [{ id: "item-1", name: "x", imageRef: pub }] }),
  readDraft: (f, t) => f.tables.module_items.find((r) => r.tenant_id === t && r.module_key === mk)?.image_ref as string,
  readSnap: (m) => ((m[mk] as { imageRef: string }[])[0]).imageRef,
});
const brandCase = (label: string, item: string, column: string): Case => ({
  label,
  mk: "brand",
  item,
  seed: (f, t, ref) => {
    const row = f.tables.brand_configs.find((r) => r.tenant_id === t) ?? (f.tables.brand_configs.push({ tenant_id: t }), f.tables.brand_configs[f.tables.brand_configs.length - 1]);
    row[column] = ref;
  },
  snapshot: (pub) => ({ brand: { [item]: { imageRef: pub } } }),
  readDraft: (f, t) => f.tables.brand_configs.find((r) => r.tenant_id === t)?.[column] as string,
  readSnap: (m) => ((m.brand as Record<string, { imageRef: string }>)[item]).imageRef,
});
const CASES: Case[] = [
  itemCase("list-item media (meals)", "meals"),
  itemCase("facilitator", "facilitators"),
  itemCase("treatment", "treatments"),
  itemCase("facility", "facilities"),
  itemCase("custom page", "customPages"),
  brandCase("fixed-slot hero", "hero", "hero_image_ref"),
  brandCase("space image", "space", "space_image_ref"),
  brandCase("logo", "logo", "logo_ref"),
  {
    label: "module cover",
    mk: "meals",
    item: "_cover",
    seed: (f, t, ref) => f.tables.module_configs.push({ tenant_id: t, module_key: "meals", image_ref: ref }),
    snapshot: (pub) => ({ moduleCovers: { meals: { imageRef: pub } } }),
    readDraft: (f, t) => f.tables.module_configs.find((r) => r.tenant_id === t)?.image_ref as string,
    readSnap: (m) => ((m.moduleCovers as Record<string, { imageRef: string }>).meals).imageRef,
  },
];

function setSnapshot(f: MigrationFake, t: string, modules: Record<string, unknown>) {
  const row = f.tables.published_spaces.find((r) => r.tenant_id === t);
  if (row) row.modules = modules;
  else f.tables.published_spaces.push({ tenant_id: t, modules, published_at: PUBLISHED_AT });
}
const snapOf = (f: MigrationFake, t: string) => f.tables.published_spaces.find((r) => r.tenant_id === t)?.modules as Record<string, unknown>;
const run = async (f: MigrationFake, t = T) => {
  const plan = await planTenant(f.client, t);
  return { plan, result: await applyTenantPlan(f.client, plan) };
};

describe("path helpers", () => {
  it("shares constants and semantics with path.ts", () => {
    expect(BUCKET).toBe(MEDIA_BUCKET);
    for (const v of [T, "nope", "11111111-1111-4111-8111-11111111111Z"]) expect(UUID_RE.test(v)).toBe(isTenantId(v));
    const modules = { a: [{ imageRef: "x/y" }], b: { c: { imageRef: "z" } }, imageRef: 5, d: { notImageRef: "q" } };
    expect([...collectSnapshotRefs(modules)].sort()).toEqual([...collectImageRefs(modules)].sort());
  });

  it("classifies path shapes", () => {
    expect(parseMediaPath(`${T}/meals/i/draft.webp`).shape).toBe("legacy-draft");
    expect(parseMediaPath(`${T}/meals/i/published.png`).shape).toBe("legacy-published");
    expect(parseMediaPath(`${T}/meals/i/${T2}/draft.webp`).shape).toBe("versioned-draft");
    expect(parseMediaPath(`${T}/meals/i/${T2}/published.webp`).shape).toBe("versioned-published");
    for (const bad of [`${T}/meals/draft.webp`, `${T}/meals/i/j/draft.webp`, `x/meals/i/draft.webp`, `${T}/../i/draft.webp`, `${T}/meals/i/other.webp`, `${T}//i/draft.webp`]) {
      expect(parseMediaPath(bad).shape).toBe("other");
    }
  });

  it("derives a stable, uuid-shaped upload id that depends on tenant, path and bytes", () => {
    const a = deterministicUploadId(T, "p", "sha1");
    expect(a).toMatch(UUID_RE);
    expect(deterministicUploadId(T, "p", "sha1")).toBe(a);
    expect(deterministicUploadId(T2, "p", "sha1")).not.toBe(a);
    expect(deterministicUploadId(T, "q", "sha1")).not.toBe(a);
    expect(deterministicUploadId(T, "p", "sha2")).not.toBe(a);
  });

  it("rewrites only exact imageRef values", () => {
    const m = { a: [{ imageRef: "old", text: "old" }], b: { imageRef: "other" }, imageRefs: ["old"] };
    const r = rewriteSnapshotRefs(m, new Map([["old", "new"]]));
    expect(r.changed).toBe(1);
    expect(r.modules).toEqual({ a: [{ imageRef: "new", text: "old" }], b: { imageRef: "other" }, imageRefs: ["old"] });
    expect(m.a[0].imageRef).toBe("old");
  });
});

describe.each(CASES)("migrates a published legacy pair: $label", (c) => {
  it("copies draft and published into one versioned folder and repoints DB + snapshot", async () => {
    const f = world();
    const d = leg(T, c.mk, c.item, "draft");
    const p = leg(T, c.mk, c.item, "published");
    f.put(d, "BYTES");
    f.put(p, "BYTES");
    c.seed(f, T, d);
    setSnapshot(f, T, c.snapshot(p));

    const { plan, result } = await run(f);
    expect(plan.assets).toHaveLength(1);
    expect(result.assets.map((a) => a.status)).toEqual(["migrated"]);

    const newDraft = c.readDraft(f, T);
    const newPub = c.readSnap(snapOf(f, T));
    expect(parseMediaPath(newDraft).shape).toBe("versioned-draft");
    expect(parseMediaPath(newPub).shape).toBe("versioned-published");
    expect(publishedMediaPath(newDraft)).toBe(newPub);
    expect(isDraftMediaPathForTenant(T, newDraft)).toBe(true);
    expect(isWellFormedMediaPath(newPub.split("/"))).toBe(true);
    expect(f.text(newDraft)).toBe("BYTES");
    expect(f.text(newPub)).toBe("BYTES");
    // old objects are kept until the separate cleanup step
    expect(f.text(d)).toBe("BYTES");
    expect(f.text(p)).toBe("BYTES");
    expect((await verifyTenantRefs(f.client, T)).missing).toEqual([]);
    // legacy ref is gone from the snapshot, so /api/media would now deny it
    expect(collectSnapshotRefs(snapOf(f, T)).has(p)).toBe(false);
  });
});

describe("asset states", () => {
  it("1. legacy draft only: migrates the draft, creates no published object", async () => {
    const f = world();
    const d = leg(T, "meals", "i1", "draft");
    f.put(d, "D");
    CASES[0].seed(f, T, d);
    const { result } = await run(f);
    expect(result.assets[0].status).toBe("migrated");
    const nd = CASES[0].readDraft(f, T);
    expect(parseMediaPath(nd).shape).toBe("versioned-draft");
    expect([...f.files.keys()].filter((k) => k.endsWith("published.webp"))).toEqual([]);
    expect(result.snapshotRefsRewritten).toBe(0);
  });

  it("2. legacy published only: copies and repoints the snapshot", async () => {
    const f = world();
    const p = leg(T, "meals", "gone", "published");
    f.put(p, "P");
    setSnapshot(f, T, { meals: [{ id: "gone", imageRef: p }] });
    const { result } = await run(f);
    expect(result.assets[0].status).toBe("migrated");
    const np = (snapOf(f, T).meals as { imageRef: string }[])[0].imageRef;
    expect(parseMediaPath(np).shape).toBe("versioned-published");
    expect(f.text(np)).toBe("P");
    expect(f.text(p)).toBe("P");
  });

  it("3. identical draft + published share one uploadId folder", async () => {
    const f = world();
    const d = leg(T, "meals", "i1", "draft");
    const p = leg(T, "meals", "i1", "published");
    f.put(d, "SAME");
    f.put(p, "SAME");
    CASES[0].seed(f, T, d);
    setSnapshot(f, T, CASES[0].snapshot(p));
    await run(f);
    const nd = CASES[0].readDraft(f, T);
    const np = CASES[0].readSnap(snapOf(f, T));
    expect(nd.split("/").slice(0, 4)).toEqual(np.split("/").slice(0, 4));
  });

  it("4. divergent bytes: reported as a conflict and nothing is written", async () => {
    const f = world();
    const d = leg(T, "meals", "i1", "draft");
    const p = leg(T, "meals", "i1", "published");
    f.put(d, "DRAFT-EDITED");
    f.put(p, "PUBLISHED");
    CASES[0].seed(f, T, d);
    setSnapshot(f, T, CASES[0].snapshot(p));
    const before = [...f.files.keys()];
    const { plan, result } = await run(f);
    expect(plan.assets[0].outcome).toBe("conflict");
    expect(result.assets[0].status).toBe("conflict");
    expect([...f.files.keys()]).toEqual(before);
    expect(CASES[0].readDraft(f, T)).toBe(d);
    expect(CASES[0].readSnap(snapOf(f, T))).toBe(p);
    expect(f.log).toEqual([]);
  });

  it("5. missing published object: draft migrates, broken snapshot ref is left alone and reported", async () => {
    const f = world();
    const d = leg(T, "meals", "i1", "draft");
    const p = leg(T, "meals", "i1", "published");
    f.put(d, "D");
    CASES[0].seed(f, T, d);
    setSnapshot(f, T, CASES[0].snapshot(p));
    const { plan, result } = await run(f);
    expect(plan.skips).toContainEqual({ ref: p, where: "published", reason: "object-missing" });
    expect(result.assets[0].status).toBe("migrated");
    expect(parseMediaPath(CASES[0].readDraft(f, T)).shape).toBe("versioned-draft");
    expect(CASES[0].readSnap(snapOf(f, T))).toBe(p);
  });

  it("5b. published-only ref to a missing object is never fabricated or repaired", async () => {
    const f = world();
    const p = leg(T, "customPages", "gone", "published");
    setSnapshot(f, T, { customPages: [{ id: "gone", imageRef: p }] });
    const { plan, result } = await run(f);
    expect(plan.assets).toEqual([]);
    expect(plan.skips).toEqual([{ ref: p, where: "published", reason: "object-missing" }]);
    expect(result.assets).toEqual([]);
    expect(f.files.size).toBe(0);
    expect((snapOf(f, T).customPages as { imageRef: string }[])[0].imageRef).toBe(p);
  });

  it("6. missing draft object: ref left unchanged; an existing published copy still migrates", async () => {
    const f = world();
    const d = leg(T, "meals", "i1", "draft");
    const p = leg(T, "meals", "i1", "published");
    f.put(p, "P");
    CASES[0].seed(f, T, d);
    setSnapshot(f, T, CASES[0].snapshot(p));
    const { plan } = await run(f);
    expect(plan.skips).toContainEqual({ ref: d, where: "draft", reason: "object-missing" });
    expect(CASES[0].readDraft(f, T)).toBe(d);
    expect(parseMediaPath(CASES[0].readSnap(snapOf(f, T))).shape).toBe("versioned-published");
  });

  it("6b. missing draft object with nothing else: nothing to do", async () => {
    const f = world();
    const d = leg(T, "meals", "i1", "draft");
    CASES[0].seed(f, T, d);
    const { plan, result } = await run(f);
    expect(plan.assets).toEqual([]);
    expect(result.assets).toEqual([]);
  });

  it("17. already-versioned refs are skipped and written to nothing", async () => {
    const f = world();
    const base = `${T}/meals/i1/${T2}`;
    f.put(`${base}/draft.webp`, "V");
    f.put(`${base}/published.webp`, "V");
    CASES[0].seed(f, T, `${base}/draft.webp`);
    setSnapshot(f, T, CASES[0].snapshot(`${base}/published.webp`));
    const { plan, result } = await run(f);
    expect(plan.assets).toEqual([]);
    expect(plan.skips.map((s) => s.reason)).toEqual(["already-versioned", "already-versioned"]);
    expect(result.assets).toEqual([]);
    expect(f.log).toEqual([]);
  });

  it("18. mixed legacy + versioned: only the legacy asset moves", async () => {
    const f = world();
    const vBase = `${T}/meals/v1/${T2}`;
    f.put(`${vBase}/draft.webp`, "V");
    f.put(`${vBase}/published.webp`, "V");
    const d = leg(T, "meals", "l1", "draft");
    const p = leg(T, "meals", "l1", "published");
    f.put(d, "L");
    f.put(p, "L");
    CASES[0].seed(f, T, `${vBase}/draft.webp`);
    CASES[0].seed(f, T, d);
    setSnapshot(f, T, { meals: [{ id: "v1", imageRef: `${vBase}/published.webp` }, { id: "l1", imageRef: p }] });
    const { plan, result } = await run(f);
    expect(plan.assets).toHaveLength(1);
    expect(result.assets[0].status).toBe("migrated");
    const refs = (snapOf(f, T).meals as { imageRef: string }[]).map((m) => m.imageRef);
    expect(refs[0]).toBe(`${vBase}/published.webp`);
    expect(parseMediaPath(refs[1]).shape).toBe("versioned-published");
    expect(f.text(`${vBase}/published.webp`)).toBe("V");
  });

  it("a legacy published ref with an already-versioned draft is migrated as published-only", async () => {
    const f = world();
    const vBase = `${T}/meals/i1/${T2}`;
    f.put(`${vBase}/draft.webp`, "NEW-DRAFT");
    const p = leg(T, "meals", "i1", "published");
    f.put(p, "OLD-LIVE");
    CASES[0].seed(f, T, `${vBase}/draft.webp`);
    setSnapshot(f, T, CASES[0].snapshot(p));
    await run(f);
    const np = CASES[0].readSnap(snapOf(f, T));
    expect(f.text(np)).toBe("OLD-LIVE");
    expect(np.startsWith(`${vBase}/`)).toBe(false);
    expect(f.text(`${vBase}/draft.webp`)).toBe("NEW-DRAFT");
  });

  it("one legacy draft used by several rows updates every row", async () => {
    const f = world();
    const d = leg(T, "meals", "i1", "draft");
    f.put(d, "D");
    CASES[0].seed(f, T, d);
    CASES[0].seed(f, T, d);
    await run(f);
    const refs = f.tables.module_items.map((r) => r.image_ref as string);
    expect(new Set(refs).size).toBe(1);
    expect(parseMediaPath(refs[0]).shape).toBe("versioned-draft");
  });
});

describe("idempotency and retry", () => {
  function pairWorld() {
    const f = world();
    for (const item of ["a", "b", "c"]) {
      const d = leg(T, "meals", item, "draft");
      const p = leg(T, "meals", item, "published");
      f.put(d, `bytes-${item}`);
      f.put(p, `bytes-${item}`);
      CASES[0].seed(f, T, d);
    }
    setSnapshot(f, T, { meals: ["a", "b", "c"].map((i) => ({ id: i, imageRef: leg(T, "meals", i, "published") })) });
    return f;
  }
  const state = (f: MigrationFake) => JSON.stringify({ files: [...f.files.keys()].sort(), items: f.tables.module_items.map((r) => r.image_ref), snap: snapOf(f, T) });

  it("19. a rerun after success plans nothing and writes nothing", async () => {
    const f = pairWorld();
    await run(f);
    const after = state(f);
    f.log.length = 0;
    const { plan, result } = await run(f);
    expect(plan.assets).toEqual([]);
    expect(result.assets).toEqual([]);
    expect(f.log).toEqual([]);
    expect(state(f)).toBe(after);
  });

  it("20a. upload failing halfway leaves old state valid; retry converges without orphans", async () => {
    const f = pairWorld();
    const pathB = (await planTenant(f.client, T)).assets.find((a) => a.itemId === "b")!;
    f.failOn(`upload:${pathB.draft!.new}`, { message: "boom" });
    const { result } = await run(f);
    expect(result.assets.map((a) => a.status).sort()).toEqual(["failed", "migrated", "migrated"]);
    // b still points at legacy objects, which still exist
    expect((await verifyTenantRefs(f.client, T)).missing).toEqual([]);
    const refsMid = f.tables.module_items.map((r) => r.image_ref as string);
    expect(refsMid.filter((r) => parseMediaPath(r).shape === "legacy-draft")).toHaveLength(1);
    f.clearFailures();
    const second = await run(f);
    expect(second.result.assets.map((a) => a.status)).toEqual(["migrated"]);
    // 3 assets x (legacy draft+published) + 3 x (new draft+published), nothing extra
    expect(f.files.size).toBe(12);
    expect((await verifyTenantRefs(f.client, T)).missing).toEqual([]);
    expect(collectSnapshotRefs(snapOf(f, T)).size).toBe(3);
    for (const r of collectSnapshotRefs(snapOf(f, T))) expect(parseMediaPath(r).shape).toBe("versioned-published");
  });

  it("20b. DB update failing after the copy: old refs valid, retry reuses the same destination", async () => {
    const f = pairWorld();
    f.failOn("update:module_items", { message: "db down" }, 1);
    const { result } = await run(f);
    expect(result.assets.filter((a) => a.status === "failed")).toHaveLength(1);
    expect((await verifyTenantRefs(f.client, T)).missing).toEqual([]);
    const keysAfterFail = new Set(f.files.keys());
    f.clearFailures();
    await run(f);
    // the failed asset was already copied: the retry reuses those objects and adds none
    expect([...f.files.keys()].filter((k) => !keysAfterFail.has(k))).toEqual([]);
    expect(f.files.size).toBe(12);
  });

  it("20c. snapshot update failing: DB refs migrated, snapshot still legacy and valid; retry converges on the same folder", async () => {
    const f = pairWorld();
    f.failOn("update:published_spaces", { message: "snapshot write failed" }, 1);
    const { result } = await run(f);
    expect(result.errors).toHaveLength(1);
    expect(result.assets.every((a) => a.status === "snapshot-failed")).toBe(true);
    for (const r of collectSnapshotRefs(snapOf(f, T))) expect(parseMediaPath(r).shape).toBe("legacy-published");
    expect((await verifyTenantRefs(f.client, T)).missing).toEqual([]);
    const count = f.files.size;
    f.clearFailures();
    const second = await run(f);
    expect(second.result.errors).toEqual([]);
    expect(f.files.size).toBe(count);
    const snapRefs = [...collectSnapshotRefs(snapOf(f, T))].sort();
    const draftRefs = f.tables.module_items.map((r) => publishedMediaPath(r.image_ref as string)).sort();
    expect(snapRefs).toEqual(draftRefs);
  });

  it("a Publish that lands between plan and apply wins: the snapshot is left as the Publish wrote it", async () => {
    const f = pairWorld();
    const plan = await planTenant(f.client, T);
    f.hooks.set("update:published_spaces", () => {
      f.tables.published_spaces[0].published_at = "2026-02-02T00:00:00.000Z";
    });
    const result = await applyTenantPlan(f.client, plan);
    expect(result.errors.join()).toMatch(/concurrently/);
    for (const r of collectSnapshotRefs(snapOf(f, T))) expect(parseMediaPath(r).shape).toBe("legacy-published");
    expect((await verifyTenantRefs(f.client, T)).missing).toEqual([]);
  });

  it("an edit between plan and apply is never overwritten (compare-and-set)", async () => {
    const f = world();
    const d = leg(T, "meals", "i1", "draft");
    f.put(d, "D");
    CASES[0].seed(f, T, d);
    const plan = await planTenant(f.client, T);
    f.tables.module_items[0].image_ref = `${T}/meals/i1/${T2}/draft.webp`;
    const result = await applyTenantPlan(f.client, plan);
    expect(result.assets[0].status).toBe("cas-lost");
    expect(f.tables.module_items[0].image_ref).toBe(`${T}/meals/i1/${T2}/draft.webp`);
  });

  it("changed source bytes between plan and apply are refused", async () => {
    const f = world();
    const d = leg(T, "meals", "i1", "draft");
    f.put(d, "D");
    CASES[0].seed(f, T, d);
    const plan = await planTenant(f.client, T);
    f.put(d, "D-CHANGED");
    const result = await applyTenantPlan(f.client, plan);
    expect(result.assets[0].status).toBe("source-changed");
    expect(f.tables.module_items[0].image_ref).toBe(d);
    expect(f.files.size).toBe(1);
  });

  it("a destination holding different bytes is a failure, not an overwrite", async () => {
    const f = world();
    const d = leg(T, "meals", "i1", "draft");
    f.put(d, "D");
    CASES[0].seed(f, T, d);
    const plan = await planTenant(f.client, T);
    f.put(plan.assets[0].draft!.new, "SOMETHING-ELSE");
    const result = await applyTenantPlan(f.client, plan);
    expect(result.assets[0].status).toBe("failed");
    expect(f.text(plan.assets[0].draft!.new)).toBe("SOMETHING-ELSE");
    expect(f.tables.module_items[0].image_ref).toBe(d);
  });

  it("a transient storage error while planning is not mistaken for a missing object", async () => {
    const f = world();
    const d = leg(T, "meals", "i1", "draft");
    f.put(d, "D");
    CASES[0].seed(f, T, d);
    f.failOn(`download:${d}`, { message: "503 upstream" });
    await expect(planTenant(f.client, T)).rejects.toThrow(/download failed/);
  });

  it("restores content_updated_at so live Spaces are not flagged as having unpublished changes", async () => {
    const f = pairWorld();
    const { result } = await run(f);
    expect(result.contentUpdatedAtRestored).toBe(true);
    expect(f.tables.tenants.find((t) => t.id === T)?.content_updated_at).toBe(T0);
    expect(f.tables.published_spaces[0].published_at).toBe(PUBLISHED_AT);
  });
});

describe("26. cross-tenant safety", () => {
  it("a ref pointing at another tenant's object is never copied, repointed or touched", async () => {
    const f = world();
    const foreign = leg(T2, "meals", "x", "draft");
    f.put(foreign, "OTHER");
    CASES[0].seed(f, T, foreign);
    setSnapshot(f, T, CASES[0].snapshot(leg(T2, "meals", "x", "published")));
    const { plan, result } = await run(f);
    expect(plan.assets).toEqual([]);
    expect(plan.skips.every((s) => s.reason === "foreign-or-unrecognised")).toBe(true);
    expect(result.assets).toEqual([]);
    expect(f.files.size).toBe(1);
    expect(f.tables.module_items[0].image_ref).toBe(foreign);
  });

  it("migrating one tenant leaves another tenant's identical-looking refs alone", async () => {
    const f = world();
    for (const t of [T, T2]) {
      const d = leg(t, "meals", "same", "draft");
      f.put(d, "D");
      CASES[0].seed(f, t, d);
    }
    await run(f, T);
    expect(f.tables.module_items.find((r) => r.tenant_id === T2)?.image_ref).toBe(leg(T2, "meals", "same", "draft"));
    expect([...f.files.keys()].filter((k) => k.startsWith(`${T2}/`))).toHaveLength(1);
  });
});

describe("cleanup of legacy objects", () => {
  async function migrated() {
    const f = world();
    const d = leg(T, "meals", "i1", "draft");
    const p = leg(T, "meals", "i1", "published");
    f.put(d, "SAME");
    f.put(p, "SAME");
    CASES[0].seed(f, T, d);
    setSnapshot(f, T, CASES[0].snapshot(p));
    await run(f);
    return { f, d, p };
  }
  const later = () => Date.now() + 3_600_000;

  it("dry run removes nothing; apply removes only the unreferenced, verified legacy pair", async () => {
    const { f, d, p } = await migrated();
    const dry = await cleanupTenantLegacy(f.client, T, { apply: false, now: later() });
    expect(dry.removed.sort()).toEqual([d, p].sort());
    expect(f.text(d)).toBe("SAME");
    const report = await cleanupTenantLegacy(f.client, T, { apply: true, now: later() });
    expect(report.removed.sort()).toEqual([d, p].sort());
    expect(f.text(d)).toBeNull();
    expect(f.text(p)).toBeNull();
    expect((await verifyTenantRefs(f.client, T)).missing).toEqual([]);
  });

  it("keeps a copy that is too recent", async () => {
    const { f, d } = await migrated();
    const report = await cleanupTenantLegacy(f.client, T, { apply: true, now: Date.parse("2026-01-01T00:00:10Z") });
    expect(report.removed).toEqual([]);
    expect(report.kept.find((k) => k.path === d)?.reason).toBe("copy-too-recent");
  });

  it("never removes a legacy object that is still referenced or has no verified copy", async () => {
    const f = world();
    const ref = leg(T, "meals", "live", "draft");
    const orphan = leg(T, "facilitators", "deleted-item", "draft");
    f.put(ref, "R");
    f.put(orphan, "O");
    CASES[0].seed(f, T, ref);
    const report = await cleanupTenantLegacy(f.client, T, { apply: true, now: later() });
    expect(report.removed).toEqual([]);
    expect(report.kept.map((k) => k.reason).sort()).toEqual(["no-verified-copy", "still-referenced"]);
    expect(f.text(ref)).toBe("R");
    expect(f.text(orphan)).toBe("O");
  });

  it("does not trust a copy whose bytes differ", async () => {
    const { f, d } = await migrated();
    const nd = f.tables.module_items[0].image_ref as string;
    f.put(nd, "CORRUPT", 3_600_000);
    f.put(d, "SAME");
    const report = await cleanupTenantLegacy(f.client, T, { apply: true, now: later() });
    expect(report.removed).not.toContain(d);
  });

  it("21. a failing removal is harmless and a rerun finishes the job", async () => {
    const { f, d, p } = await migrated();
    f.failOn("remove");
    const first = await cleanupTenantLegacy(f.client, T, { apply: true, now: later() });
    expect(first.failed.sort()).toEqual([d, p].sort());
    expect(first.removed).toEqual([]);
    expect((await verifyTenantRefs(f.client, T)).missing).toEqual([]);
    const second = await cleanupTenantLegacy(f.client, T, { apply: true, now: later() });
    expect(second.removed).toHaveLength(2);
    expect((await verifyTenantRefs(f.client, T)).missing).toEqual([]);
  });

  it("removes in batches of at most 100", async () => {
    const f = world();
    for (let i = 0; i < 120; i++) {
      const d = leg(T, "meals", `i${i}`, "draft");
      f.put(d, `b${i}`);
      CASES[0].seed(f, T, d);
    }
    await run(f);
    f.log.length = 0;
    const report = await cleanupTenantLegacy(f.client, T, { apply: true, now: later() });
    expect(report.removed).toHaveLength(120);
    expect(f.log.filter((l) => l.startsWith("remove:"))).toEqual(["remove:100", "remove:20"]);
  });
});
