import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TASK 027.5 Phase 3B - Storage RLS audit, pinned as a characterization
 * test of the committed migration (no hosted access). It documents what
 * the tenant-media policies ALLOW today; when a policy follow-up lands,
 * update the "known gap" expectations below deliberately.
 */
const sql = readFileSync(join(process.cwd(), "supabase/migrations/0006_schedule_screen_and_storage.sql"), "utf8");

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

  it("KNOWN GAP: UPDATE (overwrite) is allowed on ANY object path in the member's own tenant folder - versioned/published included", () => {
    const p = policy(POLICIES.update);
    expect(p).toContain("for update");
    // using + with check carry only bucket and membership - nothing about the path shape or draft/published
    expect(p).not.toMatch(/draft|published|teachAudioFile|foldername\(name\)\)\[(2|3|4)\]|array_length/);
  });

  it("DELETE and INSERT carry no path-shape restriction either (members may delete published.* and create any key)", () => {
    for (const name of [POLICIES.delete, POLICIES.insert]) expect(policy(name)).not.toMatch(/draft|published|array_length/);
  });
});
