import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SPACE_TYPE_IDS, SPACE_TYPES, requiredPublishBuilders } from "./registry";
import { getPublishAvailability } from "./publishAvailability";
import { TEACH_ITEM_KEYS, TEACH_SETTINGS_KEYS } from "@/lib/teach/schemas";
import {
  stripSqlComments,
  bodyCallsGuardedBuilder,
  extractFunctionBody,
  laterDrops,
  latestFunctionDefinition,
  latestProductTypeCheck,
  type MigrationFile,
} from "./migrationInspect";

/**
 * publish_space() regression guard.
 *
 * Every migration that changes publish_space() must restate its whole body,
 * so a future migration copied from an older definition would silently drop
 * a product's publishing block (e.g. Time to Teach's build_teach_payload).
 * This test finds the LATEST migration that defines publish_space() and
 * requires it to still call every product builder the Space Type Registry
 * declares (SPACE_TYPES[*].publish.sqlBuilder), inside that product's own
 * product_type guard.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../supabase/migrations");
const migrations: MigrationFile[] = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((name) => ({ name, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf8") }));

const FIX_HINT =
  "publish_space() was redefined without a product builder. Copy the body from the LATEST migration that defines publish_space(), not an older one.";

describe("publish_space() keeps every product publish builder", () => {
  const latest = latestFunctionDefinition(migrations, "publish_space");

  it("finds the latest migration that defines publish_space()", () => {
    expect(latest, "no migration defines publish_space()").not.toBeNull();
  });

  const builderOwners = SPACE_TYPE_IDS.filter((id) => SPACE_TYPES[id].publish.sqlBuilder).map((id) => ({
    typeId: id,
    builder: SPACE_TYPES[id].publish.sqlBuilder as string,
  }));

  it("the registry declares at least the Teach builder", () => {
    expect(requiredPublishBuilders()).toContain("build_teach_payload");
  });

  for (const { typeId, builder } of builderOwners) {
    it(`latest publish_space() calls ${builder} inside the '${typeId}' guard`, () => {
      expect(bodyCallsGuardedBuilder(latest!.body, typeId, builder), `${FIX_HINT} (latest: ${latest!.file})`).toBe(true);
    });

    it(`${builder} is defined by a migration and not dropped afterwards`, () => {
      const def = latestFunctionDefinition(migrations, builder);
      expect(def, `${builder} is never defined`).not.toBeNull();
      expect(laterDrops(migrations, builder, def!.file)).toEqual([]);
    });
  }

  it("Time to Flow's inline publish blocks are still present", () => {
    for (const key of ["schedule", "facilitators", "meals", "treatments", "facilities", "arrivalInfo", "faq", "customPages", "stayConnected"]) {
      expect(latest!.body.includes(`'${key}' = any(v_enabled_modules)`), `missing retreat block '${key}'`).toBe(true);
    }
    expect(latest!.body.replace(/\s+/g, " ")).toContain("'brand', jsonb_build_object(");
  });
});

describe("the regression checks themselves detect a dropped block", () => {
  const withBlock = `create or replace function public.publish_space(p_tenant_id uuid) returns timestamptz language plpgsql as $$
  begin
    if v_tenant.product_type = 'teach' then
      v_modules := v_modules || jsonb_build_object('teach', public.build_teach_payload(p_tenant_id));
    end if;
  end; $$;`;
  const withoutBlock = `create or replace function public.publish_space(p_tenant_id uuid) returns timestamptz language plpgsql as $$
  begin
    -- if v_tenant.product_type = 'teach' then public.build_teach_payload(p_tenant_id); end if;
  end; $$;`;

  it("passes with the block, fails without it (commented-out code does not count)", () => {
    expect(bodyCallsGuardedBuilder(extractFunctionBody(withBlock, "publish_space")!, "teach", "build_teach_payload")).toBe(true);
    expect(bodyCallsGuardedBuilder(extractFunctionBody(withoutBlock, "publish_space")!, "teach", "build_teach_payload")).toBe(false);
  });

  it("a later migration that re-copies an old body is detected as the latest definition", () => {
    const files: MigrationFile[] = [
      { name: "0019_x.sql", sql: withBlock },
      { name: "0020_y.sql", sql: withoutBlock },
    ];
    const latest = latestFunctionDefinition(files, "publish_space")!;
    expect(latest.file).toBe("0020_y.sql");
    expect(bodyCallsGuardedBuilder(latest.body, "teach", "build_teach_payload")).toBe(false);
  });

  it("detects a later drop of a builder", () => {
    const files: MigrationFile[] = [
      { name: "0019_x.sql", sql: "create or replace function public.build_teach_payload(p uuid) returns jsonb language sql as $$ select 1 $$;" },
      { name: "0021_z.sql", sql: "drop function if exists public.build_teach_payload(uuid);" },
    ];
    expect(laterDrops(files, "build_teach_payload", "0019_x.sql")).toEqual(["0021_z.sql"]);
  });
});

describe("Space Type Registry matches the database", () => {
  it("SPACE_TYPE_IDS equals the latest tenants.product_type CHECK", () => {
    expect([...(latestProductTypeCheck(migrations) ?? [])].sort()).toEqual([...SPACE_TYPE_IDS].sort());
  });
});

const norm = (sql: string) => sql.replace(/\s+/g, " ").trim();
const TEACH_BLOCK = /if v_tenant\.product_type = 'teach' then[\s\S]*?end if;/i;
const TEACH_CUSTOM_PAGES_GATE = /if 'customPages' = any\(v_enabled_modules\) and v_tenant\.product_type is distinct from 'teach' then/i;

describe("0028: Teach foundation on top of 0025's publish_space() (TASK 027.5 Phase 4A)", () => {
  const latest = latestFunctionDefinition(migrations, "publish_space")!;
  const base = extractFunctionBody(migrations.find((m) => m.name.startsWith("0025_"))!.sql, "publish_space")!;

  it("the latest publish_space() and build_teach_payload() both come from the Teach foundation migration", () => {
    expect(latest.file).toMatch(/^0028_/);
    expect(latestFunctionDefinition(migrations, "build_teach_payload")!.file).toBe(latest.file);
  });

  it("the Retreat branch is byte-for-byte 0025's body once the Teach block is removed (moduleCovers, imagePosition, snapshot shape untouched)", () => {
    expect(TEACH_BLOCK.test(latest.body)).toBe(true);
    expect(norm(latest.body.replace(TEACH_BLOCK, "").replace(TEACH_CUSTOM_PAGES_GATE, "if 'customPages' = any(v_enabled_modules) then"))).toBe(norm(base));
  });

  it("the only edit inside the Retreat branch is the customPages gate, which skips ONLY Teach (retreat and client_hub still emit it)", () => {
    expect(TEACH_CUSTOM_PAGES_GATE.test(latest.body)).toBe(true);
    expect(norm(latest.body).match(/is distinct from 'teach'/g)).toHaveLength(1);
    expect(norm(latest.body)).not.toMatch(/product_type (=|<>|!=) 'retreat'/);
  });

  it("the Retreat branch still emits moduleCovers and imagePosition", () => {
    const body = norm(latest.body);
    expect(body).toContain("'moduleCovers'");
    expect(body).toContain("'imagePosition'");
    expect(body).toContain("'brand', jsonb_build_object(");
  });

  it("the Teach block is the only addition, is gated on product_type = 'teach', and adds only modules.teach", () => {
    const block = TEACH_BLOCK.exec(latest.body)![0];
    expect(norm(block)).toBe("if v_tenant.product_type = 'teach' then v_modules := v_modules || jsonb_build_object('teach', public.build_teach_payload(p_tenant_id)); end if;");
  });

  it("publish_space() keeps its security posture: invoker, pinned search_path, authenticated-only execute", () => {
    const file = stripSqlComments(migrations.find((m) => m.name === latest.file)!.sql);
    const ddl = norm(file.slice(file.lastIndexOf("create or replace function public.publish_space")));
    expect(ddl).toMatch(/security invoker/i);
    expect(ddl).toMatch(/set search_path = public/i);
    expect(ddl).toContain("revoke all on function public.publish_space(uuid) from public;");
    expect(ddl).toContain("revoke execute on function public.publish_space(uuid) from anon;");
    expect(ddl).toContain("grant execute to authenticated".replace("execute to", "execute on function public.publish_space(uuid) to"));
  });

  describe("build_teach_payload()", () => {
    const file = stripSqlComments(migrations.find((m) => m.name === latest.file)!.sql);
    const start = file.indexOf("create or replace function public.build_teach_payload");
    const sql = norm(file.slice(start, file.indexOf("create or replace function public.publish_space")));

    it("is stable, security invoker (RLS applies), pinned search_path and not callable by anon", () => {
      expect(sql).toMatch(/language sql stable security invoker/i);
      expect(sql).toMatch(/set search_path = public/i);
      expect(sql).toContain("revoke execute on function public.build_teach_payload(uuid) from anon;");
      expect(sql).toContain("grant execute on function public.build_teach_payload(uuid) to authenticated;");
    });

    it("publishes every Teach settings singleton and every Teach item module the Guest App reads", () => {
      for (const key of TEACH_SETTINGS_KEYS) expect(sql, `settings key ${key}`).toContain(`'${key}'`);
      for (const key of [...TEACH_ITEM_KEYS, "customPages"]) expect(sql, `item key ${key}`).toContain(`'${key}'`);
    });

    it("never publishes hidden content: disabled availability/custom pages and switched-off Explore modules are filtered", () => {
      expect(sql).toContain("(i.metadata->>'enabled')::boolean");
      expect(sql).toContain("module_configs");
      for (const key of ["teachReadings", "teachAudio", "customPages"]) expect(sql).toContain(`'${key}'`);
    });

    it("rewrites only whole quoted tenant media refs from draft to published, in place (same uploadId folder)", () => {
      expect(sql).toContain("/draft\\.([a-zA-Z0-9]+)\"");
      expect(sql).toContain("'\\1/published.\\2\"'");
    });
  });

  it("every registered type is publishable exactly when it has a complete publish path (retreat + teach); unknown types fail safely", () => {
    const open = SPACE_TYPE_IDS.filter((id) => getPublishAvailability(id).available).sort();
    expect(open).toEqual(["retreat", "teach"]);
    for (const bad of ["client_hub", "mystery", "", null, undefined]) {
      expect(getPublishAvailability(bad as string | null | undefined).available).toBe(false);
    }
  });

  it("migration chain: 0028 is the single Teach migration, 0029 the single Storage-immutability migration, nothing after, main's 0019 untouched, no 0023 gap fill", () => {
    const names = migrations.map((m) => m.name);
    expect(names.filter((n) => n.startsWith("0029_"))).toEqual(["0029_versioned_media_update_deny.sql"]);
    expect(names.some((n) => /^00(3\d|[4-9]\d)_/.test(n))).toBe(false);
    expect(names.filter((n) => n.startsWith("0019_"))).toEqual(["0019_signup_profile.sql"]);
    expect(names.some((n) => n.startsWith("0023_"))).toBe(false);
    expect(names.filter((n) => n.startsWith("0028_"))).toHaveLength(1);
  });
});
