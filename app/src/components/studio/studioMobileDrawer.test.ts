import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * TASK 033 mobile Studio menu - structural contract (node test env, no DOM;
 * runtime behaviour is covered by the local browser QA in docs/tasks/033).
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const drawer = read("src/components/studio/studio-mobile-drawer.tsx");
const flow = read("src/app/(site)/configurator/retreat/retreat-configurator.tsx");
const teach = read("src/app/(site)/configurator/teach/teach-studio.tsx");

describe("StudioMobileDrawer", () => {
  it("is a labelled modal dialog portalled to <body> (no ancestor can re-anchor position:fixed)", () => {
    expect(drawer).toContain("createPortal(");
    expect(drawer).toContain("document.body");
    expect(drawer).toContain('role="dialog"');
    expect(drawer).toContain('aria-modal="true"');
    expect(drawer).toContain("aria-label={label}");
    expect(drawer).toMatch(/className="lg:hidden fixed inset-0 z-\[100\] flex h-dvh"/);
  });

  it("locks the background scroll and makes it inert while open", () => {
    expect(drawer).toContain("const release = lockScroll();");
    expect(drawer).toContain('el.setAttribute("inert", "")');
    expect(drawer).toContain('el.removeAttribute("inert")');
  });

  it("closes on Escape, traps Tab, and returns focus to the opener", () => {
    expect(drawer).toContain('e.key === "Escape"');
    expect(drawer).toContain("trapFocusIndex(");
    expect(drawer).toContain("opener.focus(");
    expect(drawer).toContain("[aria-controls=");
  });

  it("scrolls its own content, respects safe areas and has a 44x44 close button", () => {
    expect(drawer).toContain("overflow-y-auto overscroll-contain");
    expect(drawer).toContain("env(safe-area-inset-top)");
    expect(drawer).toContain("env(safe-area-inset-bottom)");
    expect(drawer).toMatch(/data-drawer-close[\s\S]*w-11 h-11/);
  });
});

describe("both Studios use the shared drawer", () => {
  it.each([
    ["Flow", flow, "MOBILE_NAV_ID"],
    ["Teach", teach, "TEACH_MOBILE_NAV_ID"],
  ])("%s", (_name, src, idConst) => {
    expect(src).toContain("<StudioMobileDrawer");
    expect(src).toContain(`aria-controls={${idConst}}`);
    expect(src).toContain("releaseScrollLock();");
  });

  it("Teach no longer renders the menu in the page flow", () => {
    expect(teach).not.toContain('{mobileNav ? <div className="lg:hidden border-b');
  });

  it("the Flow Menu bar is sticky so the Menu is reachable from the bottom of a long step", () => {
    expect(flow).toContain('className="lg:hidden sticky top-0 z-40 flex items-center');
  });
});
