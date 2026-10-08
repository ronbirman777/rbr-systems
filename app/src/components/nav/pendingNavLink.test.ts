import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, prefetch: () => {} }) }));

import { NAV_CONTROL_BASE, PendingNavLink, navClickAction } from "./pending-nav-link";

const left = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
const idle = { pending: false, started: false, hasGuard: false };

describe("navClickAction: the rules every back control follows", () => {
  it("a plain primary click goes", () => expect(navClickAction(left, idle)).toBe("go"));
  it("with a guard, the guard decides", () => expect(navClickAction(left, { ...idle, hasGuard: true })).toBe("guard"));
  it("modified and non-primary clicks belong to the browser (new tab, download, context)", () => {
    for (const mod of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { button: 2 }]) {
      expect(navClickAction({ ...left, ...mod }, idle), JSON.stringify(mod)).toBe("browser");
    }
  });
  it("NO DUPLICATE NAVIGATION: once pending - or started but not yet pending - every click is swallowed", () => {
    expect(navClickAction(left, { ...idle, pending: true })).toBe("ignore");
    expect(navClickAction(left, { ...idle, started: true })).toBe("ignore");
    expect(navClickAction(left, { pending: true, started: true, hasGuard: true })).toBe("ignore");
  });
  it("a cancelled guard leaves the control usable: nothing marked started until go() runs", () => {
    // the component only sets `started` inside go(); a guard that never calls it changes no state
    expect(navClickAction(left, { ...idle, hasGuard: true })).toBe("guard");
    expect(navClickAction(left, { ...idle, hasGuard: true })).toBe("guard");
  });
});

const render = (extra: { className?: string; testId?: string } = {}) =>
  renderToStaticMarkup(
    createElement(PendingNavLink, { href: "/space", pendingLabel: "Opening My Spaces…", ariaLabel: "Back to My Spaces", ...extra } as ComponentProps<typeof PendingNavLink>, "My Spaces")
  );

describe("PendingNavLink semantics", () => {
  it("is a real link with an accessible name, not a div with a click handler", () => {
    const out = render();
    expect(out).toMatch(/^<a /);
    expect(out).toContain('href="/space"');
    expect(out).toContain('aria-label="Back to My Spaces"');
  });
  it("starts idle: not busy, not disabled, no spinner, and an empty polite live region ready to announce", () => {
    const out = render();
    expect(out).not.toContain("aria-busy");
    expect(out).not.toContain("aria-disabled");
    expect(out).not.toContain("data-pending");
    expect(out).not.toContain("nav-spinner");
    expect(out).toMatch(/<span role="status" aria-live="polite" class="sr-only"><\/span>/);
  });
  it("a real 44x44 hit box, never a pseudo-element bleed (the TASK 029 reorder lesson)", () => {
    expect(NAV_CONTROL_BASE).toContain("min-h-11");
    expect(NAV_CONTROL_BASE).toContain("min-w-11");
    expect(NAV_CONTROL_BASE).not.toContain("after:");
    expect(NAV_CONTROL_BASE).not.toContain("before:");
    expect(render()).not.toContain("after:");
  });
  it("immediate pressed feedback is pure CSS (works on pointer-down, before any JS), with a touch highlight and reduced-motion respected", () => {
    expect(NAV_CONTROL_BASE).toContain("active:bg-idw-forest/10");
    expect(NAV_CONTROL_BASE).toContain("active:scale-[0.97]");
    expect(NAV_CONTROL_BASE).toContain("motion-reduce:active:scale-100");
    expect(NAV_CONTROL_BASE).toContain("-webkit-tap-highlight-color");
    expect(NAV_CONTROL_BASE).toContain("touch-manipulation");
  });
  it("never removes the global keyboard focus ring", () => {
    expect(NAV_CONTROL_BASE).not.toMatch(/outline-none|focus:outline-none|focus-visible:outline-none/);
  });
  it("styles for the pending state exist, so the control looks busy rather than frozen", () => {
    expect(NAV_CONTROL_BASE).toContain("data-[pending=true]:opacity-70");
  });
  it("caller classes add layout without replacing the behaviour classes", () => {
    const out = render({ className: "gap-2 pe-3" });
    expect(out).toContain("gap-2 pe-3");
    expect(out).toContain("min-h-11");
  });
  it("forwards a test id", () => expect(render({ testId: "studio-back" })).toContain('data-testid="studio-back"'));
});
