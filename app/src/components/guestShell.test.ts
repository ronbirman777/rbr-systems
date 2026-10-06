import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/teach/fonts", () => ({ TEACH_FONT_VARIABLES: "" }));

import { GuestApp } from "./guest-app";
import { TeachGuestApp } from "./teach/teach-guest-app";
import { parsePublishedTeachSpace, brandFromPublishedTheme } from "@/lib/teach/guestData";
import { DEFAULT_PUBLISHED_THEME } from "@/lib/modules/publishedTheme";
import { EMPTY_ARRIVAL_INFO } from "@/lib/modules/arrival";
import { EMPTY_STAY_CONNECTED } from "@/lib/modules/stayConnected";

const flow = (extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(GuestApp, {
      locale: "en",
      tenantName: "Wonderland",
      brand: brandFromPublishedTheme("Wonderland", DEFAULT_PUBLISHED_THEME),
      heroImageUrl: null,
      logoUrl: null,
      todayIso: "2026-10-14",
      nowTime: "09:00",
      enabledModules: ["schedule", "facilitators"],
      schedule: [],
      facilitators: [],
      meals: [],
      treatments: [],
      facilities: [],
      arrivalInfo: EMPTY_ARRIVAL_INFO,
      faq: [],
      customPages: [],
      stayConnected: EMPTY_STAY_CONNECTED,
      moduleCoverImages: {},
      ...extra,
    } as never)
  );

const teach = (embedded = false) =>
  renderToStaticMarkup(
    createElement(TeachGuestApp, {
      embedded,
      data: parsePublishedTeachSpace({
        name: "Lena",
        theme: null,
        timezone: "Europe/Berlin",
        enabled_modules: ["teachReadings"],
        modules: { spaceSettings: { locale: "en" }, teach: { settings: {}, items: { teachReadings: [{ id: "r", title: "A", imageRef: null, metadata: {} }] } } },
      } as never),
    } as never)
  );

describe("the Guest shell renders no fake device chrome", () => {
  it("has no hard-coded clock, and no drawn signal, wifi or battery", () => {
    const out = flow();
    // A web app showing "9:41" under the device's real status bar was
    // the Figma mock leaking into production.
    expect(out).not.toContain("9:41");
    expect(out.toLowerCase()).not.toContain("statusbar");
  });
});

describe("the Guest shell uses real safe-area insets", () => {
  it("pads the top of the Flow shell by the measured inset", () => {
    expect(flow()).toContain("env(safe-area-inset-top)");
  });

  it("reserves the home-indicator gap from the measured inset, with a floor", () => {
    // A bare 16px spacer was standing in for the home indicator; on a
    // device that reports one, the real value has to win.
    expect(flow()).toContain("max(env(safe-area-inset-bottom), 16px)");
  });

  it("pads the Teach shell's top inset, but not inside the Studio preview frame", () => {
    expect(teach(false)).toContain("env(safe-area-inset-top)");
    // Embedded in the Studio the frame already positions it; adding the
    // device inset there would open a gap that is not on any device.
    expect(teach(true)).not.toContain("padding-top:env(safe-area-inset-top)");
  });

  it("keeps Teach's bottom nav clear of the home indicator", () => {
    expect(teach(false)).toContain("safe-area-inset-bottom");
  });
});
