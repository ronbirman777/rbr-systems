import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { extractFunctionBody, latestFunctionDefinition, stripSqlComments, type MigrationFile } from "./migrationInspect";

/**
 * TASK 032 rollback guard (docs/billing/MIGRATION-RECOVERY.md).
 *
 * Static checks only - nothing here touches a database:
 *  - every TASK 032 migration (0036-0042) has a rollback file in supabase/verification/;
 *  - a rollback that restores a function restated by 0038/0039/0042 restores EXACTLY the body of the
 *    migration that defined that function before (found mechanically, not hard-coded);
 *  - every object a migration creates is dropped by its rollback;
 *  - rollbacks are transactional, confirmation-gated and never use CASCADE.
 */

const ROOT = path.resolve(__dirname, "../../../supabase");
const read = (dir: string): MigrationFile[] =>
  fs
    .readdirSync(path.join(ROOT, dir))
    .filter((f) => f.endsWith(".sql"))
    .map((name) => ({ name, sql: fs.readFileSync(path.join(ROOT, dir, name), "utf8") }));
const migrations = read("migrations");
const num = (name: string) => Number(/^(\d+)_/.exec(name)?.[1] ?? -1);
const migration = (n: string) => migrations.find((m) => m.name.startsWith(`${n}_`))!;

const TASK032 = ["0036", "0037", "0038", "0039", "0040", "0041", "0042"] as const;
const rollbackPath = (n: string) =>
  path.join(ROOT, "verification", migration(n).name.replace(/\.sql$/, "_rollback.sql"));
const rollback = (n: string) => fs.readFileSync(rollbackPath(n), "utf8");
const code = (sql: string) => stripSqlComments(sql).toLowerCase();

/** The definition in force immediately before migration `n` (latest among migrations numbered below it). */
const previousDefinition = (fn: string, n: string) =>
  latestFunctionDefinition(
    migrations.filter((m) => num(m.name) < Number(n)),
    fn
  );

/** Raw body text between the $$ markers of the LAST `create or replace function public.<fn>(` - comments kept. */
function rawBody(sql: string, fn: string): string {
  const i = sql.toLowerCase().lastIndexOf(`create or replace function public.${fn}(`);
  const open = sql.indexOf("$$", i);
  return sql.slice(open + 2, sql.indexOf("$$", open + 2));
}

/** md5 of what pg_get_functiondef() prints for these definitions (the form the recorded fingerprints use). */
function functiondefMd5(signature: string, returns: string, attrs: string[], body: string): string {
  const def = `CREATE OR REPLACE FUNCTION public.${signature}\n RETURNS ${returns}\n${attrs.map((a) => ` ${a}\n`).join("")}AS $function$${body}$function$\n`;
  return createHash("md5").update(def).digest("hex");
}

