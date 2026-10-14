import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { STUDIO_INPUT_CLASS, STUDIO_ROW_ACTION_CLASS } from "./studio-ui";
import { INPUT } from "@/components/studio/studio-fields";

/**
 * TASK 033 Studio UX (mobile zoom / clipping). Two measured root causes:
 *
 * 1. iOS Safari zooms the page in when a focused input/select/textarea has
 *    a computed font-size below 16px, and stays zoomed - including across
 *    the log-in form's soft navigation into the Studio. Every shared form
 *    control is therefore 16px (`text-base`) below `sm`, its previous size
 *    from `sm` up.
 * 2. A hit-area ::after that bleeds sideways (`after:-inset-x-2`) on a
 *    control at the end of a row reached past the viewport (+5px at 320px,
 *    +14-29px in German), making the page horizontally scrollable/zoomable.
 *    Hit areas now grow on the block axis only, and step footers wrap.
 */
const ROOT = process.cwd();
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}
const STUDIO_SOURCES = [
  ...files(path.join(ROOT, "src/app/(site)/configurator")),
  ...files(path.join(ROOT, "src/components/studio")),
  ...files(path.join(ROOT, "src/components/forms")),
  ...files(path.join(ROOT, "src/app/(site)/(auth)")),
  path.join(ROOT, "src/components/module-cover-photo-field.tsx"),
  path.join(ROOT, "src/components/module-item-photo-field.tsx"),
];

describe("shared Studio form controls are 16px on phones", () => {
  it.each([
    ["STUDIO_INPUT_CLASS", STUDIO_INPUT_CLASS, "sm:text-[13px]"],
    ["studio-fields INPUT", INPUT, "sm:text-[14px]"],
  ])("%s", (_name, cls, desktop) => {
    const tokens = cls.split(/\s+/);
    expect(tokens).toContain("text-base");
    expect(tokens).toContain(desktop);
    // no unprefixed sub-16px size left that would win on mobile
    expect(tokens.filter((t) => /^text-\[(\d+(\.\d+)?)px\]$/.test(t) && parseFloat(t.slice(6)) < 16)).toEqual([]);
  });

  it("the auth and form-primitive inputs follow the same rule", () => {
    // Every form primitive that renders a text control is covered automatically (a new one cannot slip past
    // this guard), plus the auth pages. The two primitives present on every branch must be among them.
    const FORMS = "src/components/forms";
    const formPrimitives = readdirSync(path.join(ROOT, FORMS))
      .filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
      .map((f) => `${FORMS}/${f}`)
      .filter((rel) => /<(input|select|textarea)\b/.test(readFileSync(path.join(ROOT, rel), "utf8")));
    expect(formPrimitives).toEqual(expect.arrayContaining([`${FORMS}/country-select.tsx`, `${FORMS}/phone-field.tsx`]));
    for (const rel of [
      "src/app/(site)/(auth)/log-in/page.tsx",
      "src/app/(site)/(auth)/sign-up/page.tsx",
      "src/app/(site)/(auth)/recovery-form.tsx",
      ...formPrimitives,
    ]) {
      const src = readFileSync(path.join(ROOT, rel), "utf8");
      expect(src, rel).toMatch(/text-base sm:text-/);
      expect(src, rel).not.toMatch(/bg-white px-3 py-2\.5 text-sm outline-none/);
    }
  });
});

describe("no hit area bleeds sideways past its control", () => {
  it.each(STUDIO_SOURCES.map((f) => [path.relative(ROOT, f), f]))("%s", (_rel, file) => {
    expect(readFileSync(file, "utf8")).not.toMatch(/after:-inset-x-\d/);
  });
});

describe("Schedule row actions on phones", () => {
  it("are at least 44x44 below sm and keep the quiet pill from sm up", () => {
    const t = STUDIO_ROW_ACTION_CLASS.split(/\s+/);
    for (const c of ["min-h-11", "min-w-11", "sm:min-h-0", "sm:min-w-0", "sm:text-[11px]"]) expect(t).toContain(c);
  });
});
