import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/teach/fonts", () => ({ TEACH_FONT_VARIABLES: "" }));

import { PublishedSpaceScreen } from "./published-space-screen";
import { TeachPublishedSpaceScreen } from "@/components/teach/teach-published-screen";
import { GuestDesktopShell } from "./guest-desktop-shell";
import { GUEST_COLUMN_MAX_WIDTH, GUEST_COLUMN_MIN_VIEWPORT, GUEST_COLUMN_MEDIA } from "@/lib/guest/column";
import { FLOW_SIZES } from "@/components/flow-media-sizes";
import { TEACH_SIZES } from "@/components/teach/teach-media-sizes";
import { brandFromPublishedTheme } from "@/lib/teach/guestData";
import { DEFAULT_PUBLISHED_THEME } from "@/lib/modules/publishedTheme";

/**
 * The shared Guest App shell - backport of the TASK 033 P4 shell (fd5e9fe),
 * column 430px by owner decision (release/033-ux-fast). The P4 hero-wait
 * loading overlay and `.guest-column-fixed` are NOT part of this backport,
 * so their assertions are not ported.
 *
 * vitest has no layout engine, so the geometry itself (a centred <= 430px
 * column from 431px - any window wider than the column - full width at or below 430px) is asserted where it lives - the
 * CSS - and the structure is asserted on the real published screens: both
 * products (and the access-code screen) render inside the SAME column
 * component, with their navigation inside it. Browser evidence at real widths is
 * a QA step, not claimed here.
 */

const GLOBALS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

/** The CSS text outside every @media block, and the text inside the column (431px) one. */
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
  it("Time to Flow: shell outermost, the app and its nav inside the column", () => {
    const out = flowMarkup();
    expect(out.startsWith("<div data-guest-shell")).toBe(true);
    const column = out.indexOf("guest-desktop-shell__column");
    expect(column).toBeGreaterThan(-1);
    // The bottom navigation is inside it (main has no "Created with" footer).
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
    // Teach's bottom tab bar too.
    expect(out.indexOf("<nav", app)).toBeGreaterThan(app);
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
      GuestDesktopShell({ brand: brandFromPublishedTheme("X", DEFAULT_PUBLISHED_THEME), children: "x" })
    );
    expect(out).toContain("--guest-backdrop:color-mix(in srgb, var(--rbr-primary) 10%, var(--rbr-parchment-deep))");
    expect(out).toContain("--rbr-primary:");
  });

  it("the access-code screen uses the same shell instead of its own 390px device frame", () => {
    const src = readFileSync(new URL("./guest-access-screen.tsx", import.meta.url), "utf8");
    expect(src).toContain('<GuestDesktopShell vars={vars} as="main">');
    expect(src).not.toContain("sm:w-[390px]");
    expect(src).not.toContain("sm:rounded-[44px]");
  });

  it("Teach's desktop-only layouts switch on the APP's own container, never the window (so the column keeps them phone-sized)", () => {
    const src = readFileSync(new URL("../teach/teach-guest-app.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/className=\{`tt-root guest-viewport \$\{TEACH_FONT_VARIABLES\} @container /);
    expect(src).toContain("ref.current?.clientWidth ?? 0) >= DESKTOP_MIN_WIDTH");
    expect(src).not.toMatch(/matchMedia|innerWidth/);
    // no viewport (sm:/md:/lg:) breakpoints in the Teach Guest App - only container queries
    expect(src).not.toMatch(/["\s](sm|md|lg|xl):[a-z]/);
  });
});

describe("the column geometry (globals.css)", () => {
  const { base, desktop } = cssScopes(GLOBALS);

  it("is inert at or below 430px (every phone): no width cap, no backdrop", () => {
    expect(rule(base, ".guest-desktop-shell__column")).not.toContain("max-width");
    expect(rule(base, ".guest-desktop-shell")).not.toContain("background");
    expect(rule(base, ".guest-desktop-shell")).toContain("min-height: 100dvh");
  });

  it("from 431px (any window wider than the column) is a centred, full-height column of at most 430px over the backdrop", () => {
    expect(GUEST_COLUMN_MIN_VIEWPORT).toBe(431);
    expect(GUEST_COLUMN_MIN_VIEWPORT).toBe(GUEST_COLUMN_MAX_WIDTH + 1);
    expect(GUEST_COLUMN_MEDIA).toBe("(min-width: 431px)");
    expect(GUEST_COLUMN_MAX_WIDTH).toBe(430);
    expect(rule(desktop, ".guest-desktop-shell__column")).toContain(`max-width: ${GUEST_COLUMN_MAX_WIDTH}px`);
    expect(rule(desktop, ".guest-desktop-shell__column")).not.toMatch(/(^|[^-])height:/);
    expect(rule(desktop, ".guest-desktop-shell")).toContain("align-items: center");
    expect(rule(desktop, ".guest-desktop-shell")).toContain("var(--guest-backdrop");
  });
});

describe("no 431-639px gap (owner rule: the mobile-app shell on every device)", () => {
  it("no other media block styles the shell: the column is the only breakpoint", () => {
    const shellBlocks = [...GLOBALS.matchAll(/@media[^{]*\{[^@]*?\.guest-desktop-shell/g)].map((m) => m[0].slice(0, m[0].indexOf("{")).trim());
    expect(shellBlocks).toEqual([`@media ${GUEST_COLUMN_MEDIA}`]);
    expect(GLOBALS).not.toMatch(/@media \(min-width: 640px\)\s*\{\s*\.guest-/);
  });

  it("every viewport is either a phone (<= 430px, full width) or shows the column", () => {
    for (const vw of [320, 390, 430, 431, 480, 600, 639, 640, 768, 1440]) {
      const appWidth = vw >= GUEST_COLUMN_MIN_VIEWPORT ? Math.min(vw, GUEST_COLUMN_MAX_WIDTH) : vw;
      expect(appWidth, `app width at ${vw}px`).toBeLessThanOrEqual(GUEST_COLUMN_MAX_WIDTH);
    }
  });
});

describe("media sizes follow the column (no over-fetch on desktop, unchanged on a phone)", () => {
  it("Flow's full-width cards are the column from 431px and the viewport at or below 430px (height-aware)", () => {
    expect(FLOW_SIZES.treatmentCard).toBe(`${GUEST_COLUMN_MEDIA} 430px, max(100vw, 356px)`);
    expect(FLOW_SIZES.exploreTile).toBe("249px");
  });

  it("Teach keeps its phone/column split and never describes the retired desktop layout", () => {
    expect(TEACH_SIZES.retreatCover).toBe(`${GUEST_COLUMN_MEDIA} 430px, max(100vw, 427px)`);
    for (const value of Object.values(TEACH_SIZES)) expect(value).not.toContain("896px");
  });
});
