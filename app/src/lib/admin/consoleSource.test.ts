import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_SECTIONS } from "./sections";

/**
 * Source-level guarantees for the Admin console (Batch 1):
 *  - privacy: no Admin code reads guest_access_ip_attempts (ADMIN-METRIC-CONTRACTS.md §1.4);
 *  - exact counts: console queries never cap a read with .limit(n) (only .limit(0) for row-less counts);
 *  - missing is not zero: no `?? 0` / `|| 0` fallbacks on console values;
 *  - every section in the nav has a page that gates itself with that section's roles;
 *  - owner emails are resolved only on the Space detail page, after the audited view.
 */
const SRC = join(process.cwd(), "src");
const files = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
};
const ADMIN_LIB = join(SRC, "lib/admin");
const BILLING_ADMIN_LIB = join(SRC, "lib/billing/admin");
const ADMIN_APP = join(SRC, "app/(site)/admin");
const nonTest = (f: string) => !/\.test\.tsx?$/.test(f);
const consoleFiles = [...files(ADMIN_LIB), ...files(ADMIN_APP)].filter(nonTest);
const read = (f: string) => readFileSync(f, "utf8");

describe("privacy: no guest IP data in Admin", () => {
  it("no Admin source file (console, billing admin, pages) references guest_access_ip_attempts or ip_hmac", () => {
    const offenders = [...consoleFiles, ...files(BILLING_ADMIN_LIB).filter(nonTest)].filter((f) => /guest_access_ip_attempts|ip_hmac/.test(read(f)));
    expect(offenders.map((f) => relative(SRC, f))).toEqual([]);
  });
});

describe("exact counts and missing-state discipline in console code", () => {
  const consoleLib = files(ADMIN_LIB).filter(nonTest);
  const consolePages = files(join(ADMIN_APP, "(console)")).filter(nonTest);
  it("no .limit(n) row cap except .limit(0) (row-less exact counts)", () => {
    const hits = [...consoleLib, ...consolePages].flatMap((f) => [...read(f).matchAll(/\.limit\(\s*([^)]*)\)/g)].filter((m) => m[1].trim() !== "0").map((m) => `${relative(SRC, f)}: ${m[0]}`));
    expect(hits).toEqual([]);
  });
  it("no `?? 0` / `|| 0` fallbacks that could turn a missing value into zero", () => {
    const hits = [...consoleLib, ...consolePages, join(ADMIN_APP, "_components/MetricView.tsx"), join(ADMIN_APP, "_components/WatchdogView.tsx")]
      .flatMap((f) => read(f).split("\n").map((l, i) => [l, i] as const).filter(([l]) => /(\?\?|\|\|)\s*0(?![.\d])/.test(l)).map(([l, i]) => `${relative(SRC, f)}:${i + 1}: ${l.trim()}`));
    expect(hits).toEqual([]);
  });
  it("console counts use exact counts (count: \"exact\"), never estimated/planned", () => {
    const all = consoleLib.map(read).join("\n");
    expect(all).toContain('{ count: "exact" }');
    expect(all).not.toMatch(/count:\s*"(planned|estimated)"/);
  });
});

describe("sections, pages and gates agree", () => {
  it("every non-billing section has a page under (console) that gates with requireAdminPage({ roles: sectionRoles(<key>) })", () => {
    for (const s of ADMIN_SECTIONS.filter((x) => x.key !== "billing")) {
      const page = join(ADMIN_APP, "(console)", s.href.replace("/admin/", ""), "page.tsx");
      expect(existsSync(page), page).toBe(true);
      const src = read(page);
      expect(src, s.key).toContain(`requireAdminPage({ roles: sectionRoles("${s.key}") })`);
      // the gate is the first thing the page awaits
      const body = src.slice(src.indexOf("export default async function"));
      expect(body.indexOf("await "), s.key).toBe(body.indexOf("await requireAdminPage("));
    }
  });
  it("every console sub-page (e.g. spaces/[id]) also gates itself first", () => {
    for (const f of files(join(ADMIN_APP, "(console)")).filter((x) => x.endsWith("page.tsx"))) {
      const body = read(f).slice(read(f).indexOf("export default async function"));
      expect(body.indexOf("await "), relative(SRC, f)).toBe(body.search(/await requireAdminPage\(\{ roles: sectionRoles\("\w+"\) \}\)/));
    }
  });
  it("owner-only sections are owner-only; billing keeps owner + billing_admin", () => {
    for (const s of ADMIN_SECTIONS) expect(s.roles, s.key).toEqual(s.key === "billing" ? ["owner", "billing_admin"] : ["owner"]);
  });
});

describe("owner PII is confined to the audited Space detail page", () => {
  it("only spaces/[id]/page.tsx resolves emails in console code, and only after auditSensitiveView", () => {
    const users = consoleFiles.filter((f) => /lookupEmails|getUserById|listUsers/.test(read(f)));
    expect(users.map((f) => relative(ADMIN_APP, f).replace(/\\/g, "/")).filter((f) => !f.startsWith("..")).sort()).toEqual(["(console)/spaces/[id]/page.tsx"]);
    const page = read(join(ADMIN_APP, "(console)/spaces/[id]/page.tsx"));
    expect(page.indexOf("auditSensitiveView(")).toBeGreaterThan(0);
    expect(page.indexOf("lookupEmails(db")).toBeGreaterThan(page.indexOf("auditSensitiveView("));
    // listUsers in lib/admin is the accounts COUNT (one row, total only), never an email list
    const libUsers = files(ADMIN_LIB).filter(nonTest).filter((f) => /listUsers/.test(read(f)));
    expect(libUsers.map((f) => relative(ADMIN_LIB, f))).toEqual(["queries/spaces.ts"]);
    expect(read(join(ADMIN_LIB, "queries/spaces.ts"))).toContain("listUsers({ page: 1, perPage: 1 })");
  });
});

describe("client components never import server-only console modules", () => {
  it("'use client' files under admin import no lib/admin/{queries,watchdog/status,audit} and no supabase admin client", () => {
    const client = files(ADMIN_APP).filter(nonTest).filter((f) => /^\s*["']use client["']/.test(read(f)));
    const bad = client.filter((f) => /@\/lib\/admin\/(queries|watchdog\/status|audit)|@\/lib\/supabase\/admin|@\/lib\/billing\/admin\/(auth|queries|service|audit)/.test(read(f)));
    expect(bad.map((f) => relative(SRC, f))).toEqual([]);
  });
});
