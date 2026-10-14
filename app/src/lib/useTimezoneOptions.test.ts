import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fullTimezoneOptions, hydrationSafeTimezoneOptions, timezoneOptions } from "./timezone";
import { useTimezoneOptions } from "./useTimezoneOptions";

/**
 * TASK 033 D4 regression: the Studio timezone <select> threw React #418 on
 * every WebKit load because the server rendered Node's
 * Intl.supportedValuesOf("timeZone") (legacy aliases: Asia/Calcutta,
 * America/Buenos_Aires, no Etc/GMT±n) and WebKit hydrated with its own
 * canonical list (Asia/Kolkata, America/Argentina/Buenos_Aires, Etc/GMT+1...).
 */

const NODE_LIKE = ["Africa/Asmera", "America/Buenos_Aires", "Asia/Bangkok", "Asia/Calcutta", "Europe/Kiev"];
const WEBKIT_LIKE = ["Africa/Asmara", "America/Argentina/Buenos_Aires", "Asia/Bangkok", "Asia/Kolkata", "Etc/GMT+1", "Europe/Kyiv"];

function withZones(zones: string[]) {
  vi.spyOn(Intl, "supportedValuesOf").mockReturnValue(zones);
}

function Probe({ primary, extra }: { primary: string | null; extra?: string | null }) {
  const options = useTimezoneOptions(primary, extra);
  return createElement(
    "select",
    { value: primary ?? "UTC", onChange: () => {} },
    options.map((tz) => createElement("option", { key: tz, value: tz }, tz))
  );
}

afterEach(() => vi.restoreAllMocks());

describe("hydrationSafeTimezoneOptions", () => {
  it("does not depend on the ICU zone list", () => {
    withZones(NODE_LIKE);
    const node = hydrationSafeTimezoneOptions("Asia/Bangkok");
    withZones(WEBKIT_LIKE);
    const webkit = hydrationSafeTimezoneOptions("Asia/Bangkok");
    expect(node).toEqual(webkit);
    expect(node).toEqual(["UTC", "Asia/Bangkok"]);
  });

  it("keeps a legacy alias selectable and collapses UTC-family values", () => {
    expect(hydrationSafeTimezoneOptions("Asia/Calcutta")).toEqual(["UTC", "Asia/Calcutta"]);
    expect(hydrationSafeTimezoneOptions("Etc/UTC")).toEqual(["UTC"]);
    expect(hydrationSafeTimezoneOptions(null)).toEqual(["UTC"]);
  });

  it("includes a second selected value (Teach class timezone)", () => {
    expect(hydrationSafeTimezoneOptions("Europe/Lisbon", "Asia/Tokyo")).toEqual(["UTC", "Europe/Lisbon", "Asia/Tokyo"]);
    expect(hydrationSafeTimezoneOptions("Europe/Lisbon", null)).toEqual(["UTC", "Europe/Lisbon"]);
  });
});

describe("fullTimezoneOptions", () => {
  it("equals timezoneOptions plus an unlisted second value", () => {
    withZones(WEBKIT_LIKE);
    expect(fullTimezoneOptions("Asia/Bangkok")).toEqual(timezoneOptions("Asia/Bangkok"));
    expect(fullTimezoneOptions("Asia/Bangkok", "Asia/Calcutta")).toEqual([...timezoneOptions("Asia/Bangkok"), "Asia/Calcutta"]);
    expect(fullTimezoneOptions("Asia/Bangkok", "Asia/Kolkata")).toEqual(timezoneOptions("Asia/Bangkok"));
  });
});

describe("useTimezoneOptions server render", () => {
  it("renders the same markup whatever the server ICU list is", () => {
    withZones(NODE_LIKE);
    const a = renderToString(createElement(Probe, { primary: "Asia/Bangkok" }));
    withZones(WEBKIT_LIKE);
    const b = renderToString(createElement(Probe, { primary: "Asia/Bangkok" }));
    expect(a).toBe(b);
    expect(a).not.toContain("Asia/Calcutta");
    expect(a).toContain("Asia/Bangkok");
  });
});

describe("Studio timezone selects use the hydration-safe hook", () => {
  const root = path.resolve(__dirname, "..");
  it.each([
    "app/(site)/configurator/retreat/retreat-configurator.tsx",
    "app/(site)/configurator/teach/teach-studio-sections.tsx",
  ])("%s never renders timezoneOptions() directly", (file) => {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    expect(source).not.toMatch(/\btimezoneOptions\(/);
    expect(source).toContain("useTimezoneOptions(");
  });
});
