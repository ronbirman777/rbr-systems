import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Settings-image lifecycle (TASK 027.5 Workstream C). Invariant under test:
 * a persisted media object is never deleted while any saved row still points
 * at it. Removal in the Studio is form-state only; the object is deleted
 * AFTER the settings save commits, and only when nothing else references it.
 * Runs against an in-memory database + Storage fake so the end state
 * ("no saved ref points at a missing object") is asserted directly.
 */

const TENANT = "11111111-2222-4333-8444-555555555555";
const ref = (folder: string, slot: string, n: number) =>
  `${TENANT}/${folder}/${slot}/aaaaaaaa-0000-4000-8000-00000000000${n}/draft.webp`;
const A = ref("teachAbout", "profile", 1);
const B = ref("teachAbout", "profile", 2);
const C = ref("teachExplore", "card", 3);

type Row = Record<string, unknown>;
const db = {
  module_settings: [] as Row[],
  module_items: [] as Row[],
  brand_configs: [] as Row[],
  module_configs: [] as Row[],
};
let objects = new Set<string>();
let failUpsert = false;
let failRemove: "none" | "error" | "throw" = "none";
let failRead: string | null = null;
const callLog: string[] = [];

function builder(table: keyof typeof db) {
  const filters: Array<[string, unknown]> = [];
  const rows = () => db[table].filter((r) => filters.every(([k, v]) => r[k] === v));
  const result = () =>
    failRead === table ? { data: null, error: { message: "read failed" } } : { data: rows(), error: null };
  const b: Record<string, unknown> = {
    eq: (k: string, v: unknown) => {
      filters.push([k, v]);
      return b;
    },
    maybeSingle: async () => {
      const r = result();
      return { data: r.data?.[0] ?? null, error: r.error };
    },
    then: (resolve: (v: unknown) => unknown) => resolve(result()),
  };
  return b;
}

vi.mock("server-only", () => ({}));
vi.mock("sharp", () => ({ default: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/entitlements/getSpaceEntitlement", () => ({ getSpaceEntitlement: async () => null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    storage: {
      from: () => ({
        list: async () => ({ data: [] }),
        remove: async (paths: string[]) => {
          callLog.push(`remove:${paths.join(",")}`);
          if (failRemove === "throw") throw new Error("storage down");
          if (failRemove === "error") return { error: { message: "remove failed" } };
          paths.forEach((p) => objects.delete(p));
          return { error: null };
        },
      }),
    },
    from: (table: string) => {
      if (table === "tenants") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { product_type: "teach", timezone: "UTC" } }) }) }) };
      }
      if (table === "module_settings") {
        return {
          select: () => builder("module_settings"),
          upsert: async (row: Row) => {
            callLog.push("upsert");
            if (failUpsert) return { error: { message: "save failed" } };
            const i = db.module_settings.findIndex((r) => r.module_key === row.module_key && r.tenant_id === row.tenant_id);
            if (i >= 0) db.module_settings[i] = row;
            else db.module_settings.push(row);
            return { error: null };
          },
        };
      }
      if (table in db) return { select: () => builder(table as keyof typeof db) };
      throw new Error(`unexpected table in test: ${table}`);
    },
  }),
}));

async function save(key: "teachAbout" | "teachContact" | "teachExplore", data: unknown) {
  const { saveTeachSettings } = await import("./actions");
  return saveTeachSettings(TENANT, key, data);
}
function seedSaved(key: string, data: unknown) {
  db.module_settings.push({ tenant_id: TENANT, module_key: key, data });
}
function savedRefs(): string[] {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n && typeof n === "object") {
      for (const [k, v] of Object.entries(n)) {
        if (k === "imageRef" && typeof v === "string") out.push(v);
        else walk(v);
      }
    }
  };
  db.module_settings.forEach((r) => walk(r.data));
  db.module_items.forEach((r) => typeof r.image_ref === "string" && out.push(r.image_ref));
  db.brand_configs.forEach((r) => ["hero_image_ref", "space_image_ref", "logo_ref"].forEach((k) => typeof r[k] === "string" && out.push(r[k] as string)));
  db.module_configs.forEach((r) => typeof r.image_ref === "string" && out.push(r.image_ref));
  return out;
}
const noDanglingRefs = () => savedRefs().filter((r) => !objects.has(r));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.values(db).forEach((t) => (t.length = 0));
  objects = new Set([A, B, C]);
  failUpsert = false;
  failRemove = "none";
  failRead = null;
  callLog.length = 0;
});

