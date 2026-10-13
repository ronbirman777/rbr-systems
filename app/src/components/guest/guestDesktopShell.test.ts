import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/teach/fonts", () => ({ TEACH_FONT_VARIABLES: "" }));

import { PublishedSpaceScreen } from "./published-space-screen";
import { TeachPublishedSpaceScreen } from "@/components/teach/teach-published-screen";
import { GuestDesktopShell } from "./guest-desktop-shell";
import { GUEST_COLUMN_MAX_WIDTH, GUEST_COLUMN_MIN_VIEWPORT, GUEST_COLUMN_MEDIA, columnSizes } from "@/lib/guest/column";
import { FLOW_SIZES } from "@/components/flow-media-sizes";
import { TEACH_SIZES } from "@/components/teach/teach-media-sizes";
import { brandFromPublishedTheme } from "@/lib/teach/guestData";
import { DEFAULT_PUBLISHED_THEME } from "@/lib/modules/publishedTheme";

/**
 * TASK 033 - the shared desktop Guest shell.
 *
 * vitest has no layout engine, so the geometry itself (a centred <= 480px
 * column from 640px, full width below) is asserted where it lives - the
 * CSS - and the structure is asserted on the real published screens: both
 * products render inside the SAME column component, with their navigation,
 * footer and loading overlay inside it. Browser evidence at real widths is
 * a QA step, not claimed here.
 */

const GLOBALS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

/** The CSS text outside every @media block, and the text inside the 640px one. */
function cssScopes(css: string) {
  const mediaStart = css.indexOf(`@media ${GUEST_COLUMN_MEDIA}`);
  expect(mediaStart, "the column breakpoint block exists").toBeGreaterThan(-1);
  let depth = 0;
  let end = mediaStart;
  for (let i = css.indexOf("{", mediaStart); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") depth--;
    if (depth === 0) {
      end = i;
      break;
    }
  }
  return { base: css.slice(0, mediaStart) + css.slice(end + 1), desktop: css.slice(mediaStart, end + 1) };
}

function rule(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  if (at === -1) return "";
  return css.slice(at, css.indexOf("}", at));
}

const flowRow = {
  name: "Samadhi",
  theme: null,
  timezone: "Europe/Lisbon",
  enabled_modules: ["schedule", "facilitators"],
  modules: { spaceSettings: { locale: "he" } },
};

const teachRow = {
  name: "Lena Hoffmann",
  theme: null,
  timezone: "Europe/Berlin",
  enabled_modules: ["teachReadings"],
  modules: { spaceSettings: { locale: "de" }, teach: { settings: {}, items: { teachReadings: [{ id: "r", title: "A", metadata: {} }] } } },
};

const flowMarkup = () => renderToStaticMarkup(PublishedSpaceScreen({ space: flowRow }));
const teachMarkup = async () => renderToStaticMarkup(await TeachPublishedSpaceScreen({ space: teachRow as never }));

