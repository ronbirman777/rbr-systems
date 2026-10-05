import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/teach/fonts", () => ({ TEACH_FONT_VARIABLES: "" }));

import { parsePublishedTeachSpace, type TeachGuestData } from "@/lib/teach/guestData";
import { TeachGuestApp, teachPrefetchItems } from "./teach/teach-guest-app";
import { guestPrefetchItems, type GuestAppProps } from "./guest-app";
import { FacilitatorsScreen } from "./facilitators-screen";
import { ExploreScreen } from "./guest/explore-screen";
import { mediaSrcSet } from "@/lib/media/cachePolicy";
import { mediaPrefetchQueue } from "@/lib/media/prefetch";
import { brandConfigSchema } from "@/lib/theme/tokens";

const ref = (name: string) => `t1/teach/${name}/up-${name}/published.webp`;
const urlFor = (name: string) => `/api/media/${ref(name)}`;

function teachData(): TeachGuestData {
  const data = parsePublishedTeachSpace({
    name: "Lena Hoffmann",
    theme: null,
    timezone: "Europe/Berlin",
    enabled_modules: ["teachReadings", "teachAudio", "teachContact"],
    modules: {
      teach: {
        settings: {
          teachAbout: { showTab: true, profile: { imageRef: ref("portrait") } },
          teachContact: { email: "lena@example.com" },
          teachExplore: {
            cards: {
              teachReadings: { imageRef: ref("readings") },
              teachAudio: { imageRef: ref("audio") },
              teachContact: { imageRef: ref("contact") },
            },
          },
        },
        items: {
          // An Explore card is only rendered once its module has
          // something to show (see exploreModuleStatus), so the fixture
          // gives each one the minimum that makes it visible.
          teachReadings: [{ id: "r1", title: "On stillness", body: "...", metadata: {} }],
          teachAudio: [{ id: "a1", title: "Yoga Nidra", metadata: { audioRef: "t1/teach/a1/up-a1/published.mp3" } }],
        },
      },
    },
  });
  // The published snapshot resolves refs to display URLs; do the same.
  for (const name of ["portrait", "readings", "audio", "contact"]) {
    data.mediaUrls[ref(name)] = urlFor(name);
  }
  return data;
}

const url = (r: string | null | undefined) => {
  const d = teachData();
  return r ? (d.mediaUrls[r] ?? null) : null;
};

describe("Teach: what gets warmed", () => {
  it("warms the tabs the visitor is not on, and nothing from the one they are", () => {
    const data = teachData();
    const onHome = teachPrefetchItems(data, "home", url).map((i) => i.src);
    expect(onHome).toContain(urlFor("portrait"));
    expect(onHome).toContain(urlFor("readings"));

    // Standing on About, the portrait is already loading - warming it
    // again would be the duplicate request this is meant to prevent.
    const onAbout = teachPrefetchItems(data, "about", url).map((i) => i.src);
    expect(onAbout).not.toContain(urlFor("portrait"));
    expect(onAbout).toContain(urlFor("readings"));

    const onExplore = teachPrefetchItems(data, "explore", url).map((i) => i.src);
    expect(onExplore).not.toContain(urlFor("readings"));
    expect(onExplore).toContain(urlFor("portrait"));
  });

  it("never warms a hidden tab's media", () => {
    const data = teachData();
    data.settings.teachAbout.showTab = false;
    expect(teachPrefetchItems(data, "home", url).map((i) => i.src)).not.toContain(urlFor("portrait"));
  });

  it("warms exactly the render each screen will display", () => {
    // The invariant the whole feature rests on. If an inventory's `sizes`
    // drifts from its screen's, the browser selects from a different
    // ladder and the visitor downloads two copies of one image - worse
    // than never prefetching. So: every candidate the warmer offers must
    // appear verbatim in the markup of the screen that owns the image.
    const data = teachData();
    const queue = mediaPrefetchQueue(teachPrefetchItems(data, "home", url));
    expect(queue.length).toBeGreaterThan(0);

    const about = renderToStaticMarkup(createElement(TeachGuestApp, { data, initialTab: "about" }));
    const explore = renderToStaticMarkup(createElement(TeachGuestApp, { data, initialTab: "explore" }));
    const markup = about + explore;

    for (const entry of queue) {
      expect(entry.srcSet, `${entry.src} should advertise a ladder`).toBeDefined();
      expect(markup, `${entry.src}: warmed candidate set is not the one rendered`).toContain(entry.srcSet!);
    }
  });
});

