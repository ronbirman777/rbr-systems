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
/** TASK 028A's addition: the product-neutral spaceSettings object. */
const SPACE_SETTINGS_BLOCK = /v_modules := v_modules \|\| jsonb_build_object\(\s*'spaceSettings',[\s\S]*?\);/i;
/** TASK 028B's addition: the shared brand Surface/Tint role. */
const SURFACE_SELECT = /custom_navigation, custom_text, custom_surface,/i;
const SURFACE_EMIT = /,\s*(?:--[^\n]*\n\s*)*'customSurface', v_brand\.custom_surface/i;

/**
 * TASK 029's additions (0033, the Flow content expansion). Each is listed
 * here so `strip0033()` can take the 0033 body back to 0032's exactly -
 * which is what proves 0033 added blocks and changed nothing else.
 *
 * The two SETTINGS blocks are deliberately matched INCLUDING their
 * `v_payload <> '{}'::jsonb` guard: that guard is the whole reason an
 * existing Space's snapshot is byte-identical after 0033, so a later edit
 * that drops it must fail this test rather than quietly change every
 * published payload.
 */
const DRAFT_REWRITE_LOCALS = /\s*v_draft_pattern text := [^;]+;\s*v_draft_replace text := [^;]+;/;
const JSONB_PICK_MERGE = / \|\| public\.jsonb_pick\(metadata, array\[[^\]]*\]\)/g;
const FACILITY_SHORT_MERGE = / \|\| case when subtitle is null then '\{\}'::jsonb else jsonb_build_object\('shortDescription', subtitle\) end/;
const COVER_ALLOWLIST_0033 = /and module_key in \(\s*'meals', 'treatments', 'facilities', 'arrivalInfo', 'faq', 'stayConnected',\s*'readings', 'audio', 'guidelines'\s*\);/;
const COVER_ALLOWLIST_0032 = "and module_key in ('meals', 'treatments', 'facilities', 'arrivalInfo', 'faq', 'stayConnected');";
const moduleBlock = (key: string) => new RegExp(`if '${key}' = any\\(v_enabled_modules\\) then[\\s\\S]*?end if;`, "i");
const settingsBlock0033 = (key: string) =>
  new RegExp(
    `select data into v_payload\\s+from public\\.module_settings where tenant_id = p_tenant_id and module_key = '${key}';` +
      `\\s*if v_payload is not null and v_payload <> '\\{\\}'::jsonb then[\\s\\S]*?end if;`,
    "i"
  );
const ZERO33_NEW_MODULES = ["guidelines", "readings", "audio"] as const;
const ZERO33_NEW_SETTINGS = ["retreatProfile", "moduleIntros"] as const;

/** 0033's body minus every block and merge 0033 introduced. */
function strip0033(body: string): string {
  let out = body.replace(DRAFT_REWRITE_LOCALS, "");
  for (const k of ZERO33_NEW_MODULES) out = out.replace(moduleBlock(k), "");
  for (const k of ZERO33_NEW_SETTINGS) out = out.replace(settingsBlock0033(k), "");
  return out
    .replace(JSONB_PICK_MERGE, "")
    .replace(FACILITY_SHORT_MERGE, "")
    .replace(COVER_ALLOWLIST_0033, COVER_ALLOWLIST_0032);
}

/**
 * TASK 030 W1.5's addition (0034): the one conditional dailyInspiration
 * block. Stripping it takes the 0034 body back to 0033's exactly, which is
 * what proves 0034 added that block and changed nothing else.
 */
const DAILY_INSPIRATION_BLOCK_0034 = /if 'dailyInspiration' = any\(v_enabled_modules\)[\s\S]*?end if;/i;
const strip0034 = (body: string) => body.replace(DAILY_INSPIRATION_BLOCK_0034, "");