describe("both Guest Apps render inside the one shared column", () => {
  it("Time to Flow: shell outermost, the app, its nav and footer inside the column", () => {
    const out = flowMarkup();
    expect(out.startsWith("<div data-guest-shell")).toBe(true);
    const column = out.indexOf("guest-desktop-shell__column");
    expect(column).toBeGreaterThan(-1);
    // The bottom navigation and the "Created with" footer are inside it.
    expect(out.indexOf("ref=guest_app&amp;src=flow", column)).toBeGreaterThan(column);
    expect(out.indexOf("<button", column)).toBeGreaterThan(column);
    // Flow's column is its <main>, still carrying the Space language/direction.
    expect(out).toMatch(/<main[^>]*class="guest-desktop-shell__column guest-viewport"/);
    expect(out).toMatch(/<main[^>]*lang="he"/);
    expect(out).toMatch(/<main[^>]*dir="rtl"/);
  });

  it("Time to Teach: the same shell component, the app root inside the column", async () => {
    const out = await teachMarkup();
    expect(out.startsWith("<div data-guest-shell")).toBe(true);
    const column = out.indexOf("guest-desktop-shell__column");
    const app = out.indexOf('data-testid="teach-guest-app"');
    expect(column).toBeGreaterThan(-1);
    expect(app).toBeGreaterThan(column);
    expect(out.indexOf("ref=guest_app&amp;src=teach", app)).toBeGreaterThan(app);
    // Teach's bottom tab bar too.
    expect(out.indexOf("<nav", app)).toBeGreaterThan(app);
  });

  it("each product carries the branded hero-wait overlay inside the column, pinned to it", async () => {
    for (const out of [flowMarkup(), await teachMarkup()]) {
      const column = out.indexOf("guest-desktop-shell__column");
      const overlay = out.indexOf('data-testid="guest-loading-overlay"');
      expect(overlay).toBeGreaterThan(column);
      expect(out).toMatch(/data-testid="guest-loading-overlay"[^>]*class="[^"]*guest-column-fixed/);
    }
  });

  it("Flow no longer draws its own 390px device frame on top of the shell", () => {
    const out = flowMarkup();
    expect(out).not.toContain("sm:w-[390px]");
    expect(out).not.toContain("sm:rounded-[44px]");
    // On a phone the frame is still exactly the visible viewport tall.
    expect(out).toContain("w-full h-dvh");
  });

  it("the backdrop is derived from the Space's own theme tokens", () => {
    const out = renderToStaticMarkup(
      GuestDesktopShell({ brand: brandFromPublishedTheme("X", DEFAULT_PUBLISHED_THEME), locale: "en", children: "x" })
    );
    expect(out).toContain("--guest-backdrop:color-mix(in srgb, var(--rbr-primary) 10%, var(--rbr-parchment-deep))");
    expect(out).toContain("--rbr-primary:");
  });
});

describe("the column geometry (globals.css)", () => {
  const { base, desktop } = cssScopes(GLOBALS);

  it("is inert below 640px: no width cap, no backdrop, no shift for fixed layers", () => {
    expect(rule(base, ".guest-desktop-shell__column")).not.toContain("max-width");
    expect(rule(base, ".guest-desktop-shell")).not.toContain("background");
    expect(base).not.toContain(".guest-column-fixed {");
  });

  it("from 640px is a centred column of at most 480px over the backdrop", () => {
    expect(GUEST_COLUMN_MIN_VIEWPORT).toBe(640);
    expect(GUEST_COLUMN_MAX_WIDTH).toBe(480);
    expect(rule(desktop, ".guest-desktop-shell__column")).toContain(`max-width: ${GUEST_COLUMN_MAX_WIDTH}px`);
    expect(rule(desktop, ".guest-desktop-shell")).toContain("align-items: center");
    expect(rule(desktop, ".guest-desktop-shell")).toContain("var(--guest-backdrop");
    // Fixed layers are re-anchored to the column, symmetrically (RTL-safe).
    const fixed = rule(desktop, ".guest-column-fixed");
    expect(fixed).toContain(`width: min(100%, ${GUEST_COLUMN_MAX_WIDTH}px)`);
    expect(fixed).toContain("left: 50%");
    expect(fixed).toContain("translateX(-50%)");
  });
});

describe("media sizes follow the column (no over-fetch on desktop, unchanged on a phone)", () => {
  it("Flow's frame and tiles are the column from 640px and the viewport below", () => {
    expect(FLOW_SIZES.frame).toBe(columnSizes(480, "100vw"));
    expect(FLOW_SIZES.tile).toBe(columnSizes(240, "50vw"));
  });

  it("Teach keeps its previous phone values below 640px", () => {
    expect(TEACH_SIZES.gallery.endsWith("(min-width: 576px) 33vw, 50vw")).toBe(true);
    expect(TEACH_SIZES.homeMoreCard.endsWith("45vw")).toBe(true);
    expect(TEACH_SIZES.retreatCover).toBe(columnSizes(480, "100vw"));
    for (const value of Object.values(TEACH_SIZES)) expect(value).not.toContain("896px");
  });
});
