import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LoadingTransition } from "@/components/loading-transition";

/**
 * TASK 033 branded loading - Studio part only (release/033-ux-fast
 * backport of ae76391; the Guest loading screen it extends is TASK 033 P4
 * and is not on main).
 */
const ROOT = process.cwd();
const GLOBALS = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
const LOADERS = ["src/app/(site)/configurator/retreat/[tenantId]/loading.tsx", "src/app/(site)/configurator/teach/[tenantId]/loading.tsx", "src/app/(site)/space/loading.tsx"];

describe("Studio route loaders (branded mark + halo)", () => {
  it("render the official symbol breathing inside a decorative halo, announced once as a polite status", () => {
    const out = renderToStaticMarkup(createElement(LoadingTransition, { message: "Opening your studio…" }));
    expect(out).toContain('role="status"');
    expect(out).toContain('aria-live="polite"');
    expect(out).not.toContain("aria-busy");
    expect(out).toContain("idw-loading-breathe");
    expect(out).toMatch(/<span class="relative[^"]*" aria-hidden="true"><span class="idw-loading-halo /);
    expect(out).toContain("Opening your studio…");
  });

  it("the halo animates transform/opacity only and is static under reduced motion", () => {
    expect(GLOBALS).toMatch(/@keyframes idw-loading-halo \{[^@]*transform: scale\(0\.82\);\s*opacity: 0\.32;/);
    expect(GLOBALS).not.toMatch(/@keyframes idw-loading-halo \{[^}]*(width|height|top|left):/);
    expect(GLOBALS).toMatch(/@media \(prefers-reduced-motion: reduce\)[^@]*\.idw-loading-halo \{\s*animation: none;/);
  });

  it("loading.tsx files stay static (prefetchable) and keep their messages", () => {
    for (const rel of LOADERS) {
      const src = readFileSync(path.join(ROOT, rel), "utf8");
      expect(src, rel).not.toMatch(/next\/headers|cookies\(|async function/);
      expect(src, rel).toMatch(/<LoadingTransition message="[^"]+" \/>/);
    }
  });
});
