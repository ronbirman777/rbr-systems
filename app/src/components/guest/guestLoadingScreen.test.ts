import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GUEST_LOADING_CONTINUITY_SCRIPT,
  GUEST_LOADING_DONE_CSS,
  GUEST_LOADING_DONE_STYLE_ID,
  GUEST_LOADING_SHOWN_CSS,
  GUEST_LOADING_SHOWN_STYLE_ID,
  GUEST_LOADING_STREAM_ID,
  GuestLoadingScreen,
} from "./guest-loading-screen";
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

  it("the overlay is hidden by default - it can never fade in over content that already painted (QA D1)", () => {
    expect(GLOBALS).toMatch(/\.idw-guest-loading\[data-variant="overlay"\] \{\s*opacity: 0;\s*visibility: hidden;\s*animation: none;/);
  });

  it("when it continues a visible fallback it hides itself by 1.5s (1.3s + a 0.2s fade) even if JS never runs", () => {
    expect(GLOBALS).toMatch(/@keyframes idw-guest-loading-out \{\s*to \{\s*opacity: 0;\s*visibility: hidden;/);
    expect(GUEST_LOADING_SHOWN_CSS).toContain("idw-guest-loading-out .2s ease-in 1.3s forwards");
    expect(GUEST_LOADING_CONTINUITY_SCRIPT).toContain(GUEST_LOADING_SHOWN_CSS);
    expect(GUEST_LOADING_CONTINUITY_SCRIPT).toContain(GUEST_LOADING_DONE_CSS);
  });

  it("reveal rules out-rank the injected rules (more specific selectors)", () => {
    // (0,3,0) beats the injected SHOWN rule's (0,2,1); DONE excludes revealed overlays.
    expect(GUEST_LOADING_SHOWN_CSS.startsWith('html .idw-guest-loading[data-variant="overlay"]{')).toBe(true);
    expect(GUEST_LOADING_DONE_CSS).toContain(":not([data-revealed])");
    expect(GLOBALS).toContain('.idw-guest-loading[data-variant][data-revealed="fade"]');
    expect(GLOBALS).toContain('.idw-guest-loading[data-variant][data-revealed="instant"]');
  });

  it("reduced motion collapses the fades", () => {
    expect(GLOBALS).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.idw-guest-loading,[^}]*animation-duration: 1ms !important;/);
  });
});

/**
 * QA defect D1 - the overlay's show/hide decision, executed against a
 * minimal fake document (the script is plain ES5 and touches only these
 * APIs). The browser timeline it models: the streaming fallback is parsed,
 * content arrives (fallback removed), the hero settles, parsing ends.
 */
type FakeImg = { tagName: "IMG"; complete: boolean };
function fakePage() {
  const listeners: Record<string, ((e?: { target: unknown }) => void)[]> = {};
  const styles = new Map<string, string>();
  const state = { streamPresent: true, hero: null as FakeImg | null, logo: null as FakeImg | null, readyState: "loading" };
  const document = {
    get readyState() {
      return state.readyState;
    },
    head: { appendChild: (el: { id: string; textContent: string }) => styles.set(el.id, el.textContent) },
    createElement: () => ({ id: "", textContent: "" }),
    getElementById: (id: string) => (id === GUEST_LOADING_STREAM_ID ? (state.streamPresent ? {} : null) : styles.has(id) ? {} : null),
    querySelector: (sel: string) => (sel.includes("data-guest-hero") ? state.hero : sel.includes("data-guest-logo") ? state.logo : null),
    addEventListener: (type: string, fn: (e?: { target: unknown }) => void) => (listeners[type] ??= []).push(fn),
  };
  new Function("document", "setTimeout", GUEST_LOADING_CONTINUITY_SCRIPT)(document, setTimeout);
  const fire = (type: string, target?: unknown) => (listeners[type] ?? []).forEach((fn) => fn(target === undefined ? undefined : { target }));
  return {
    state,
    styles,
    fire,
    parsed: () => {
      state.readyState = "interactive";
      fire("DOMContentLoaded");
    },
    shown: () => styles.has(GUEST_LOADING_SHOWN_STYLE_ID),
    done: () => styles.has(GUEST_LOADING_DONE_STYLE_ID),
  };
}
const img = (complete = false): FakeImg => ({ tagName: "IMG", complete });

describe("overlay decision script (continuity + early hero-ready, no hydration needed)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("content that arrives before the fallback is visible never gets an overlay - even if the hero is still loading (the QA 4G case)", () => {
    const p = fakePage();
    p.state.streamPresent = false; // content swapped in at <200ms
    p.state.hero = img(false);
    vi.advanceTimersByTime(200);
    expect(p.shown()).toBe(false);
    p.fire("load", p.state.hero);
    expect(p.shown()).toBe(false);
  });

  it("a fallback still on screen at 200ms lets the overlay continue it", () => {
    const p = fakePage();
    vi.advanceTimersByTime(199);
    expect(p.shown()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(p.shown()).toBe(true);
    expect(p.done()).toBe(false);
  });

  it("the overlay is dismissed the moment the hero loads - before hydration", () => {
    const p = fakePage();
    vi.advanceTimersByTime(200);
    p.state.streamPresent = false;
    p.state.hero = img(false);
    p.fire("load", { tagName: "IMG", complete: true }); // another image: ignored
    expect(p.done()).toBe(false);
    p.fire("load", p.state.hero);
    expect(p.done()).toBe(true);
  });

  it("a hero that settled before the 200ms mark means the overlay is never shown", () => {
    const p = fakePage();
    p.state.hero = img(false);
    p.fire("load", p.state.hero);
    vi.advanceTimersByTime(200);
    expect(p.done()).toBe(true);
    expect(p.shown()).toBe(false);
  });

  it("a failed hero dismisses it too (the gradient fallback shows)", () => {
    const p = fakePage();
    vi.advanceTimersByTime(200);
    p.state.hero = img(false);
    p.fire("error", p.state.hero);
    expect(p.done()).toBe(true);
  });

  it("an already-complete hero, or no hero and no logo, is ready when parsing ends", () => {
    const a = fakePage();
    vi.advanceTimersByTime(200);
    a.state.hero = img(true);
    a.parsed();
    expect(a.done()).toBe(true);

    const b = fakePage();
    vi.advanceTimersByTime(200);
    b.parsed();
    expect(b.done()).toBe(true);
  });

  it("the logo counts only once parsing is done and there is no hero", () => {
    const p = fakePage();
    vi.advanceTimersByTime(200);
    p.state.logo = img(false);
    p.fire("load", p.state.logo); // still parsing: a hero may follow
    expect(p.done()).toBe(false);
    p.state.readyState = "interactive";
    p.fire("load", p.state.logo);
    expect(p.done()).toBe(true);
  });

  it("injects each rule at most once", () => {
    const p = fakePage();
    vi.advanceTimersByTime(200);
    p.state.hero = img(false);
    p.fire("load", p.state.hero);
    p.fire("load", p.state.hero);
    p.parsed();
    expect([...p.styles.keys()].sort()).toEqual([GUEST_LOADING_DONE_STYLE_ID, GUEST_LOADING_SHOWN_STYLE_ID].sort());
  });
});
