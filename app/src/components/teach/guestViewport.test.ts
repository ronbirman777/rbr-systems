import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/teach/fonts", () => ({ TEACH_FONT_VARIABLES: "" }));

import { parsePublishedTeachSpace } from "@/lib/teach/guestData";
import { TeachGuestApp } from "./teach-guest-app";

/**
 * Regression guard for the mobile horizontal-overflow fix.
 *
 * The real measurement is a browser one (documentElement.scrollWidth <=
 * clientWidth at 320-1440px) and lives in the task's QA evidence, not
 * here - vitest has no layout engine. What CAN be guarded here is that the
 * two mechanisms that produce that result are still wired up, because
 * both are a single class that is easy to drop in a refactor:
 *
 *   1. .guest-viewport on the Guest App root, which is what applies
 *      `overflow-wrap: anywhere` to guest-authored text. Without it one
 *      pasted URL or long compound word sets a min-content width wider
 *      than the phone, and the whole page drags sideways.
 *   2. overflow-x: clip on the scroll shell, the defence-in-depth layer
 *      that must stay `clip` and never become `hidden` (hidden would turn
 *      the shell into a scroll container and break the sticky bottom nav).
 */

const GLOBALS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

const LONG_TOKEN = "https://www.instagram.com/innerdwes?stkn=eTZjMjFpb2xrdHE2&utm_source=qr";

function guestApp() {
  const data = parsePublishedTeachSpace({
    name: "QA Teacher",
    theme: null,
    timezone: "Asia/Makassar",
    enabled_modules: ["teachReadings"],
    modules: {
      teach: {
        settings: {
          teachProfile: { teacherType: "Yoga", locationLine: LONG_TOKEN },
          teachContact: { intro: LONG_TOKEN },
        },
        items: { teachReadings: [{ id: "r1", title: LONG_TOKEN, imageRef: null, metadata: {} }] },
      },
    },
  });
  return renderToStaticMarkup(createElement(TeachGuestApp, { data }));
}

describe("guest viewport is locked to the screen", () => {
  it("renders the Guest App root with the shared .guest-viewport shell", () => {
    expect(guestApp()).toContain("guest-viewport");
  });

  it("clips the scroll shell horizontally with clip, never hidden", () => {
    const html = guestApp();
    expect(html).toContain("overflow-x-clip");
    expect(html).not.toContain("overflow-x-hidden");
  });

  it("defines the wrap rule that actually stops long unbreakable text", () => {
    expect(GLOBALS).toMatch(/\.guest-viewport\s*:is\([^)]*\)\s*{\s*overflow-wrap:\s*anywhere/);
  });

  it("uses overflow-wrap: anywhere, not break-word, so min-content shrinks too", () => {
    const rule = GLOBALS.slice(GLOBALS.indexOf(".guest-viewport"));
    expect(rule).not.toMatch(/overflow-wrap:\s*break-word/);
  });

  it("applies the same shell to the Flow guest app, not only Teach", () => {
    const flow = readFileSync(new URL("../guest/published-space-screen.tsx", import.meta.url), "utf8");
    expect(flow).toContain("guest-viewport");
  });
});
