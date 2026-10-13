import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { extractFunctionBody, latestFunctionDefinition, stripSqlComments, type MigrationFile } from "@/lib/spaceTypes/migrationInspect";
import { EMPTY_RETREAT_PROFILE, retreatDatesOf, retreatProfileIsEmpty, retreatProfileSchema } from "@/lib/modules/retreatProfile";
import { buildRetreatDays } from "./retreatDays";

/**
 * TASK 033 P2: the retreat start/end dates reach the Guest App WITHOUT a
 * SQL migration.
 *
 * They are stored inside the existing `retreatProfile` module_settings
 * row. publish_space() copies that row WHOLE into
 * published_spaces.modules.retreatProfile (only rewriting this tenant's
 * draft media paths), so any key inside it is published. This file proves
 * that against the actual SQL of the latest publish_space() and of the
 * definition Production runs today (0034 lineage; Production is at 0035,
 * which does not redefine publish_space), then runs the published value
 * through the real Guest read path.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../supabase/migrations");
const migrations: MigrationFile[] = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((name) => ({ name, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf8") }));

const WHOLE_ROW_PUBLISH =
  /select data into v_payload\s+from public\.module_settings where tenant_id = p_tenant_id and module_key = 'retreatProfile';\s*if v_payload is not null and v_payload <> '\{\}'::jsonb then\s*v_modules := v_modules \|\| jsonb_build_object\(\s*'retreatProfile',\s*regexp_replace\(v_payload::text, v_draft_pattern, v_draft_replace, 'g'\)::jsonb\s*\);\s*end if;/i;

describe("publish_space() publishes the retreatProfile row whole", () => {
  const latest = latestFunctionDefinition(migrations, "publish_space")!;
  const production = extractFunctionBody(migrations.find((m) => m.name.startsWith("0034_"))!.sql, "publish_space")!;

  it("the latest definition copies the whole stored object (no per-key allowlist)", () => {
    expect(stripSqlComments(latest.body)).toMatch(WHOLE_ROW_PUBLISH);
  });

  it("so does the definition Production runs (0034; 0035 does not redefine publish_space)", () => {
    expect(stripSqlComments(production)).toMatch(WHOLE_ROW_PUBLISH);
    const zero35 = stripSqlComments(migrations.find((m) => m.name.startsWith("0035_"))!.sql).toLowerCase();
    expect(zero35).not.toContain("function public.publish_space");
  });

  it("is not gated on module_configs, so the dates publish even when no Explore module is on", () => {
    const body = stripSqlComments(latest.body);
    const at = body.search(WHOLE_ROW_PUBLISH);
    const before = body.slice(Math.max(0, at - 200), at);
    expect(before).not.toMatch(/if 'retreatProfile' = any/i);
  });
});

/** The JS equivalent of the publish rewrite: v_draft_pattern -> v_draft_replace. */
function publishRewrite(stored: unknown, tenantId: string): unknown {
  const pattern = new RegExp(`("${tenantId}/[^"]*)/draft\\.([a-zA-Z0-9]+)"`, "g");
  return JSON.parse(JSON.stringify(stored).replace(pattern, '$1/published.$2"'));
}

describe("the dates survive the published payload parsing", () => {
  const T = "c585f413-fdaf-44c1-994a-83248b180ae8";
  const stored = { tagline: "Come home", whatToBring: ["Mat"], startDate: "2027-10-14", endDate: "2027-10-19" };
  const published = { retreatProfile: publishRewrite(stored, T) };

  it("published-space-screen's retreatProfileSchema keeps both dates", () => {
    const parsed = retreatProfileSchema.parse(published.retreatProfile);
    expect(parsed.startDate).toBe("2027-10-14");
    expect(parsed.endDate).toBe("2027-10-19");
    expect(parsed.tagline).toBe("Come home");
  });

  it("drives the Guest navigator: Oct 14-19 2027 = Day 1-6", () => {
    const { startDate, endDate } = retreatProfileSchema.parse(published.retreatProfile);
    const { days, derived } = buildRetreatDays({ activityDates: ["2027-10-16"], startDate, endDate, todayIso: "2027-10-01" });
    expect(derived).toBe(false);
    expect(days.map((d) => d.dayNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("a dates-only row is published (non-empty) but never makes Home render a profile", () => {
    const datesOnly = retreatProfileSchema.parse({ startDate: "2027-10-14" });
    expect(retreatProfileIsEmpty(datesOnly)).toBe(true);
  });

  it("an older snapshot without dates parses exactly as before", () => {
    expect(retreatProfileSchema.parse({})).toEqual(EMPTY_RETREAT_PROFILE);
    expect(retreatDatesOf(undefined)).toEqual({ startDate: null, endDate: null });
  });

  it("a malformed stored date is dropped without failing the rest of the profile", () => {
    const parsed = retreatProfileSchema.safeParse({ tagline: "x", startDate: "2027-02-30", endDate: 42 });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.tagline).toBe("x");
    expect(parsed.data?.startDate ?? null).toBeNull();
    expect(parsed.data?.endDate ?? null).toBeNull();
  });

  it("retreatDatesOf still reads the dates when another profile field is invalid", () => {
    expect(retreatDatesOf({ whatToBring: [""], startDate: "2027-10-14", endDate: "2027-10-19" })).toEqual({
      startDate: "2027-10-14",
      endDate: "2027-10-19",
    });
  });
});