const brand = brandConfigSchema.parse({
  name: "Samadhi",
  logoRef: null,
  palette: "forest-sage",
  customPrimary: null,
  customSecondary: null,
  customNavigation: null,
  customText: null,
  atmosphere: "calm-organic",
});

function flowProps(over: Partial<GuestAppProps> = {}): GuestAppProps {
  return {
    tenantName: "Samadhi",
    brand,
    todayIso: "2026-10-05",
    nowTime: "09:00",
    enabledModules: ["facilitators", "meals", "arrivalInfo"],
    schedule: [],
    facilitators: [
      {
        id: "f1",
        name: "Ana",
        role: null,
        bio: null,
        specialties: [],
        socialLinks: [],
        imageUrl: urlFor("ana"),
        imagePosition: null,
      },
    ] as unknown as GuestAppProps["facilitators"],
    meals: [],
    treatments: [],
    facilities: [],
    arrivalInfo: { address: null, directions: null, parking: null, checkIn: null, checkOut: null, whatToBring: null },
    moduleCoverImages: {
      meals: { imageUrl: urlFor("meals"), imagePosition: null },
      arrivalInfo: { imageUrl: urlFor("arrival"), imagePosition: null },
      // A cover for a module that is switched off, as a stale snapshot
      // can carry.
      treatments: { imageUrl: urlFor("treatments"), imagePosition: null },
    } as unknown as GuestAppProps["moduleCoverImages"],
    ...over,
  } as GuestAppProps;
}

describe("Flow: what gets warmed", () => {
  it("warms the Team and Explore media while the visitor is on Today", () => {
    const srcs = guestPrefetchItems(flowProps(), "today").map((i) => i.src);
    expect(srcs).toContain(urlFor("ana"));
    expect(srcs).toContain(urlFor("meals"));
    expect(srcs).toContain(urlFor("arrival"));
  });

  it("ignores a cover whose module the organizer turned off", () => {
    const srcs = guestPrefetchItems(flowProps(), "today").map((i) => i.src);
    expect(srcs).not.toContain(urlFor("treatments"));
  });

  it("skips the screen the visitor is already looking at", () => {
    expect(guestPrefetchItems(flowProps(), "explore").map((i) => i.src)).not.toContain(urlFor("meals"));
    expect(guestPrefetchItems(flowProps(), "facilitators").map((i) => i.src)).not.toContain(urlFor("ana"));
  });

  it("warms exactly the render each screen will display", () => {
    // Same invariant as the Teach case, asserted against the screens
    // that own these images - the shell always opens on Today, so it
    // cannot render them itself.
    const props = flowProps();
    const queue = mediaPrefetchQueue(guestPrefetchItems(props, "today"));
    expect(queue.length).toBeGreaterThan(0);

    const markup =
      renderToStaticMarkup(
        createElement(FacilitatorsScreen, { brand: props.brand, facilitators: props.facilitators })
      ) +
      renderToStaticMarkup(
        createElement(ExploreScreen, {
          brand: props.brand,
          enabledModules: props.enabledModules,
          meals: props.meals,
          treatments: props.treatments,
          facilities: props.facilities,
          arrivalInfo: props.arrivalInfo,
          faq: [],
          customPages: [],
          stayConnected: { links: [] },
          moduleCoverImages: props.moduleCoverImages,
        })
      );

    for (const entry of queue) {
      expect(entry.srcSet, `${entry.src} should advertise a ladder`).toBeDefined();
      expect(entry.srcSet).toBe(mediaSrcSet(entry.src, entry.sizes));
      expect(markup, `${entry.src}: warmed candidate set is not the one rendered`).toContain(entry.srcSet!);
    }
  });
});
