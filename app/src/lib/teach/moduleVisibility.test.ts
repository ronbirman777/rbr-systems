import { describe, expect, it } from "vitest";
import { parsePublishedTeachSpace, type TeachGuestData } from "./guestData";
import { exploreModuleStatus } from "./moduleVisibility";
import { defaultTeachSettings, parseTeachSetting, TEACH_EXPLORE_MODULES, type TeachExploreModule } from "./schemas";

const TENANT = "11111111-1111-4111-8111-111111111111";

function guest(opts: { enabled?: string[]; settings?: Record<string, unknown>; items?: Record<string, unknown> } = {}): TeachGuestData {
  return parsePublishedTeachSpace({
    name: "Maya",
    theme: null,
    timezone: "Asia/Jerusalem",
    enabled_modules: opts.enabled ?? [],
    modules: { teach: { settings: opts.settings ?? {}, items: opts.items ?? {} } },
  });
}

const reading = { id: "r1", title: "On breath", subtitle: null, description: "x", imageRef: null, externalLink: null, metadata: {} };
const track = (audioRef: string | null) => ({ id: "a1", title: "Nidra", subtitle: null, description: null, imageRef: null, externalLink: null, metadata: { audioRef } });

describe("Explore module visibility (Studio hint and Guest App share one rule)", () => {
  it("a module that is not enabled is off, whatever content exists", () => {
    const d = guest({ enabled: [], items: { teachReadings: [reading] } });
    for (const k of TEACH_EXPLORE_MODULES) expect(exploreModuleStatus(d, k)).toBe("off");
  });

  it("enabled with no content is 'empty' (on, but guests see nothing yet)", () => {
    const d = guest({ enabled: [...TEACH_EXPLORE_MODULES] });
    for (const k of TEACH_EXPLORE_MODULES) expect(exploreModuleStatus(d, k)).toBe("empty");
  });

  it("enabled with content is 'visible'", () => {
    const d = guest({
      enabled: [...TEACH_EXPLORE_MODULES],
      settings: { teachContact: { enabled: ["email"], methods: { email: "maya@example.com" } } },
      items: { teachReadings: [reading], teachAudio: [track(`${TENANT}/teachAudio/a1/x/published.mp3`)], customPages: [{ id: "p1", title: "Workshop", metadata: { enabled: true } }], teachRetreats: [{ id: "r1", title: "Autumn retreat", metadata: { enabled: true } }] },
    });
    const states = Object.fromEntries(TEACH_EXPLORE_MODULES.map((k) => [k, exploreModuleStatus(d, k)])) as Record<TeachExploreModule, string>;
    expect(states).toEqual({ teachReadings: "visible", teachAudio: "visible", teachContact: "visible", customPages: "visible", teachRetreats: "visible" });
  });

  it("audio without an attached file does not count as content", () => {
    expect(exploreModuleStatus(guest({ enabled: ["teachAudio"], items: { teachAudio: [track(null)] } }), "teachAudio")).toBe("empty");
  });
});

describe("About Me tab flag (showTab)", () => {
  it("defaults to ON for new spaces, empty settings, and rows saved before the field existed", () => {
    expect(defaultTeachSettings().teachAbout.showTab).toBe(true);
    expect(parseTeachSetting("teachAbout", {}).showTab).toBe(true);
    expect(parseTeachSetting("teachAbout", { about: "Hello", styles: ["Vinyasa"] }).showTab).toBe(true);
    expect(parseTeachSetting("teachAbout", null).showTab).toBe(true);
    expect(parseTeachSetting("teachAbout", "garbage").showTab).toBe(true);
  });

  it("only an explicit false hides it, and it round-trips", () => {
    const hidden = parseTeachSetting("teachAbout", { showTab: false });
    expect(hidden.showTab).toBe(false);
    expect(parseTeachSetting("teachAbout", hidden).showTab).toBe(false);
  });

  it("an old published snapshot without the flag shows About; an explicit false in the snapshot hides it", () => {
    expect(guest({ settings: { teachAbout: { about: "Hi" } } }).settings.teachAbout.showTab).toBe(true);
    expect(guest().settings.teachAbout.showTab).toBe(true);
    expect(guest({ settings: { teachAbout: { showTab: false, about: "Hi" } } }).settings.teachAbout.showTab).toBe(false);
  });

  it("hiding the tab keeps the About content in the snapshot", () => {
    const d = guest({ settings: { teachAbout: { showTab: false, about: "Hi", styles: ["Yin"] } } });
    expect(d.settings.teachAbout.about).toBe("Hi");
    expect(d.settings.teachAbout.styles).toEqual(["Yin"]);
  });
});
