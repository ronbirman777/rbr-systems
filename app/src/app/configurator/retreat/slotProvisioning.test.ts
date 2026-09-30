import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Task 021: structural guarantees of the slot-provisioning migration.
 * Real behavior (signup -> row, legacy repair, zero-row preservation,
 * idempotence, concurrency, Flow creation consuming capacity) is proven
 * against a real local Supabase/Postgres by
 * supabase/verification/0026_space_slot_provisioning_verification.sql and
 * 0026_space_slot_provisioning_concurrency.mjs - these tests only lock in
 * the properties that must never silently regress in the SQL text.
 */
const migrationsDir = path.resolve(__dirname, "../../../../supabase/migrations");
const read = (f: string) => readFileSync(path.join(migrationsDir, f), "utf8");
const strip = (sql: string) =>
  sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .toLowerCase();

const m0026 = strip(read("0026_user_space_slot_provisioning.sql"));
const m0017 = strip(read("0017_space_management_slots.sql"));

describe("0026 user space slot provisioning (structure)", () => {
  it("provisions from an AFTER INSERT trigger on auth.users, one row per new account", () => {
    expect(m0026).toMatch(/create trigger on_auth_user_created_space_slot\s+after insert on auth\.users\s+for each row execute function public\.provision_user_space_slot\(\)/);
  });

  it("trigger function is SECURITY DEFINER with a pinned search_path", () => {
    expect(m0026).toMatch(/create or replace function public\.provision_user_space_slot\(\)[\s\S]*?security definer[\s\S]*?set search_path to 'public'/);
  });

  it("inserts only when missing and never overwrites an existing row (idempotent, zero-capacity preserved)", () => {
    expect(m0026).not.toMatch(/on conflict[^;]*do update/);
    expect(m0026).not.toMatch(/\bupdate\s+public\.user_space_slots/);
    expect(m0026).not.toMatch(/\bdelete\s+from/);
    const inserts = m0026.match(/insert into public\.user_space_slots[\s\S]*?;/g) ?? [];
    expect(inserts.length).toBe(2); // trigger body + legacy repair
    for (const stmt of inserts) expect(stmt).toMatch(/on conflict \(user_id\) do nothing/);
  });

  it("does not restate or invent a default capacity in the trigger - the column default (0017) is the single source of truth", () => {
    expect(m0017).toMatch(/slots_allowed integer not null default 1 check \(slots_allowed >= 0\)/);
    const fn = m0026.match(/create or replace function public\.provision_user_space_slot\(\)[\s\S]*?\$\$;/)?.[0] ?? "";
    expect(fn).toMatch(/insert into public\.user_space_slots \(user_id\)\s+values \(new\.id\)/);
    expect(fn).not.toMatch(/slots_allowed/);
  });

  it("legacy repair uses the same GREATEST(1, owned Spaces) formula as the 0017 backfill, so it never creates an over-limit account", () => {
    expect(m0026).toMatch(/greatest\(1, coalesce\(owned\.owned_count, 0\)\)/);
    expect(m0026).toMatch(/where role = 'owner'/);
  });

  it("is product-agnostic: no reference to product_type / Flow / Teach / retreat", () => {
    expect(m0026).not.toMatch(/product_type|flow|teach|retreat|client_hub/);
  });

  it("does not touch commercial entitlements, billing, or the capacity trigger", () => {
    expect(m0026).not.toMatch(/space_entitlements|stripe|billing|enforce_space_slot_capacity/);
  });

  it("trigger function cannot be invoked directly by clients", () => {
    expect(m0026).toMatch(/revoke all on function public\.provision_user_space_slot\(\) from public, anon, authenticated/);
  });

  it("the tenants capacity trigger stays product-agnostic (no product_type gating on slot enforcement)", () => {
    const fn = m0017.match(/create or replace function public\.enforce_space_slot_capacity\(\)[\s\S]*?\$\$;/)?.[0] ?? "";
    expect(fn.length).toBeGreaterThan(0);
    expect(fn).not.toMatch(/product_type/);
  });
});
