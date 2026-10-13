import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * TASK 033 fix 4 - the Guest Access code-entry screen sits in the shared
 * desktop Guest shell (the same centred column + backdrop as the Guest App)
 * instead of drawing its own 390x780 device frame, and nothing about the
 * gate itself changes: same form, same Server Action, same published-safe
 * identity, no protected payload, no hero-wait overlay, no media prefetch.
 *
 * vitest has no layout engine: the column geometry is asserted on the CSS in
 * guestDesktopShell.test.ts; here the structure is asserted on real markup.
 */

const prefetchMounts = vi.hoisted(() => ({ count: 0 }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("@/lib/guestAccess/verifyAction", () => ({ verifyGuestCode: async () => ({ success: false, error: null }) }));
vi.mock("@/components/shared/media-prefetch", () => ({
  MediaPrefetch: () => {
    prefetchMounts.count++;
    return null;
  },
}));

import { GuestAccessScreen } from "./guest-access-screen";

const HERO = "/api/media/t1/brand/hero/up-h/published.webp";
const LOGO = "/api/media/t1/brand/logo/up-l/published.webp";

/** The body markup, without the hero/logo `<link rel="preload">` hints React hoists into <head>. */
function render(overrides: Partial<Parameters<typeof GuestAccessScreen>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(GuestAccessScreen, {
      tenantId: "11111111-2222-4333-8444-555555555555",
      name: "Samadhi Retreat",
      heroImageUrl: HERO,
      logoUrl: LOGO,
      vars: { ["--rbr-primary" as string]: "#2D4A3E" },
      copy: { title: "Private Retreat", openLabel: "Open Retreat", askHint: "Ask your retreat organizer for the access code." },
      locale: "en",
      ...overrides,
    })
  ).replace(/^(<link [^>]*\/>)+/, "");
}

/** Everything React emits, including the hoisted preload hints. */
function renderAll() {
  return renderToStaticMarkup(
    createElement(GuestAccessScreen, {
      tenantId: "11111111-2222-4333-8444-555555555555",
      name: "Samadhi Retreat",
      heroImageUrl: HERO,
      logoUrl: LOGO,
      vars: {},
      copy: { title: "Private Retreat", openLabel: "Open Retreat", askHint: "Ask your retreat organizer for the access code." },
      locale: "en",
    })
  );
}

const SOURCE = readFileSync(new URL("./guest-access-screen.tsx", import.meta.url), "utf8");
const SHELL_SOURCE = readFileSync(new URL("./guest-desktop-shell.tsx", import.meta.url), "utf8");

describe("Guest Access screen inside the shared desktop shell", () => {
  it("renders inside the shell: backdrop wrapper outermost, the screen in the column (<main>)", () => {
    const out = render();
    expect(out.startsWith("<div data-guest-shell")).toBe(true);
    expect(out).toMatch(/<main class="guest-desktop-shell__column[^"]*"/);
    const column = out.indexOf("guest-desktop-shell__column");
    // The identity hero, the form and its submit button all live in the column.
    expect(out.indexOf("data-guest-access", column)).toBeGreaterThan(column);
    expect(out.indexOf("<form", column)).toBeGreaterThan(column);
    expect(out.indexOf('type="submit"', column)).toBeGreaterThan(column);
    // The Space's theme vars reach the shell (backdrop) and so the column.
    expect(out.slice(0, out.indexOf(">"))).toContain("--rbr-primary:#2D4A3E");
    expect(out.slice(0, out.indexOf(">"))).toContain("--guest-backdrop");
  });

  it("no longer draws its own 390x780 device frame (desktop geometry comes from the shell)", () => {
    expect(SOURCE).not.toMatch(/sm:w-\[390px\]|sm:h-\[780px\]|sm:rounded-\[44px\]/);
    expect(render()).not.toMatch(/390px|780px/);
  });

  it("mounts no hero-wait / loading overlay on the gate", () => {
    const out = render();
    expect(out).not.toContain("guest-loading-overlay");
    expect(out).not.toContain('role="status"');
  });

  it("keeps the same code form: hidden `code` field, six digit inputs, submit with the gate copy", () => {
    const out = render();
    expect(out).toContain('<input type="hidden" name="code" value=""/>');
    expect(out.match(/inputMode="numeric"|inputmode="numeric"/g)).toHaveLength(6);
    expect(out).toContain("Open Retreat");
    expect(out).toContain("Ask your retreat organizer for the access code.");
    // Same trusted Server Action, bound to the Space - unchanged.
    expect(SOURCE).toContain("verifyGuestCode.bind(null, tenantId)");
  });
});

describe("nothing protected is rendered or prefetched before access", () => {
  it("shows only the published-safe identity it was given (name, hero, logo, gate copy) - the same set as before TASK 033", () => {
    expect(render()).toContain("Samadhi Retreat");
    // The only media the gate references - in the body and in the preload
    // hints for its own priority hero/logo - are the hero and logo it is handed.
    const media = [...renderAll().matchAll(/\/api\/media\/[^"&\s,?]+/g)].map((m) => m[0]);
    expect(new Set(media)).toEqual(new Set([HERO, LOGO]));
    // Its props carry no snapshot: identity + copy + tenant id + locale only.
    expect(SOURCE).toMatch(/tenantId, name, heroImageUrl, logoUrl, vars, copy, locale = DEFAULT_LOCALE/);
  });

  it("does not mount the media prefetch component", () => {
    prefetchMounts.count = 0;
    render();
    expect(prefetchMounts.count).toBe(0);
    // Neither the gate nor the shell it now uses imports the prefetcher or a Guest App.
    for (const src of [SOURCE, SHELL_SOURCE]) {
      expect(src).not.toMatch(/media-prefetch|MediaPrefetch|guest-app|teach-guest-app|published-space-screen/);
    }
  });

  it("without a hero or logo it falls back to the gradient and references no media at all", () => {
    const out = render({ heroImageUrl: null, logoUrl: null });
    expect(out).not.toContain("/api/media/");
  });
});
