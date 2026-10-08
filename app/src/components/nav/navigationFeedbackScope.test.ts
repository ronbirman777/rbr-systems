import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * TASK 031 W3 scope audit. The defect was a PATTERN - bare buttons/links with
 * no feedback - so these tests pin that the shared control is used wherever
 * the Studio navigates to My Spaces, and that nobody quietly reintroduces a
 * bare one.
 */
const SRC = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

describe("every Studio -> My Spaces control uses the shared PendingNavLink", () => {
  const flow = read("app/(site)/configurator/retreat/retreat-configurator.tsx");
  const teach = read("app/(site)/configurator/teach/teach-studio.tsx");
  const topBar = read("components/studio/studio-top-bar.tsx");

  it("Flow: desktop bar, mobile bar and drawer are three PendingNavLinks and no bare router.push('/space') remains", () => {
    expect((flow.match(/<PendingNavLink/g) ?? []).length).toBe(2); // mobile bar + drawer (desktop is inside StudioTopBar)
    expect(flow).not.toMatch(/router\.push\(\s*["']\/space["']\s*\)/);
    expect(topBar).toContain("<PendingNavLink");
    expect(topBar).not.toMatch(/<button[^>]*onClick=\{onBack\}/);
  });

  it("Flow keeps routing every one of them through the unsaved-changes guard", () => {
    expect(flow).toContain("onBeforeBack={(go) => attemptNavigate(go)}");
    expect((flow.match(/beforeNavigate=\{\(go\) => (attemptNavigate\(go\)|\{)/g) ?? []).length).toBe(2);
  });

  it("Teach: the back link is the shared control, and now has the unsaved-changes guard it never had", () => {
    expect(teach).toContain("<PendingNavLink");
    expect(teach).not.toMatch(/<Link href="\/space"/);
    expect(teach).toContain("UnsavedChangesDialog");
    expect(teach).toContain("dirty.size > 0 ? setPendingLeave(() => go) : go()");
  });

  it("Teach: the back control is reachable below the sm breakpoint (it used to be hidden there)", () => {
    const link = teach.slice(teach.indexOf("<PendingNavLink"), teach.indexOf("</PendingNavLink>"));
    expect(link).not.toContain("hidden sm:flex");
    expect(link).toContain("sm:hidden");
    expect(link).toContain('"backToMySpaces"');
  });

  it("My Spaces has a loading boundary, so the tap is acknowledged on the next frame", () => {
    expect(existsSync(path.join(SRC, "app/(site)/space/loading.tsx"))).toBe(true);
    expect(read("app/(site)/space/loading.tsx")).toContain("LoadingTransition");
  });
});

describe("in-app back controls have a pressed state and a 44px target", () => {
  const files: [string, string][] = [
    ["Flow guest sub-page back", "components/guest/explore-screen.tsx"],
    ["Flow guest detail back", "components/guest/flow-screen-chrome.tsx"],
    ["Teach guest back", "components/teach/teach-ui.tsx"],
  ];
  it.each(files)("%s", (_name, file) => {
    const src = read(file);
    const marker = file.endsWith("explore-screen.tsx") ? "function ExploreSubPage" : file.endsWith("flow-screen-chrome.tsx") ? "export function FlowBackButton" : "export function BackButton";
    const block = src.slice(src.indexOf(marker), src.indexOf(marker) + 900);
    expect(block).toContain("min-h-11");
    expect(block).toContain("active:opacity-60");
    expect(block).toContain("touch-manipulation");
  });

  it("no new pseudo-element hit areas were introduced on any back control", () => {
    for (const [, file] of files) {
      const src = read(file);
      const marker = file.endsWith("explore-screen.tsx") ? "function ExploreSubPage" : file.endsWith("flow-screen-chrome.tsx") ? "export function FlowBackButton" : "export function BackButton";
      expect(src.slice(src.indexOf(marker), src.indexOf(marker) + 900)).not.toContain("after:");
    }
  });
});
