import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { en } from "./dictionaries/en";
import { SUPPORTED_LOCALES, translate, type Namespace } from "./index";
import { GUEST_NAMESPACES, guestMessages } from "./guestMessages";

/**
 * TASK 033 QA defect D5 - the Guest client bundle grew ~56 KB gzip because
 * every dictionary (now 7, with full tr/it) shipped in the chunk shared by
 * the Guest Apps. Guest client modules now import the English-only
 * "@/lib/i18n/core"; the server resolves the Space locale's messages
 * (guestMessages) and the Guest roots register them. These tests pin the
 * seam: same strings, same fallback, no dictionary but English in the
 * Guest client graph, every locale on every server entry.
 */

const SRC = fileURLToPath(new URL("../../", import.meta.url));

describe("guestMessages (server side)", () => {
  it("is null for English (English is in core) and for nothing else", () => {
    expect(guestMessages("en")).toBeNull();
    for (const locale of SUPPORTED_LOCALES.filter((l) => l !== "en")) expect(guestMessages(locale), locale).not.toBeNull();
  });

  it("carries exactly the Guest namespaces - never the Studio's", () => {
    const de = guestMessages("de")!;
    expect(Object.keys(de.dictionary).sort()).toEqual([...GUEST_NAMESPACES].sort());
    expect(de.dictionary).not.toHaveProperty("studio");
  });
});

describe("core + registered messages translate exactly like the full translator", () => {
  it("core alone knows only English, and falls back to it (never a raw key)", async () => {
    vi.resetModules();
    const core = await import("./core");
    expect(core.hasDictionary("en")).toBe(true);
    expect(core.hasDictionary("de")).toBe(false);
    expect(core.translate("de", "common", "loading")).toBe(en.common.loading);
  });

  it("after a Guest root registers the server's messages, every Guest key matches @/lib/i18n in every locale", async () => {
    vi.resetModules();
    const core = await import("./core");
    for (const locale of SUPPORTED_LOCALES) {
      core.registerLocaleMessages(guestMessages(locale));
      for (const ns of GUEST_NAMESPACES) {
        for (const key of Object.keys(en[ns]) as never[]) {
          const values = { n: 3, brand: "InnerDweS", date: "D", name: "N", count: 2 };
          expect(core.translate(locale, ns as Namespace, key, values), `${locale} ${ns}.${String(key)}`).toBe(
            translate(locale, ns as Namespace, key, values)
          );
        }
      }
    }
  });

  it("registering a partial set never shadows a fuller one (the Studio keeps its namespace)", async () => {
    vi.resetModules();
    const full = await import("./index");
    const before = full.translate("de", "studio", Object.keys(en.studio)[0] as never);
    full.registerLocaleMessages(guestMessages("de"));
    expect(full.translate("de", "studio", Object.keys(en.studio)[0] as never)).toBe(before);
    expect(before).not.toBe(en.studio[Object.keys(en.studio)[0] as keyof typeof en.studio]);
  });
});

/* ---------- import-graph guards (static, over the real source) ---------- */

function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolvePath(dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

/** Value imports (type-only imports are erased and never bundled). */
function valueImports(file: string): string[] {
  const s = readFileSync(file, "utf8");
  const out: string[] = [];
  const re = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m[1]) continue;
    const clause = (m[2] ?? "").trim();
    if (/^\{\s*(type\s+\w+\s*,?\s*)+\}$/.test(clause)) continue;
    out.push(m[3] ?? m[4] ?? m[5]);
  }
  return out;
}

const isClient = (f: string) => /^\s*["']use client["']/.test(readFileSync(f, "utf8"));

function walk(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const spec of valueImports(f)) {
      const r = resolveSpec(f, spec);
      if (r) stack.push(r);
    }
  }
  return seen;
}

