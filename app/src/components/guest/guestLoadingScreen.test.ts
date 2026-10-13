import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GUEST_LOADING_CONTINUITY_SCRIPT, GUEST_LOADING_STREAM_ID, GuestLoadingScreen } from "./guest-loading-screen";
import { GuestHeroWait } from "./guest-hero-wait";
import { SPACE_SELECTABLE_LOCALES, translate } from "@/lib/i18n";

/**
 * TASK 033 (plan 4.5, D-LD1) - the branded Guest loading screen.
 * Timing is CSS (asserted on globals.css) plus lib/guest/heroWait.ts
 * (asserted with fake timers in heroWait.test.ts).
 */

const GLOBALS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const render = (props: Parameters<typeof GuestLoadingScreen>[0]) => renderToStaticMarkup(createElement(GuestLoadingScreen, props));

describe("GuestLoadingScreen semantics", () => {
  it("is a polite status region with a visually hidden, localized 'Loading'", () => {
    const out = render({ locale: "en" });
    expect(out).toContain('role="status"');
    expect(out).toContain('aria-live="polite"');
    expect(out).toMatch(/<span class="sr-only">Loading…<\/span>/);
  });

  it("says 'Created with InnerDweS' through the existing attribution key, in every selectable Space locale, with no raw keys", () => {
    for (const locale of SPACE_SELECTABLE_LOCALES) {
      const out = render({ locale });
      expect(out, locale).toContain(translate(locale, "attribution", "createdWith", { brand: "InnerDweS" }));
      expect(out, locale).toContain(`<span class="sr-only">${translate(locale, "common", "loading")}</span>`);
      expect(out, locale).not.toMatch(/attribution\.|common\.loading|\{brand\}/);
    }
  });

  it("uses the existing calm mark (idw-loading-breathe) on parchment - static under reduced motion", () => {
    const out = render({ locale: "en" });
    expect(out).toContain("idw-loading-breathe");
    expect(out).toContain("bg-idw-parchment");
    expect(out).toContain('aria-hidden="true"');
    // The existing reduced-motion override still stops the breathe.
    expect(GLOBALS).toMatch(/@media \(prefers-reduced-motion: reduce\)[^}]*\{[^@]*\.idw-loading-breathe\s*\{\s*animation: none;/);
  });

  it("is fixed over the layout (no shift); the overlay is pinned to the Guest column", () => {
    const stream = render({ locale: "en" });
    const overlay = render({ locale: "en", variant: "overlay" });
    expect(stream).toMatch(/class="idw-guest-loading fixed inset-0/);
    expect(stream).not.toContain("guest-column-fixed");
    expect(overlay).toContain("guest-column-fixed");
    expect(overlay).toContain('data-variant="overlay"');
  });

  it("only the streaming fallback carries the continuity script, and it targets that fallback", () => {
    const stream = render({ locale: "en" });
    expect(stream).toContain(`id="${GUEST_LOADING_STREAM_ID}"`);
    expect(stream).toContain("<script>");
    expect(GUEST_LOADING_CONTINUITY_SCRIPT).toContain(GUEST_LOADING_STREAM_ID);
    expect(GUEST_LOADING_CONTINUITY_SCRIPT).toContain("},200)");
    expect(render({ locale: "en", variant: "overlay" })).not.toContain("<script");
  });

  it("marks a revealed overlay so CSS can fade or drop it", () => {
    expect(render({ locale: "en", variant: "overlay", revealed: "fade" })).toContain('data-revealed="fade"');
    expect(render({ locale: "en", variant: "overlay", revealed: "instant" })).toContain('data-revealed="instant"');
  });

  it("the client hero-wait server-renders the overlay, so it is in place before hydration", () => {
    const out = renderToStaticMarkup(createElement(GuestHeroWait, { locale: "de" }));
    expect(out).toContain('data-testid="guest-loading-overlay"');
    expect(out).toContain("Wird geladen");
  });
});

describe("loading timing lives in CSS, so it holds even without JavaScript", () => {
  it("appears only after 200ms - a fast load never shows it", () => {
    expect(GLOBALS).toMatch(/\.idw-guest-loading \{\s*animation: idw-guest-loading-in 0\.2s ease-out 0\.2s both;/);
  });

  it("the overlay hides itself by 1.5s (1.3s + a 0.2s fade) even if JS never runs", () => {
    expect(GLOBALS).toMatch(
      /\.idw-guest-loading\[data-variant="overlay"\] \{\s*animation:\s*idw-guest-loading-in 0\.2s ease-out 0\.2s both,\s*idw-guest-loading-out 0\.2s ease-in 1\.3s forwards;/
    );
    expect(GLOBALS).toMatch(/@keyframes idw-guest-loading-out \{\s*to \{\s*opacity: 0;\s*visibility: hidden;/);
    // The continuity rule keeps the same 1.5s ceiling.
    expect(GUEST_LOADING_CONTINUITY_SCRIPT).toContain("idw-guest-loading-out .2s ease-in 1.3s forwards");
  });

  it("reveal rules out-rank the continuity rule (more specific selectors)", () => {
    expect(GLOBALS).toContain('.idw-guest-loading[data-variant][data-revealed="fade"]');
    expect(GLOBALS).toContain('.idw-guest-loading[data-variant][data-revealed="instant"]');
  });

  it("reduced motion collapses the fades", () => {
    expect(GLOBALS).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.idw-guest-loading,[^}]*animation-duration: 1ms;/);
  });
});
