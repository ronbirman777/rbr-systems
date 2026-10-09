import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const QA_SCRIPTS = ["scripts/billing-db-verify.mjs", "scripts/admin-qa.mjs", "src/lib/billing/integration/journeys.int.test.ts"];

describe("QA scripts that use service-role access (safety audit, pinned)", () => {
  it.each(QA_SCRIPTS)("%s asserts the Staging target BEFORE any client can write", (rel) => {
    const src = read(rel);
    const guard = src.indexOf("assertStagingTarget(");
    const client = src.indexOf("createClient(", src.indexOf("assertStagingTarget("));
    expect(guard, "calls the guard").toBeGreaterThan(-1);
    expect(client, "creates its client after the guard").toBeGreaterThan(guard);
    // no create-client call exists before the guard (the import line mentions the name but is not a call)
    expect(src.slice(0, guard)).not.toMatch(/createClient\(/);
    expect(src).not.toMatch(/includes\(STAGING_REF\)/); // the old weak substring check is gone
  });

  it.each(QA_SCRIPTS)("%s cleans up by exact id / run id through runScopedDelete, never by a bare prefix", (rel) => {
    const src = read(rel);
    expect(src).toContain("runScopedDelete(");
    // every pattern-based lookup must embed the run id
    const patterns = [...src.matchAll(/\.(?:like|ilike)\(\s*"[^"]+"\s*,\s*([^)]*)\)/g)].map((m) => m[1]);
    for (const p of patterns) expect(p, `pattern ${p}`).toMatch(/runId|\$\{run\}|run\.toUpperCase/);
    // no direct unscoped table deletes remain
    expect(src).not.toMatch(/\.delete\(\)\s*\.(?:like|ilike)\(/);
  });

  it("billing-db-verify fails the run when residue carrying its id remains", () => {
    const src = read("scripts/billing-db-verify.mjs");
    expect(src).toContain("cleanup left no residue carrying this run's id");
    expect(src).toContain("RESIDUE");
  });

  it("billing-db-verify marks its permanent audit entry so it is identifiable as QA", () => {
    const src = read("scripts/billing-db-verify.mjs");
    expect(src).toMatch(/request_id: `qa032-verify-\$\{runId\}`/);
  });

  it("the Production project ref appears nowhere in QA scripts except the guard that REFUSES it", () => {
    for (const rel of [...QA_SCRIPTS, "scripts/stagingGuard.mjs"]) {
      const src = read(rel);
      const hits = src.split("qzmsclkzbxrfohuxnitc").length - 1;
      if (rel.endsWith("stagingGuard.mjs")) expect(hits).toBe(1);
      else expect(hits, rel).toBe(0);
    }
  });

  it("the key is read only from the environment and is never printed or written", () => {
    for (const rel of QA_SCRIPTS) {
      const src = read(rel);
      expect(src).toMatch(/process\.env\.SUPABASE_SECRET_KEY/);
      expect(src).not.toMatch(/console\.log\([^)]*(SECRET|serviceKey|SK)\b/);
      expect(src).not.toMatch(/writeFileSync\([^)]*(SECRET|KEY)/);
    }
  });
});

describe("no secret is committed (tracked files)", () => {
  const tracked = execFileSync("git", ["ls-files", "--", "app", "docs"], { cwd: path.resolve(ROOT, ".."), encoding: "utf8" })
    .split("\n").filter(Boolean).filter((f) => !/package-lock\.json$|\.(png|jpe?g|webp|woff2?|ico|pdf)$/i.test(f));
  const PATTERNS: [string, RegExp][] = [
    ["JWT", /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
    ["Stripe live/test secret key", /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{12,}/],
    ["Stripe webhook secret", /\bwhsec_[A-Za-z0-9]{12,}/],
    ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{10,}/],
    ["Resend key", /\bre_[A-Za-z0-9]{20,}/],
  ];
  it("no tracked file contains a credential-shaped value", () => {
    const offenders: string[] = [];
    for (const rel of tracked) {
      if (rel.endsWith("qaScripts.audit.test.ts")) continue; // this file names the patterns
      let text: string;
      try { text = readFileSync(path.resolve(ROOT, "..", rel), "utf8"); } catch { continue; }
      for (const [name, re] of PATTERNS) if (re.test(text)) offenders.push(`${rel}: ${name}`);
    }
    expect(offenders).toEqual([]);
  });
});
