import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GuestLoadingScreen, GUEST_LOADING_SHOWN_CSS, guestLoadingCopy } from "./guest-loading-screen";
import { guestLoaderProduct, loaderPaletteFor, publishedLoaderBackground } from "@/lib/guest/loaderPalette";
import { LoadingTransition } from "@/components/loading-transition";
import { pickClientLocale } from "@/components/localized-status-text";
import { translateAll } from "@/lib/i18n/translateAll";
import { SUPPORTED_LOCALES, translate } from "@/lib/i18n";

/** TASK 033 branded loading experience. */
const ROOT = process.cwd();
const GLOBALS = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
const render = (props: Parameters<typeof GuestLoadingScreen>[0]) => renderToStaticMarkup(createElement(GuestLoadingScreen, props));

describe("context message", () => {
  it.each(SUPPORTED_LOCALES)("Flow / Teach / none in %s, from the dictionaries", (locale) => {
    expect(render({ locale, product: "retreat" })).toContain(translate(locale, "common", "preparingRetreat"));
    expect(render({ locale, product: "teach" })).toContain(translate(locale, "common", "preparingClasses"));
    expect(guestLoadingCopy(locale).message).toBeNull();
  });

  it("announces once: polite status with the hidden 'Loading' + message; the attribution line is not re-read", () => {
    const out = render({ locale: "en", product: "retreat" });
    expect(out).toContain('role="status"');
    expect(out).toContain('aria-live="polite"');
    expect(out).not.toContain("aria-busy");
    expect(out).toMatch(/<p aria-hidden="true"[^>]*>Created with InnerDweS<\/p>/);
    // without a product line the attribution stays readable, as before
    expect(render({ locale: "en" })).not.toMatch(/aria-hidden="true"[^>]*>Created with/);
  });
});

describe("palette - the ground the app will paint, never a different one", () => {
  it("Teach uses its published background; Flow and unknown use parchment", () => {
    expect(publishedLoaderBackground({ product_type: "teach", modules: { teach: { settings: { teachStyle: { background: "#EAF2F4" } } } } })).toBe("#EAF2F4");
    expect(publishedLoaderBackground({ product_type: "teach", modules: { teach: { settings: { teachStyle: { background: "red" } } } } })).toBeNull();
    expect(publishedLoaderBackground({ product_type: "teach", modules: null })).toBeNull();
    expect(publishedLoaderBackground({ product_type: "retreat", theme: { customSurface: "#123456" } })).toBeNull();
    expect(publishedLoaderBackground(null)).toBeNull();
    expect(guestLoaderProduct("retreat")).toBe("retreat");
    expect(guestLoaderProduct("client_hub")).toBeNull();
  });

  it("text and symbol tone stay readable on any ground", () => {
    expect(loaderPaletteFor(null)).toEqual({ background: "#F5F0E8", text: "#1B2E24", tone: "on-light" });
    expect(loaderPaletteFor("#1E2A36")).toMatchObject({ text: "#FBF9F5", tone: "on-dark" });
    const out = render({ locale: "en", product: "teach", palette: loaderPaletteFor("#EAF2F4") });
    expect(out).toContain("background:#EAF2F4");
    expect(out).toContain("color:#1B2E24");
  });

  it("without a palette it is the parchment screen exactly as before", () => {
    const out = render({ locale: "en" });
    expect(out).toContain("bg-idw-parchment");
    expect(out).not.toMatch(/style="background:/);
  });
});

describe("motion, layout, timing guards", () => {
  it("the official symbol breathes with a transform/opacity halo; both static under reduced motion", () => {
    const out = render({ locale: "en", product: "retreat" });
    expect(out).toContain("idw-loading-breathe");
    expect(out).toContain("idw-loading-halo");
    expect(GLOBALS).toMatch(/@keyframes idw-loading-halo \{[^@]*transform: scale\(0\.82\);\s*opacity: 0\.32;/);
    expect(GLOBALS).not.toMatch(/@keyframes idw-loading-halo \{[^}]*(width|height|top|left):/);
    expect(GLOBALS).toMatch(/@media \(prefers-reduced-motion: reduce\)[^@]*\.idw-loading-halo \{\s*animation: none;/);
  });

  it("is fixed, full dynamic-viewport height, safe-area padded (no layout shift)", () => {
    const out = render({ locale: "en" });
    expect(out).toMatch(/class="idw-guest-loading fixed inset-0/);
    expect(out).toContain("min-height:100dvh");
    expect(out).toContain("padding-top:env(safe-area-inset-top)");
  });

  it("keeps the D1 guarantees: 200 ms delay, hidden overlay by default, 1.5 s cap", () => {
    expect(GLOBALS).toMatch(/\.idw-guest-loading \{\s*animation: idw-guest-loading-in 0\.2s ease-out 0\.2s both;/);
    expect(GLOBALS).toMatch(/\.idw-guest-loading\[data-variant="overlay"\] \{\s*opacity: 0;\s*visibility: hidden;/);
    expect(GUEST_LOADING_SHOWN_CSS).toContain("1.3s forwards");
  });
});

describe("Studio route loaders", () => {
  it("stay static (prefetchable): no cookies()/headers() in loading.tsx", () => {
    for (const rel of ["src/app/(site)/configurator/retreat/[tenantId]/loading.tsx", "src/app/(site)/configurator/teach/[tenantId]/loading.tsx", "src/app/(site)/space/loading.tsx"]) {
      const src = readFileSync(path.join(ROOT, rel), "utf8");
      expect(src, rel).not.toMatch(/next\/headers|getAccountLocale|async function/);
      expect(src, rel).toContain("translateAll(");
    }
  });

  it("render English on the server, every language available to the client", () => {
    const messages = translateAll("common", "openingStudio");
    expect(Object.keys(messages).sort()).toEqual([...SUPPORTED_LOCALES].sort());
    const out = renderToStaticMarkup(createElement(LoadingTransition, { messages }));
    expect(out).toContain("Opening your Studio…");
    expect(out).toContain('role="status"');
    expect(out).toContain("idw-loading-halo");
  });

  it("pick the account language like getAccountLocale: cookie, then browser, then English", () => {
    expect(pickClientLocale("a=1; idw_locale=de", ["fr-FR"])).toBe("de");
    expect(pickClientLocale("", ["iw-IL", "en"])).toBe("he");
    expect(pickClientLocale("idw_locale=xx", ["pt-BR"])).toBe("en");
  });
});
