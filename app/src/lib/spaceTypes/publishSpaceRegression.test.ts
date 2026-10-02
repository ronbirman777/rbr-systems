import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SPACE_TYPE_IDS, SPACE_TYPES, requiredPublishBuilders } from "./registry";
import {
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
