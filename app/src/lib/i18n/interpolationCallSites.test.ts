import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { en } from "./dictionaries/en";

/**
 * Every `t(ns, key, { ... })` call site must pass exactly the placeholders
 * its string declares.
 *
 * THE BUG THIS CATCHES. The Readings editor rendered a literal
 * "Paste {platform} link" on Production, in all five languages, because
 * the call site passed `{ label: ... }` while `flow.pasteLinkOf` declares
 * `{platform}`:
 *
 *     t("flow", "pasteLinkOf", { label: t("flow", "externalArticle") })
 *
 * Nothing caught it. The dictionaries were consistent with each other, so
 * the placeholder-parity test in i18n.test.ts passed - it compares locales
 * against English, and English was fine. TypeScript cannot help either:
 * the values argument is a loose record, not a type derived from the
 * string. The missing check was always between the CALL SITE and the
 * string, which is what this file adds.
 *
 * It is a source scan rather than a runtime assertion on purpose: an
 * unused placeholder renders as its own literal braces, silently, and only
 * on the screen that happens to be open. A scan sees every call site
 * whether or not a test ever renders it.
 */

const SRC = join(__dirname, "..", "..");
const SKIP_DIRS = new Set(["node_modules", ".next", "dictionaries"]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** The `{name}` tokens a dictionary string declares. */
function placeholdersOf(value: string): Set<string> {
  return new Set([...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
}

/**
 * Reads the object literal that starts at `src[open]` ('{') and returns
 * its TOP-LEVEL keys. Brace- and quote-aware, so a nested `t(...)` call or
 * a nested object in a value does not contribute keys of its own.
 */
function topLevelKeys(src: string, open: number): { keys: string[]; end: number } {
  const keys: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let i = open;
  let atKeyPosition = true;

  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "{" || c === "(" || c === "[") {
      depth++;
      if (depth === 1) atKeyPosition = true;
      continue;
    }
    if (c === "}" || c === ")" || c === "]") {
      depth--;
      if (depth === 0) break;
      continue;
    }
    if (depth === 1) {
      if (c === ",") {
        atKeyPosition = true;
        continue;
      }
      if (atKeyPosition && /[A-Za-z_$]/.test(c)) {
        // `name:` and ES6 shorthand `name` (followed by a comma or the
        // closing brace) are both keys. Missing the shorthand form would
        // make this guard report false failures on correct call sites -
        // `t("studio", "openColorPicker", { label })` is fine.
        const m = /^([A-Za-z_$][\w$]*)\s*(:|,|\})/.exec(src.slice(i));
        if (m) keys.push(m[1]);
        atKeyPosition = false;
      }
    }
  }
  return { keys, end: i };
}

type CallSite = { file: string; namespace: string; key: string; passed: string[] };

function callSites(): CallSite[] {
  const found: CallSite[] = [];
  // `t("ns", "key", {` - only call sites that actually pass values.
  const pattern = /\bt\(\s*"(\w+)"\s*,\s*"(\w+)"\s*,\s*\{/g;

  for (const file of sourceFiles(SRC)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(pattern)) {
      const open = m.index! + m[0].length - 1;
      found.push({
        file: relative(SRC, file),
        namespace: m[1],
        key: m[2],
        passed: topLevelKeys(src, open).keys,
      });
    }
  }
  return found;
}

describe("translation call sites", () => {
  const sites = callSites();

  it("finds the interpolating call sites at all", () => {
    // A guard on the scanner itself: if a refactor changes how `t` is
    // called, this file must fail loudly rather than quietly scan nothing
    // and report success.
    expect(sites.length).toBeGreaterThan(20);
  });

  it("passes exactly the placeholders each string declares", () => {
    const problems: string[] = [];

    for (const site of sites) {
      const namespace = (en as unknown as Record<string, Record<string, string>>)[site.namespace];
      if (!namespace) {
        problems.push(`${site.file}: unknown namespace "${site.namespace}"`);
        continue;
      }
      const value = namespace[site.key];
      if (typeof value !== "string") {
        problems.push(`${site.file}: unknown key "${site.namespace}.${site.key}"`);
        continue;
      }

      const declared = placeholdersOf(value);
      const passed = new Set(site.passed);

      const missing = [...declared].filter((p) => !passed.has(p));
      const extra = [...passed].filter((p) => !declared.has(p));

      if (missing.length) {
        problems.push(
          `${site.file}: ${site.namespace}.${site.key} declares {${missing.join("}, {")}} ` +
            `but the call site passes {${site.passed.join(", ")}} - the token renders literally`
        );
      }
      if (extra.length) {
        problems.push(
          `${site.file}: ${site.namespace}.${site.key} is passed ${extra.join(", ")}, ` +
            `which the string does not use`
        );
      }
    }

    expect(problems).toEqual([]);
  });
});