describe("0028: Teach foundation on top of 0025's publish_space() (TASK 027.5 Phase 4A)", () => {
  const latest = latestFunctionDefinition(migrations, "publish_space")!;
  const base = extractFunctionBody(migrations.find((m) => m.name.startsWith("0025_"))!.sql, "publish_space")!;
  // build_teach_payload() is still owned by 0028; 0031 redefines only
  // publish_space(), so the Teach-payload assertions below keep reading
  // the file that actually defines it.
  const teachPayload = latestFunctionDefinition(migrations, "build_teach_payload")!;

  it("build_teach_payload() still comes from the Teach foundation migration and nothing later redefines it", () => {
    expect(teachPayload.file).toMatch(/^0028_/);
  });

  it("publish_space() is last redefined by 0034", () => {
    expect(latest.file).toMatch(/^0034_/);
  });

  it("0034's body is 0033's plus only the conditional dailyInspiration block", () => {
    const zero33 = extractFunctionBody(migrations.find((m) => m.name.startsWith("0033_"))!.sql, "publish_space")!;
    expect(DAILY_INSPIRATION_BLOCK_0034.test(latest.body)).toBe(true);
    expect(norm(strip0034(latest.body))).toBe(norm(zero33));
    // Conditional on the module, never emitted for Teach, never unguarded.
    const block = norm(DAILY_INSPIRATION_BLOCK_0034.exec(latest.body)![0]);
    expect(block).toContain("and v_tenant.product_type is distinct from 'teach'");
    expect(block).toContain("exists (");
  });

  it("0032's own body is still 0031 plus only the shared Surface role", () => {
    // Read 0032 directly rather than through `latest`: once a later
    // migration takes the head, this step of the chain still has to hold.
    const zero32 = extractFunctionBody(migrations.find((m) => m.name.startsWith("0032_"))!.sql, "publish_space")!;
    const zero31 = extractFunctionBody(migrations.find((m) => m.name.startsWith("0031_"))!.sql, "publish_space")!;
    expect(SURFACE_SELECT.test(zero32)).toBe(true);
    expect(SURFACE_EMIT.test(zero32)).toBe(true);
    const stripped = zero32.replace(SURFACE_SELECT, "custom_navigation, custom_text,").replace(SURFACE_EMIT, "");
    expect(norm(stripped)).toBe(norm(zero31));
  });

  it("0033's body is 0032's plus only the Flow content-expansion blocks", () => {
    const zero32 = extractFunctionBody(migrations.find((m) => m.name.startsWith("0032_"))!.sql, "publish_space")!;
    expect(norm(strip0033(strip0034(latest.body)))).toBe(norm(zero32));
  });

  it("each new 0033 module publishes only while switched on in module_configs", () => {
    for (const key of ZERO33_NEW_MODULES) {
      expect(moduleBlock(key).test(latest.body), key).toBe(true);
      const block = norm(moduleBlock(key).exec(latest.body)![0]);
      expect(block, key).toContain(`module_key = '${key}'`);
      expect(block, key).toContain(`jsonb_build_object('${key}', v_payload)`);
    }
  });

  it("each new 0033 settings object publishes only when its row is non-empty", () => {
    // This is the backward-compatibility guarantee in code: an existing
    // Space with no such row gets no such key, so its snapshot does not
    // change the day 0033 ships.
    for (const key of ZERO33_NEW_SETTINGS) {
      expect(settingsBlock0033(key).test(latest.body), key).toBe(true);
      const block = norm(settingsBlock0033(key).exec(latest.body)![0]);
      expect(block, key).toContain("v_payload is not null and v_payload <> '{}'::jsonb");
      expect(block, key).toContain(`jsonb_build_object(`);
    }
  });

  it("every new 0033 field is merged in, never emitted as a null placeholder", () => {
    // `'longBio', metadata->>'longBio'` would write "longBio": null into
    // every existing facilitator. jsonb_pick returns only the keys that
    // are present, which is why none of these may be plain emissions.
    for (const field of ["longBio", "price", "currency", "chargeType", "availability", "whatToBring", "whatToExpect"]) {
      expect(norm(latest.body), field).not.toContain(`'${field}', metadata->`);
    }
    expect([...norm(latest.body).matchAll(/public\.jsonb_pick\(metadata, array\[/g)]).toHaveLength(3);
    // Facilities' shortDescription is a CONDITIONAL merge, not an
    // emission. Treatments has emitted `'shortDescription', subtitle`
    // unconditionally since 0008 and still must - every treatment row
    // already carried that key - so the check is scoped to the facilities
    // block rather than the whole body.
    const facilities = norm(moduleBlock("facilities").exec(latest.body)![0]);
    expect(FACILITY_SHORT_MERGE.test(latest.body)).toBe(true);
    expect(facilities).toContain("case when subtitle is null then '{}'::jsonb");
    expect(facilities).not.toMatch(/'shortDescription', subtitle(?!\) end)/);
    expect(norm(moduleBlock("treatments").exec(latest.body)![0])).toContain("'shortDescription', subtitle,");
  });

  it("0033 adds no table and no destructive statement", () => {
    const sql = stripSqlComments(migrations.find((m) => m.name.startsWith("0033_"))!.sql).toLowerCase();
    expect(sql).not.toMatch(/\bcreate\s+(or\s+replace\s+)?(unlogged\s+|temp\w*\s+)?table\b/);
    expect(sql).not.toMatch(/\bdrop\b/);
    expect(sql).not.toMatch(/\btruncate\b/);
    expect(sql).not.toMatch(/\bdelete\s+from\b/);
    expect(sql).not.toMatch(/\balter\s+column\b/);
    expect(sql).not.toMatch(/\brename\b/);
    expect(sql).not.toMatch(/\bsecurity\s+definer\b/);
    // Exactly one ALTER TABLE, and it is the additive column.
    const alters = sql.match(/alter\s+table[^;]*;/g) ?? [];
    expect(alters).toHaveLength(1);
    expect(norm(alters[0]!)).toBe(
      "alter table public.schedule_items add column if not exists metadata jsonb not null default '{}'::jsonb;"
    );
    // The only UPDATE is the pre-existing one inside publish_space().
    expect(sql.match(/update\s+public\./g) ?? []).toHaveLength(1);
  });

  it("jsonb_pick() is a pure projection helper: immutable, invoker, pinned, not callable by anon", () => {
    const sql = norm(stripSqlComments(migrations.find((m) => m.name.startsWith("0033_"))!.sql));
    const start = sql.indexOf("create or replace function public.jsonb_pick");
    const ddl = sql.slice(start, sql.indexOf("create or replace function public.publish_space", start));
    expect(ddl).toMatch(/language sql immutable parallel safe security invoker/i);
    expect(ddl).toMatch(/set search_path = public/i);
    expect(ddl).toContain("revoke all on function public.jsonb_pick(jsonb, text[]) from public;");
    expect(ddl).toContain("revoke execute on function public.jsonb_pick(jsonb, text[]) from anon;");
    expect(ddl).toContain("grant execute on function public.jsonb_pick(jsonb, text[]) to authenticated;");
    // No table may be reachable from it - it only ever walks its argument.
    expect(ddl).not.toMatch(/\bfrom public\./);
    expect(ddl).not.toMatch(/\bauth\.|\bstorage\./);
  });

  it("0031's own body is still 0028 plus only the Space Settings block", () => {
    const zero31 = extractFunctionBody(migrations.find((m) => m.name.startsWith("0031_"))!.sql, "publish_space")!;
    const zero28 = extractFunctionBody(migrations.find((m) => m.name.startsWith("0028_"))!.sql, "publish_space")!;
    expect(SPACE_SETTINGS_BLOCK.test(zero31)).toBe(true);
    expect(norm(zero31.replace(SPACE_SETTINGS_BLOCK, ""))).toBe(norm(zero28));
  });

  it("the Surface role is a brand column, never Teach content", () => {
    // build_teach_payload must not learn about it: surface is a brand
    // role that every product shares, not Teach-specific content.
    const teachSql = migrations.find((m) => m.name === teachPayload.file)!.sql;
    const start = teachSql.indexOf("create or replace function public.build_teach_payload");
    const fn = teachSql.slice(start, teachSql.indexOf("create or replace function public.publish_space"));
    expect(fn).not.toContain("custom_surface");
    expect(fn).not.toContain("customSurface");
  });

  it("the Space Settings block is product-neutral and adds only modules.spaceSettings", () => {
    const block = SPACE_SETTINGS_BLOCK.exec(latest.body)![0];
    // Unconditional on purpose: country/locale are not product specific.
    expect(norm(block)).not.toMatch(/product_type/);
    expect(norm(block)).toContain("'spaceSettings'");
    expect(norm(block)).toContain("module_key = 'spaceSettings'");
    // Absent row publishes '{}', so no Space needs a backfill.
    expect(norm(block)).toContain("'{}'::jsonb");
  });

  it("the Retreat branch is byte-for-byte 0025's body once every later additive block is removed (moduleCovers, imagePosition, snapshot shape untouched)", () => {
    expect(TEACH_BLOCK.test(latest.body)).toBe(true);
    const retreatOnly = strip0033(strip0034(latest.body))
      .replace(TEACH_BLOCK, "")
      .replace(SPACE_SETTINGS_BLOCK, "")
      .replace(SURFACE_SELECT, "custom_navigation, custom_text,")
      .replace(SURFACE_EMIT, "")
      .replace(TEACH_CUSTOM_PAGES_GATE, "if 'customPages' = any(v_enabled_modules) then");
    expect(norm(retreatOnly)).toBe(norm(base));
  });

  it("the only edit inside the Retreat branch is the customPages gate, which skips ONLY Teach (retreat and client_hub still emit it)", () => {
    expect(TEACH_CUSTOM_PAGES_GATE.test(latest.body)).toBe(true);
    expect(norm(strip0034(latest.body)).match(/is distinct from 'teach'/g)).toHaveLength(1);
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
    const file = stripSqlComments(migrations.find((m) => m.name === teachPayload.file)!.sql);
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

  it("migration chain: one migration per number, 0034 is the head, main's 0019 untouched, the 0023 gap is never filled", () => {
    const names = migrations.map((m) => m.name);
    expect(names.filter((n) => n.startsWith("0028_"))).toEqual(["0028_teach_foundation.sql"]);
    expect(names.filter((n) => n.startsWith("0029_"))).toEqual(["0029_versioned_media_update_deny.sql"]);
    expect(names.filter((n) => n.startsWith("0030_"))).toEqual(["0030_tenant_media_policies_uuid_safe.sql"]);
    expect(names.filter((n) => n.startsWith("0031_"))).toEqual(["0031_space_settings_publish.sql"]);
    expect(names.filter((n) => n.startsWith("0032_"))).toEqual(["0032_brand_surface.sql"]);
    expect(names.filter((n) => n.startsWith("0033_"))).toEqual(["0033_flow_content_expansion.sql"]);
    // Nothing beyond the current head, and historical numbers are never
    // renumbered or back-filled.
    expect(names.filter((n) => n.startsWith("0034_"))).toEqual(["0034_flow_daily_inspiration.sql"]);
    expect(names.some((n) => /^00(3[5-9]|[4-9]\d)_/.test(n))).toBe(false);
    expect(names.filter((n) => n.startsWith("0019_"))).toEqual(["0019_signup_profile.sql"]);
    expect(names.some((n) => n.startsWith("0023_"))).toBe(false);
  });
});