/** The client modules of the Guest routes: every "use client" module a Guest server module imports, and all they import. */
function guestClientGraph(): Set<string> {
  const roots = ["app/(guest)/s/[slug]/page.tsx", "app/(guest)/s/[slug]/layout.tsx", "app/(guest)/g/[tenantId]/page.tsx", "app/(guest)/g/[tenantId]/layout.tsx"].map(
    (p) => join(SRC, p)
  );
  const server = new Set<string>();
  const boundaries = new Set<string>();
  const stack = [...roots];
  while (stack.length) {
    const f = stack.pop()!;
    if (server.has(f)) continue;
    server.add(f);
    for (const spec of valueImports(f)) {
      const r = resolveSpec(f, spec);
      if (!r) continue;
      if (isClient(r)) boundaries.add(r);
      else stack.push(r);
    }
  }
  return walk([...boundaries]);
}

describe("the Guest client bundle carries no dictionary but English", () => {
  const graph = guestClientGraph();
  const rel = (f: string) => relative(SRC, f);

  it("finds the Guest client roots", () => {
    for (const root of ["components/guest-app.tsx", "components/teach/teach-guest-app.tsx", "components/guest/guest-access-screen.tsx", "components/guest/guest-hero-wait.tsx"]) {
      expect([...graph].map(rel)).toContain(root);
    }
  });

  it("imports no locale dictionary other than en, and never the all-locales @/lib/i18n", () => {
    const dictionaries = [...graph].map(rel).filter((f) => f.startsWith("lib/i18n/dictionaries/"));
    expect(dictionaries).toEqual(["lib/i18n/dictionaries/en.ts"]);
    expect([...graph].map(rel)).not.toContain("lib/i18n/index.ts");
  });

  it("never translates the Studio namespace (so guestMessages may leave it out)", () => {
    const users = [...graph].filter((f) => !rel(f).startsWith("lib/i18n/") && /\b(?:t|translate|studioMessages)\(\s*(?:[\w.]+\s*,\s*)?"studio"/.test(readFileSync(f, "utf8")));
    expect(users.map(rel)).toEqual([]);
  });

  it("each Guest client root registers the server's messages before it translates, and the server passes them", () => {
    for (const root of ["components/guest-app.tsx", "components/teach/teach-guest-app.tsx", "components/guest/guest-access-screen.tsx"]) {
      expect(readFileSync(join(SRC, root), "utf8"), root).toMatch(/registerLocaleMessages\((props\.)?messages\)/);
    }
    for (const parent of ["components/guest/published-space-screen.tsx", "components/teach/teach-published-screen.tsx", "app/(guest)/s/[slug]/page.tsx", "app/(guest)/g/[tenantId]/page.tsx"]) {
      expect(readFileSync(join(SRC, parent), "utf8"), parent).toMatch(/messages=\{guestMessages\(/);
    }
    // The hero-wait overlay gets its text translated by its server parent.
    expect(readFileSync(join(SRC, "components/guest/guest-desktop-shell.tsx"), "utf8")).toContain("copy={guestLoadingCopy(locale)}");
  });
});

describe("every server entry has every locale registered", () => {
  const CORE = join(SRC, "lib/i18n/core.ts");
  const INDEX = join(SRC, "lib/i18n/index.ts");
  // Reach core only through lib/teach/style.ts's DEFAULT_TEACH_PRESET (no translation on that path).
  const NO_TRANSLATION = new Set(["app/api/billing/checkout-status/route.ts", "app/api/billing/webhook/route.ts"]);

  function routeHandlers(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) routeHandlers(p, out);
      else if (/^(route|opengraph-image|twitter-image|icon|sitemap|robots)\.tsx?$/.test(name)) out.push(p);
    }
    return out;
  }

  it("all root layouts (via the document shell) import @/lib/i18n", () => {
    expect(readFileSync(join(SRC, "app/document-shell.tsx"), "utf8")).toMatch(/^import "@\/lib\/i18n";$/m);
  });

  it("route handlers that reach @/lib/i18n/core also load @/lib/i18n", () => {
    const missing = routeHandlers(join(SRC, "app"))
      .filter((f) => !NO_TRANSLATION.has(relative(SRC, f)))
      .filter((f) => {
        const g = walk([f]);
        return g.has(CORE) && !g.has(INDEX);
      })
      .map((f) => relative(SRC, f));
    expect(missing).toEqual([]);
  });
});
