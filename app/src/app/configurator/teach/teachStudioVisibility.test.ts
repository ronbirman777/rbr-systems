import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const toggles = vi.hoisted(() => [] as { label: string; checked: boolean; onChange: (v: boolean) => void }[]);
vi.mock("./studio-fields", async (orig) => {
  const actual = await orig<typeof import("./studio-fields")>();
  return {
    ...actual,
    Toggle: (p: { label: string; checked: boolean; onChange: (v: boolean) => void }) => {
      toggles.push({ label: p.label, checked: p.checked, onChange: p.onChange });
      return actual.Toggle(p as Parameters<typeof actual.Toggle>[0]);
    },
  };
});

import { defaultTeachSettings, type TeachExploreModule } from "@/lib/teach/schemas";
import { AboutSection, ModulesSection } from "./teach-studio-sections";
import type { StudioApi } from "./teach-studio";

function makeApi(over: { enabledExplore?: TeachExploreModule[]; about?: Record<string, unknown>; items?: Record<string, unknown[]> } = {}) {
  const settings = defaultTeachSettings();
  if (over.about) settings.teachAbout = { ...settings.teachAbout, ...over.about } as typeof settings.teachAbout;
  const updateSetting = vi.fn();
  const setEnabledExplore = vi.fn();
  const api = {
    settings,
    items: { teachReadings: [], teachAudio: [], customPages: [], teachGallery: [], teachCertificates: [], teachClasses: [], teachAvailability: [], ...over.items },
    enabledExplore: over.enabledExplore ?? [],
    updateSetting,
    setEnabledExplore,
    mediaUrl: () => null,
    isDirty: () => false,
    saving: null,
    save: vi.fn(),
    customPagesLimit: 5,
  } as unknown as StudioApi;
  return { api, updateSetting, setEnabledExplore };
}

beforeEach(() => {
  toggles.length = 0;
});

describe("Studio: About Me tab toggle", () => {
  it("is ON by default for a fresh Teach space", () => {
    const { api } = makeApi();
    const html = renderToStaticMarkup(createElement(AboutSection, { api }));
    const t = toggles.find((x) => /navigation/i.test(x.label))!;
    expect(t.checked).toBe(true);
    expect(html).toContain("Shown in navigation");
  });

  it("turning it off saves showTab:false into the About settings (dirty 'about' section)", () => {
    const { api, updateSetting } = makeApi();
    renderToStaticMarkup(createElement(AboutSection, { api }));
    toggles.find((x) => /navigation/i.test(x.label))!.onChange(false);
    expect(updateSetting).toHaveBeenCalledWith("teachAbout", { showTab: false }, "about");
  });

  it("reflects an explicit hide and can be turned back on", () => {
    const { api, updateSetting } = makeApi({ about: { showTab: false } });
    const html = renderToStaticMarkup(createElement(AboutSection, { api }));
    const t = toggles.find((x) => /navigation/i.test(x.label))!;
    expect(t.checked).toBe(false);
    expect(html).toContain("Hidden from navigation");
    t.onChange(true);
    expect(updateSetting).toHaveBeenCalledWith("teachAbout", { showTab: true }, "about");
  });
});

describe("Studio: Explore module visibility feedback", () => {
  it("shows no 'on but empty' hint while a module is off", () => {
    const { api } = makeApi();
    const html = renderToStaticMarkup(createElement(ModulesSection, { api }));
    expect(html).not.toContain("guests won&#x27;t see a card");
  });

  it("explains why an enabled module with no content shows nothing", () => {
    const { api } = makeApi({ enabledExplore: ["teachReadings"] });
    const html = renderToStaticMarkup(createElement(ModulesSection, { api }));
    expect(html).toContain("add at least one reading");
    expect(html).not.toContain("until a track has its audio file attached");
  });

  it("drops the hint once the module has content", () => {
    const reading = { id: "r1", title: "On breath", subtitle: null, description: "x", imageRef: null, externalLink: null, metadata: {} };
    const { api } = makeApi({ enabledExplore: ["teachReadings"], items: { teachReadings: [reading] } });
    expect(renderToStaticMarkup(createElement(ModulesSection, { api }))).not.toContain("add at least one reading");
  });

  it("toggling a module on updates the live enabled list immediately (what the preview reads)", () => {
    const { api, setEnabledExplore } = makeApi({ enabledExplore: ["teachAudio"] });
    renderToStaticMarkup(createElement(ModulesSection, { api }));
    const readings = toggles.filter((x) => /Hidden|Shown in Explore/.test(x.label))[0];
    readings.onChange(true);
    expect(setEnabledExplore).toHaveBeenCalledWith(["teachAudio", "teachReadings"]);
  });

  it("states that the preview is live and guests see changes after publishing", () => {
    const { api } = makeApi();
    expect(renderToStaticMarkup(createElement(ModulesSection, { api }))).toContain("guests see them after you publish");
  });
});