describe("settings image lifecycle", () => {
  it("has no immediate-delete action: Remove in the Studio is form state only (remove then cancel/no-save keeps the object)", () => {
    const sections = readFileSync(join(__dirname, "teach-studio-sections.tsx"), "utf8");
    const studio = readFileSync(join(__dirname, "teach-studio.tsx"), "utf8");
    const actions = readFileSync(join(__dirname, "actions.ts"), "utf8");
    for (const src of [sections, studio, actions]) {
      expect(src).not.toMatch(/removeTeachDraftMedia|removeDraftMedia/);
    }
    // No save happened -> the saved row still points at A and A still exists.
    seedSaved("teachAbout", { profile: { imageRef: A } });
    expect(noDanglingRefs()).toEqual([]);
    expect(callLog).toEqual([]);
  });

  it("remove then save: deletes the object only AFTER the save commits", async () => {
    seedSaved("teachAbout", { profile: { imageRef: A, imagePosition: { x: 10, y: 10 } } });
    const res = await save("teachAbout", { profile: { imageRef: null, imagePosition: null } });
    expect(res.error).toBeNull();
    expect(callLog).toEqual(["upsert", `remove:${A}`]);
    expect(objects.has(A)).toBe(false);
    expect(noDanglingRefs()).toEqual([]);
  });

  it("replace then save: removes the old draft, keeps the new one", async () => {
    seedSaved("teachAbout", { profile: { imageRef: A } });
    const res = await save("teachAbout", { profile: { imageRef: B } });
    expect(res.error).toBeNull();
    expect(objects.has(A)).toBe(false);
    expect(objects.has(B)).toBe(true);
    expect(noDanglingRefs()).toEqual([]);
  });

  it("an unchanged save deletes nothing", async () => {
    seedSaved("teachAbout", { profile: { imageRef: A } });
    expect((await save("teachAbout", { profile: { imageRef: A } })).error).toBeNull();
    expect(callLog).toEqual(["upsert"]);
  });

  it("same ref in two slots of one row: clearing one slot keeps the object for the other", async () => {
    seedSaved("teachExplore", { cards: { teachReadings: { imageRef: C }, teachAudio: { imageRef: C } } });
    const res = await save("teachExplore", { cards: { teachReadings: { imageRef: null }, teachAudio: { imageRef: C } } });
    expect(res.error).toBeNull();
    expect(objects.has(C)).toBe(true);
    expect(noDanglingRefs()).toEqual([]);
  });

  it.each([
    ["another settings row", () => seedSaved("teachContact", { cover: { imageRef: A } })],
    ["an item image", () => db.module_items.push({ tenant_id: TENANT, image_ref: A, metadata: {} })],
    ["item metadata", () => db.module_items.push({ tenant_id: TENANT, image_ref: null, metadata: { nested: { imageRef: A } } })],
    ["a brand image", () => db.brand_configs.push({ tenant_id: TENANT, hero_image_ref: A })],
    ["a module cover", () => db.module_configs.push({ tenant_id: TENANT, image_ref: A })],
  ])("a ref still used by %s is preserved when this slot drops it", async (_n, seed) => {
    seedSaved("teachAbout", { profile: { imageRef: A } });
    seed();
    expect((await save("teachAbout", { profile: { imageRef: null } })).error).toBeNull();
    expect(objects.has(A)).toBe(true);
    expect(noDanglingRefs()).toEqual([]);
  });

  it("save failure: nothing is deleted and the previous row keeps a live object", async () => {
    seedSaved("teachAbout", { profile: { imageRef: A } });
    failUpsert = true;
    const res = await save("teachAbout", { profile: { imageRef: null } });
    expect(res.error).toBe("save failed");
    expect(callLog).toEqual(["upsert"]);
    expect(objects.has(A)).toBe(true);
    expect(noDanglingRefs()).toEqual([]);
  });

  it.each(["error", "throw"] as const)("cleanup failure (%s): the save still succeeds, the object is left for later cleanup", async (mode) => {
    seedSaved("teachAbout", { profile: { imageRef: A } });
    failRemove = mode;
    const res = await save("teachAbout", { profile: { imageRef: null } });
    expect(res.error).toBeNull();
    expect(db.module_settings[0].data).toMatchObject({ profile: { imageRef: null } });
    expect(objects.has(A)).toBe(true);
  });

  it.each(["module_settings", "module_items", "brand_configs", "module_configs"])(
    "if the reference proof cannot be completed (%s read fails) nothing is deleted",
    async (table) => {
      seedSaved("teachAbout", { profile: { imageRef: A } });
      failRead = table;
      const res = await save("teachAbout", { profile: { imageRef: null } });
      // A failed read of module_settings also hides the previous row; either way A survives.
      expect(res.error).toBeNull();
      expect(objects.has(A)).toBe(true);
      expect(callLog.filter((c) => c.startsWith("remove"))).toEqual([]);
    }
  );

  it("never deletes published, audio or foreign objects, only this tenant's drafts", async () => {
    const published = `${TENANT}/teachAbout/profile/aaaaaaaa-0000-4000-8000-000000000009/published.webp`;
    const audio = `${TENANT}/teachAudioFile/bbbbbbbb-0000-4000-8000-000000000001/aaaaaaaa-0000-4000-8000-000000000001/draft.mp3`;
    objects.add(published);
    objects.add(audio);
    seedSaved("teachAbout", { profile: { imageRef: A }, extra: { audioRef: audio, imageRef: published } });
    expect((await save("teachAbout", { profile: { imageRef: null } })).error).toBeNull();
    expect(objects.has(A)).toBe(false);
    expect(objects.has(published)).toBe(true);
    expect(objects.has(audio)).toBe(true);
  });
});
