import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { readFileSync } from "node:fs";

/**
 * TASK 030 W1.5 - structural guarantees on migration 0034 and on the
 * Studio editor. Behavioural proof of publish/republish immutability runs
 * against a real database (Staging) - see the task report; Postgres is not
 * available to unit tests in this repo.
 */
const MIG = path.resolve(__dirname, "../../../supabase/migrations");
const sql0034 = fs.readFileSync(path.join(MIG, "0034_flow_daily_inspiration.sql"), "utf8");
const sql0033 = fs.readFileSync(path.join(MIG, "0033_flow_content_expansion.sql"), "utf8");
const code = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("migration 0034", () => {
  it("is the next canonical number and changes no schema", () => {
    expect(fs.existsSync(path.join(MIG, "0034_flow_daily_inspiration.sql"))).toBe(true);
    expect(fs.readdirSync(MIG).filter((f) => /^\d{14}/.test(f))).toEqual([]);
    const body = code(sql0034).toLowerCase();
    for (const forbidden of ["create table", "alter table", "drop ", "create policy", "alter policy"]) {
      expect(body).not.toContain(forbidden);
    }
  });

  it("emits dailyInspiration only conditionally, never for Teach, only enabled non-empty items", () => {
    const block = sql0034.slice(sql0034.indexOf("0034 NEW: dailyInspiration"), sql0034.indexOf("0033 NEW: guidelines"));
    expect(block).toContain("'dailyInspiration' = any(v_enabled_modules)");
    expect(block).toContain("is distinct from 'teach'");
    expect(block).toContain("exists (");
    expect(block).toContain("(metadata->>'enabled')::boolean, true) = true");
    expect(block).toContain("order by sort_order, created_at");
    // no unconditional key anywhere else
    expect(sql0034.match(/jsonb_build_object\('dailyInspiration'/g)?.length).toBe(1);
  });

  it("restates 0033's publish_space() unchanged apart from the one added block", () => {
    const fn = (s: string) => code(s).slice(code(s).indexOf("create or replace function public.publish_space"));
    const added = code(sql0034).slice(code(sql0034).indexOf("if 'dailyInspiration'"), code(sql0034).indexOf("if 'guidelines'"));
    expect(fn(sql0034).replace(added, "")).toBe(fn(sql0033));
  });

  it("does not touch build_teach_payload or the Teach guard", () => {
    expect(code(sql0034)).not.toContain("create or replace function public.build_teach_payload");
    expect(code(sql0034)).toContain("v_tenant.product_type = 'teach'");
  });

  it("has a rollback that restores 0033's definition", () => {
    const rb = fs.readFileSync(path.resolve(__dirname, "../../../supabase/verification/0034_flow_daily_inspiration_rollback.sql"), "utf8");
    expect(code(rb)).not.toContain("dailyInspiration");
    expect(code(rb)).toContain("create or replace function public.publish_space");
  });
});

describe("Studio editor semantics", () => {
  const src = readFileSync(path.resolve(__dirname, "../../app/(site)/configurator/retreat/daily-inspiration-step.tsx"), "utf8");
  it("labels every field and exposes keyboard-operable controls", () => {
    expect(src).toContain("StudioField label={t(\"flow\", \"inspirationTextLabel\")}");
    expect(src).toContain("StudioField label={t(\"flow\", \"inspirationLabelLabel\")}");
    expect(src).toContain('aria-label={t("studio", "moveUp")}');
    expect(src).toContain('aria-label={t("studio", "moveDown")}');
    expect(src).toContain("aria-expanded={isEditing}");
    expect(src).toContain('type="checkbox"');
    expect(src).toContain("min-h-11"); // visible-to-guests row and Add button
  });
  it("uses the shared 44px hit-area classes and no hover-only controls", () => {
    expect(src).toContain("STUDIO_REORDER_BUTTON_CLASS");
    expect(src).toContain("STUDIO_REORDER_COLUMN_CLASS");
    expect(src).toContain("STUDIO_HIT_ROW_CLASS");
    expect(src).not.toContain("opacity-0");
  });
  it("leaves organizer text untranslated and bidi-safe", () => {
    expect((src.match(/dir="auto"/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
  it("is wired into the shared unsaved-changes guard and the preview", () => {
    expect(src).toContain("useRegisteredSave(registerSave, handleSave)");
    const cfg = readFileSync(path.resolve(__dirname, "../../app/(site)/configurator/retreat/retreat-configurator.tsx"), "utf8");
    expect((cfg.match(/dailyInspirations=\{visibleInspirations\(dailyInspirations\)\}/g) ?? []).length).toBe(2);
    expect(cfg).toContain("moduleSectionProps.dailyInspiration");
  });
  it("saves the draft only: the action writes module_items, never published_spaces", () => {
    const actions = readFileSync(path.resolve(__dirname, "../../app/(site)/configurator/retreat/actions.ts"), "utf8");
    const fnSrc = actions.slice(actions.indexOf("export async function saveDailyInspiration"), actions.indexOf("The envelope a Readings/Audio row"));
    expect(fnSrc).toContain("saveModuleItemsGeneric");
    expect(fnSrc).not.toContain("published_spaces");
    expect(fnSrc).toContain("metadata: { enabled: item.enabled }");
  });
});
