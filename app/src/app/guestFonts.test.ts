import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

/**
 * TASK 033 (plan 4.6, P5 font diet): at most 3 font files preloaded on a
 * Guest page, instead of 11.
 *
 * next/font preloads, for every declaration with `preload` not false, one
 * file per (style x subset) - per weight too for static faces, but every
 * preloaded Guest face is either variable (DM Sans) or single-weight (DM
 * Serif Display 400). The count below is computed from the real options the
 * modules pass, captured through a mock of next/font/google (a build-time
 * transform with no runtime under vitest).
 */

type Call = { family: string; options: { preload?: boolean; subsets?: string[]; style?: string | string[]; weight?: string | string[] } };
const calls = vi.hoisted(() => [] as { family: string; options: Record<string, unknown> }[]);

vi.mock("next/font/google", () => {
  const family = (name: string) => (options: Record<string, unknown>) => {
    calls.push({ family: name, options });
    return { variable: `--mock-${name}`, className: name, style: {} };
  };
  return {
    Geist: family("Geist"),
    Geist_Mono: family("Geist_Mono"),
    Fraunces: family("Fraunces"),
    DM_Serif_Display: family("DM_Serif_Display"),
    DM_Sans: family("DM_Sans"),
    Cormorant_Garamond: family("Cormorant_Garamond"),
    Lora: family("Lora"),
  };
});

/** Families Google serves as variable fonts (one file per style), per next's font-data.json. */
const VARIABLE = new Set(["Geist", "Geist_Mono", "Fraunces", "DM_Sans", "Cormorant_Garamond", "Lora"]);
const asList = (v: string | string[] | undefined, fallback: string[]) => (v === undefined ? fallback : Array.isArray(v) ? v : [v]);

function preloadedFiles(list: Call[]): number {
  return list
    .filter((c) => c.options.preload !== false)
    .reduce((sum, c) => {
      const styles = asList(c.options.style, ["normal"]).length;
      const weights = VARIABLE.has(c.family) ? 1 : asList(c.options.weight, ["400"]).length;
      const subsets = (c.options.subsets ?? []).length;
      return sum + styles * weights * subsets;
    }, 0);
}

async function declared(modulePath: string): Promise<Call[]> {
  calls.length = 0;
  vi.resetModules();
  await import(modulePath);
  return [...calls] as Call[];
}

describe("Guest font preloads", () => {
  it("a Guest page preloads at most 3 font files (Guest root fonts + Teach's extra faces)", async () => {
    const guest = await declared("./(guest)/guest-fonts");
    const teach = await declared("@/lib/teach/fonts");
    const total = preloadedFiles([...guest, ...teach]);
    expect(total).toBeLessThanOrEqual(3);
    expect(total).toBe(3);
    expect(guest.filter((c) => c.options.preload !== false).map((c) => c.family).sort()).toEqual(["DM_Sans", "DM_Serif_Display"]);
    expect(teach.every((c) => c.options.preload === false)).toBe(true);
  });

  it("keeps every Guest typography variable available (nothing a theme relies on was dropped)", async () => {
    const guest = await declared("./(guest)/guest-fonts");
    expect(guest.map((c) => c.family).sort()).toEqual(["DM_Sans", "DM_Serif_Display", "Fraunces", "Geist", "Geist_Mono"]);
  });

  it("declares latin-ext (Turkish ğ ş ı İ) on every face that is not preloaded", async () => {
    const all = [...(await declared("./(guest)/guest-fonts")), ...(await declared("@/lib/teach/fonts"))];
    for (const c of all.filter((x) => x.options.preload === false)) {
      expect(c.options.subsets, c.family).toContain("latin-ext");
    }
  });

  it("the (site) root keeps its fonts exactly as before (all preloaded, latin)", async () => {
    const site = await declared("./site-fonts");
    expect(site.map((c) => c.family).sort()).toEqual(["DM_Sans", "DM_Serif_Display", "Fraunces", "Geist", "Geist_Mono"]);
    for (const c of site) {
      expect(c.options.preload, c.family).toBeUndefined();
      expect(c.options.subsets, c.family).toEqual(["latin"]);
    }
  });

  it("no Guest root imports the site fonts, and the shared document shell declares none", () => {
    const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
    for (const layout of ["./(guest)/s/[slug]/layout.tsx", "./(guest)/g/[tenantId]/layout.tsx"]) {
      expect(read(layout), layout).not.toContain("site-fonts");
      expect(read(layout), layout).toContain("guest-fonts");
    }
    expect(read("./document-shell.tsx")).not.toMatch(/from "next\/font/);
  });
});