describe("TASK 032 rollback files", () => {
  for (const n of TASK032) {
    it(`${n} has a rollback file next to the other verification scripts`, () => {
      expect(fs.existsSync(rollbackPath(n)), rollbackPath(n)).toBe(true);
    });

    it(`${n}'s rollback is one transaction, confirmation-gated, and never uses CASCADE`, () => {
      const c = code(rollback(n));
      expect(c).toMatch(/^\s*begin;/m);
      expect(c).toMatch(/^\s*commit;/m);
      expect(c.indexOf("begin;")).toBeLessThan(c.indexOf("commit;"));
      expect(c).toContain("current_setting('idw.rollback_confirm', true)");
      expect(c).not.toMatch(/\bcascade\b/);
      // The rollback refuses while paid checkout is on or a live subscription exists.
      expect(c).toContain("paid_checkout_enabled");
      expect(c).toContain("status not in ('exempt', 'canceled', 'incomplete_expired')");
    });

    it(`${n}'s rollback drops every object ${n} creates`, () => {
      const mig = code(migration(n).sql);
      const rb = code(rollback(n));
      const droppedTables = [...rb.matchAll(/drop table public\.(\w+)/g)].map((m) => m[1]);
      for (const [, fn] of mig.matchAll(/\bcreate function public\.(\w+)\s*\(/g)) {
        expect(rb, `function ${fn}`).toContain(`drop function public.${fn}(`);
      }
      for (const [, t] of mig.matchAll(/\bcreate table public\.(\w+)/g)) {
        expect(droppedTables, `table ${t}`).toContain(t);
      }
      for (const [, name, table] of mig.matchAll(/\bcreate policy ("[^"]+")\s+on ([\w.]+)/g)) {
        const viaTable = table.startsWith("public.") && droppedTables.includes(table.slice("public.".length));
        expect(viaTable || rb.includes(`drop policy ${name} on ${table};`), `policy ${name} on ${table}`).toBe(true);
      }
      for (const [, trg, table] of mig.matchAll(/\bcreate trigger (\w+)\s+(?:before|after)[^;]*?\bon public\.(\w+)/g)) {
        expect(droppedTables.includes(table) || rb.includes(`drop trigger ${trg} on public.${table};`), `trigger ${trg}`).toBe(true);
      }
      for (const [, col] of mig.matchAll(/\badd column (\w+)/g)) {
        expect(rb, `column ${col}`).toContain(`drop column ${col};`);
      }
    });
  }

  it("0039's header points at a rollback file that exists", () => {
    const ref = /verification\/(0039_[\w]+_rollback\.sql)/.exec(migration("0039").sql)?.[1];
    expect(ref).toBeDefined();
    expect(fs.existsSync(path.join(ROOT, "verification", ref!))).toBe(true);
  });

  it("each rollback (except the first) refuses until the next-later rollback has run", () => {
    const later: Record<string, string> = {
      "0041": "billing_locked", // 0042 (its restated restore_space/replace_space carry hint BILLING_LOCKED)
      "0040": "public.billing_claim_event(", // 0041
      "0039": "public.billing_invoices", // 0040
      "0038": "billing allows studio writes", // 0039
      "0037": "public.billing_provision_paid_space(", // 0038
      "0036": "public.billing_reserve_coupon(", // 0037
    };
    for (const [n, marker] of Object.entries(later)) {
      const guard = code(rollback(n)).split("$$")[1] ?? "";
      expect(guard, `${n} guard`).toContain(marker);
    }
  });
});

describe("restated functions are restored to their previous definition, byte for byte", () => {
  const RESTORED = [
    { rb: "0039", fn: "publish_space", expectedPrevious: /^0034_/ },
    { rb: "0038", fn: "handle_new_tenant", expectedPrevious: /^0001_/ },
    { rb: "0038", fn: "enforce_space_slot_capacity", expectedPrevious: /^0017_/ },
    { rb: "0042", fn: "restore_space", expectedPrevious: /^0017_/ },
    { rb: "0042", fn: "replace_space", expectedPrevious: /^0027_/ },
  ] as const;

  for (const { rb, fn, expectedPrevious } of RESTORED) {
    it(`${rb}'s rollback restores ${fn}() exactly as the migration before ${rb} defined it`, () => {
      // The migration being rolled back really does restate it...
      expect(extractFunctionBody(migration(rb).sql, fn), `${rb} restates ${fn}`).not.toBeNull();
      // ...and the previous definition is found mechanically.
      const prev = previousDefinition(fn, rb)!;
      expect(prev, `no definition of ${fn} before ${rb}`).not.toBeNull();
      expect(prev.file).toMatch(expectedPrevious);
      const restored = extractFunctionBody(rollback(rb), fn);
      expect(restored).toBe(prev.body);
      // Raw text too (comments included), so md5(prosrc) after the rollback equals the earlier one.
      const prevSql = migrations.find((m) => m.name === prev.file)!.sql;
      expect(rawBody(rollback(rb), fn)).toBe(rawBody(prevSql, fn));
      // And it is NOT the TASK 032 body.
      expect(restored).not.toBe(extractFunctionBody(migration(rb).sql, fn));
    });
  }

  it("the restored publish_space() has no billing guard and keeps 0034's security posture and grants", () => {
    const c = code(rollback("0039"));
    const body = extractFunctionBody(rollback("0039"), "publish_space")!;
    expect(body).not.toContain("space_access_state");
    expect(body).not.toContain("v_access");
    expect(body).toContain("from public.space_entitlements where tenant_id = p_tenant_id");
    const ddl = c.slice(c.lastIndexOf("create or replace function public.publish_space"));
    expect(ddl).toMatch(/security invoker/);
    expect(ddl).toMatch(/set search_path = public/);
    expect(ddl).toContain("revoke all on function public.publish_space(uuid) from public;");
    expect(ddl).toContain("revoke execute on function public.publish_space(uuid) from anon;");
    expect(ddl).toContain("grant execute on function public.publish_space(uuid) to authenticated;");
  });

  it("the restored trigger functions keep security definer + search_path public", () => {
    const c = code(rollback("0038"));
    for (const fn of ["handle_new_tenant", "enforce_space_slot_capacity"]) {
      const start = c.indexOf(`create or replace function public.${fn}()`);
      const header = c.slice(start, c.indexOf("$$", start));
      expect(header, fn).toMatch(/returns trigger\s+language plpgsql\s+security definer\s+set search_path (=|to) '?public'?/);
    }
    // The restored slot trigger no longer reads the billing flag (dropped by the same rollback).
    expect(extractFunctionBody(rollback("0038"), "enforce_space_slot_capacity")).not.toContain("billing_is_paid_checkout_required");
    // ...and is restored BEFORE the function it used to call is dropped.
    expect(c.indexOf("create or replace function public.enforce_space_slot_capacity()")).toBeLessThan(
      c.indexOf("drop function public.billing_is_paid_checkout_required(")
    );
  });

  it("restored definitions reproduce the recorded pre-TASK-032 catalog fingerprints (pg_get_functiondef md5)", () => {
    // Recorded read-only: Production publish_space before 0036 (tasks/031/production-baseline.md),
    // Staging trigger functions before 0028 (tasks/staging-pre0028/public-functions.txt).
    const rb39 = rollback("0039");
    const rb38 = rollback("0038");
    expect(
      functiondefMd5("publish_space(p_tenant_id uuid)", "timestamp with time zone", ["LANGUAGE plpgsql", "SET search_path TO 'public'"], rawBody(rb39, "publish_space"))
    ).toBe("5088d120877f74c02f845df398206c14");
    const definer = ["LANGUAGE plpgsql", "SECURITY DEFINER", "SET search_path TO 'public'"];
    expect(functiondefMd5("handle_new_tenant()", "trigger", definer, rawBody(rb38, "handle_new_tenant"))).toBe("e3526abc627aa30a11616295c39cebef");
    expect(functiondefMd5("enforce_space_slot_capacity()", "trigger", definer, rawBody(rb38, "enforce_space_slot_capacity"))).toBe(
      "708dde46d74624be4cb93b48d4972991"
    );
  });
});

/**
 * TASK 032 (0042): restore_space()/replace_space() are restated with ADDITIVE, marked blocks only.
 * Removing exactly the marked blocks must give back the previous definition's raw text (comments
 * included), so nothing else in either function can have changed.
 */
const MARKED_0042 = /[ \t]*-- >>> TASK 032 \(0042\)[\s\S]*?-- <<< TASK 032 \(0042\)\n\n/g;

describe("0042 restates restore_space() / replace_space() with marked billing guards only", () => {
  const m42 = migration("0042").sql;

  for (const [fn, prevFile, blocks] of [["restore_space", /^0017_/, 2], ["replace_space", /^0027_/, 1]] as const) {
    it(`${fn}(): 0042's body minus the ${blocks} marked block(s) is the previous body, byte for byte`, () => {
      const prev = previousDefinition(fn, "0042")!;
      expect(prev.file).toMatch(prevFile);
      const raw = rawBody(m42, fn);
      expect([...raw.matchAll(MARKED_0042)]).toHaveLength(blocks);
      const prevSql = migrations.find((m) => m.name === prev.file)!.sql;
      expect(raw.replace(MARKED_0042, "")).toBe(rawBody(prevSql, fn));
      // ...and it really is a change (the guard is there).
      expect(raw).not.toBe(rawBody(prevSql, fn));
      expect(raw).toContain("hint = 'BILLING_LOCKED'");
    });

    it(`${fn}(): 0042 keeps the signature, security definer, the pinned search_path and the grants`, () => {
      const c = code(m42);
      const start = c.indexOf(`create or replace function public.${fn}(`);
      const header = c.slice(start, c.indexOf("$$", start));
      expect(header).toMatch(/returns void\s+language plpgsql\s+security definer\s+set search_path to 'public'\s+as $/);
      const sig = fn === "restore_space" ? "uuid" : "uuid, text";
      expect(header.startsWith(`create or replace function public.${fn}(p_tenant_id uuid${fn === "replace_space" ? ", p_new_name text" : ""})`)).toBe(true);
      expect(c).toContain(`revoke all on function public.${fn}(${sig}) from public, anon;`);
      expect(c).toContain(`grant execute on function public.${fn}(${sig}) to authenticated;`);
      expect(c).not.toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to (anon|public)`));
    });
  }

  it("0042 does not touch archive_space() and creates no new object", () => {
    const c = code(m42);
    expect(c).not.toContain("archive_space");
    expect(c).not.toMatch(/\bcreate (function|table|policy|trigger|index)\b/);
    expect(c).not.toMatch(/\b(drop|alter table)\b/);
  });

  it("restore_space(): billing-governed Spaces skip the slot check and need a writable Studio; the legacy re-count is flag-gated", () => {
    const body = extractFunctionBody(m42, "restore_space")!.replace(/\s+/g, " ");
    // The billing branch comes before the legacy slot bootstrap/lock and returns on its own.
    const billing = body.indexOf("if coalesce((select a.decided from public.space_access_state(p_tenant_id) a), false) then");
    expect(billing).toBeGreaterThan(body.indexOf("is_tenant_owner(p_tenant_id)"));
    expect(billing).toBeLessThan(body.indexOf("insert into public.user_space_slots"));
    expect(body.slice(billing, body.indexOf("insert into public.user_space_slots"))).toMatch(
      /if not public\.space_studio_writable\(p_tenant_id\) then raise exception .* hint = 'BILLING_LOCKED'; end if; update public\.tenants .* return; end if;/
    );
    // Flag OFF keeps the original count (it is still there, unchanged); the legacy-only count runs only when paid checkout is ON.
    expect(body).toContain("select count(*) into v_used from public.tenant_members where user_id = v_user and role = 'owner';");
    expect(body).toMatch(
      /if public\.billing_is_paid_checkout_required\(\) then select count\(\*\) into v_used from public\.tenant_members tm where tm\.user_id = v_user and tm\.role = 'owner' and not coalesce\(\(select a\.decided from public\.space_access_state\(tm\.tenant_id\) a\), false\); end if;/
    );
  });

  it("replace_space(): the billing guard runs before anything is deleted", () => {
    const body = extractFunctionBody(m42, "replace_space")!;
    const guard = body.indexOf("if not public.space_studio_writable(p_tenant_id) then");
    expect(guard).toBeGreaterThan(body.indexOf("is_tenant_owner(p_tenant_id)"));
    expect(guard).toBeLessThan(body.indexOf("delete from public.published_spaces"));
  });

  it("the 0042 rollback restores the recorded pre-TASK-032 fingerprints (pg_get_functiondef md5, Staging before 0028)", () => {
    const rb42 = rollback("0042");
    const definer = ["LANGUAGE plpgsql", "SECURITY DEFINER", "SET search_path TO 'public'"];
    expect(functiondefMd5("restore_space(p_tenant_id uuid)", "void", definer, rawBody(rb42, "restore_space"))).toBe("9a31bcf90162a2ce7001078d1fdbcfa0");
    expect(functiondefMd5("replace_space(p_tenant_id uuid, p_new_name text)", "void", definer, rawBody(rb42, "replace_space"))).toBe(
      "3a2af65a96d60ac2dfc90ee6f73d5236"
    );
  });

  it("the 0042 rollback is a restore only: it drops nothing and leaves archive_space() alone", () => {
    const c = code(rollback("0042"));
    expect(c).not.toMatch(/\bdrop\b/);
    expect(c).not.toContain("archive_space");
    expect(extractFunctionBody(rollback("0042"), "restore_space")).not.toContain("space_access_state");
    expect(extractFunctionBody(rollback("0042"), "replace_space")).not.toContain("space_studio_writable");
  });
});

describe("the rollback checks themselves catch a wrong restore", () => {
  it("a body copied from an older migration is not the previous definition", () => {
    const older = extractFunctionBody(migration("0033").sql, "publish_space");
    expect(older).not.toBe(previousDefinition("publish_space", "0039")!.body);
  });

  it("previousDefinition ignores the migration being rolled back and anything later", () => {
    expect(previousDefinition("publish_space", "0039")!.file).toMatch(/^0034_/);
    expect(previousDefinition("handle_new_tenant", "0038")!.file).toMatch(/^0001_/);
    expect(previousDefinition("handle_new_tenant", "0039")!.file).toMatch(/^0038_/);
  });
});
