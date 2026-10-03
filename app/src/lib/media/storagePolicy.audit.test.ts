import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TASK 027.5 Phase 3B - Storage RLS audit, pinned as a characterization
 * test of the committed migration (no hosted access). It documents what
 * the tenant-media policies ALLOW (0006) and how migration 0029 narrows
 * UPDATE for versioned media. Runtime behavior is proven separately by the
 * real-Postgres verification SQL and the env-gated real-stack test.
 */
const sql = readFileSync(join(process.cwd(), "supabase/migrations/0006_schedule_screen_and_storage.sql"), "utf8");
const sql0029 = readFileSync(join(process.cwd(), "supabase/migrations/0029_versioned_media_update_deny.sql"), "utf8");
const code0029 = sql0029
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

function policy(name: string): string {
  const start = sql.indexOf(`create policy "${name}"`);
  expect(start).toBeGreaterThan(-1);
  const next = sql.indexOf("create policy", start + 10);
  return sql.slice(start, next > -1 ? next : sql.length);
}

const POLICIES = {
  select: "tenant members can read their own media",
  insert: "tenant members can upload their own media",
  update: "tenant members can replace their own media",
  delete: "tenant members can delete their own media",
};

describe("tenant-media Storage policies (migration 0006)", () => {
  it("the bucket is private and every policy is authenticated-only and keyed on tenant membership of the FIRST path segment", () => {
    expect(sql).toMatch(/values \('tenant-media', 'tenant-media', false\)/);
    for (const name of Object.values(POLICIES)) {
      const p = policy(name);
      expect(p).toContain("to authenticated");
      expect(p).toContain("bucket_id = 'tenant-media'");
      expect(p).toContain("public.is_tenant_member(((storage.foldername(name))[1])::uuid)");
    }
    expect(sql).not.toMatch(/to anon|to public/);
  });

  it("cross-tenant: no policy has an OR / alternative branch that skips the membership check", () => {
    for (const name of Object.values(POLICIES)) expect(policy(name)).not.toMatch(/\bor\b/i);
  });

  it("0006 itself still grants UPDATE on any path in the member's own tenant folder (0029 narrows it with a restrictive policy, 0006 is never edited)", () => {
    const p = policy(POLICIES.update);
    expect(p).toContain("for update");
    expect(p).not.toMatch(/draft|published|teachAudioFile|foldername\(name\)\)\[(2|3|4)\]|array_length/);
  });

  it("DELETE and INSERT carry no path-shape restriction either (members may delete published.* and create any key)", () => {
    for (const name of [POLICIES.delete, POLICIES.insert]) expect(policy(name)).not.toMatch(/draft|published|array_length/);
  });
});

describe("migration 0029 - versioned media is immutable under Storage UPDATE", () => {
  const policy0029 = code0029.slice(code0029.indexOf('create policy "versioned media is immutable (no overwrite)"'));

  it("adds exactly one policy: RESTRICTIVE, UPDATE-only, authenticated, on storage.objects", () => {
    expect(code0029.match(/create policy/g)).toHaveLength(1);
    expect(policy0029).toContain("on storage.objects");
    expect(policy0029).toMatch(/as restrictive/);
    expect(policy0029).toMatch(/for update/);
    expect(policy0029).toContain("to authenticated");
    expect(policy0029).not.toMatch(/for (select|insert|delete|all)/);
  });

  it("carries the same predicate in USING and WITH CHECK, scoped to tenant-media (other buckets untouched)", () => {
    const pred = /bucket_id <> 'tenant-media'\s+or not public\.is_versioned_media_object\(name\)/g;
    expect(policy0029.match(pred)).toHaveLength(2);
    expect(policy0029).toMatch(/using \(/);
    expect(policy0029).toMatch(/with check \(/);
  });

  it("only creates/drops its own objects: no alteration of 0006 policies, no select/insert/delete policy change", () => {
    expect(code0029).not.toMatch(/(drop|alter) policy (if exists )?"tenant members/);
    expect(code0029).not.toMatch(/drop table|alter table|delete from|update storage|insert into/i);
    expect(code0029.match(/drop policy/g)).toHaveLength(1);
    expect(code0029).toContain('drop policy if exists "versioned media is immutable (no overwrite)"');
  });

  it("the SQL path rule mirrors isVersionedMediaPath: 4 folders + draft|published.<1-8 alnum> filename", () => {
    expect(code0029).toContain("cardinality(storage.foldername(p_name)), 0) = 4");
    expect(code0029).toContain("'^(draft|published)\\.[A-Za-z0-9]{1,8}$'");
    const ts = readFileSync(join(process.cwd(), "src/lib/media/path.ts"), "utf8");
    expect(ts).toContain("/^(draft|published)\\.[A-Za-z0-9]{1,8}$/");
  });

  it("the helper is immutable, SECURITY INVOKER, pinned search_path, and not executable by public/anon", () => {
    const fn = code0029.slice(code0029.indexOf("create or replace function public.is_versioned_media_object"));
    expect(fn).toMatch(/\bimmutable\b/);
    expect(fn).toMatch(/set search_path = ''/);
    expect(fn).not.toMatch(/security definer/i);
    expect(code0029).toMatch(/revoke all on function public\.is_versioned_media_object\(text\) from public, anon/);
    expect(code0029).toMatch(/grant execute on function public\.is_versioned_media_object\(text\) to authenticated, service_role/);
  });
});

