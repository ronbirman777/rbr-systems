import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, useState: (init: unknown) => [typeof init === "function" ? (init as () => unknown)() : init, () => {}] };
});

import { getBrandPresets } from "@/lib/brand/presets";
import { defaultTeachSettings } from "@/lib/teach/schemas";
import { BrandSection } from "./teach-studio-sections";
import type { StudioApi } from "./teach-studio";

function makeApi(preset: string, colors = { primary: "#111111", accent: "#222222", navigation: null as string | null, text: null as string | null }) {
  const settings = defaultTeachSettings();
  settings.teachStyle = { ...settings.teachStyle, preset: preset as typeof settings.teachStyle.preset };
  const setColors = vi.fn();
  const updateSetting = vi.fn();
  const api = { settings, colors, setColors, updateSetting, isDirty: () => false, saving: null, save: vi.fn() } as unknown as StudioApi;
  return { api, setColors, updateSetting };
}

function walk(node: ReactNode, visit: (el: ReactElement<Record<string, unknown>>) => void) {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (!isValidElement(node)) return;
  const el = node as ReactElement<Record<string, unknown>>;
  visit(el);
  walk(el.props.children as ReactNode, visit);
}

function radios(api: StudioApi) {
  const out: { label: string; checked: boolean; click: () => void }[] = [];
  walk(BrandSection({ api }), (el) => {
    if (el.type === "button" && el.props.role === "radio") {
      let label = "";
      walk(el.props.children as ReactNode, (c) => {
        if (typeof c.props.children === "string") label = c.props.children as string;
      });
      out.push({ label, checked: el.props["aria-checked"] === true, click: el.props.onClick as () => void });
    }
  });
  return out;
}

describe("Teach Brand step uses the shared canonical registry", () => {
  it("shows exactly the 8 canonical presets plus a separate Custom colors option", () => {
    const { api } = makeApi("custom");
    expect(radios(api).map((r) => r.label)).toEqual([...getBrandPresets("teach").map((p) => p.label), "Custom colors"]);
    const html = renderToStaticMarkup(createElement(BrandSection, { api }));
    for (const gone of ["Calm", "Mediterranean", "Sunrise", "Sacred", "Deep Forest"]) expect(html).not.toContain(`>${gone}<`);
  });

  it("clicking a preset applies its full five-colour model (colours + background tint + preset key)", () => {
    for (const p of getBrandPresets("teach")) {
      const { api, setColors, updateSetting } = makeApi("custom");
      radios(api).find((r) => r.label === p.label)!.click();
      expect(setColors).toHaveBeenCalledWith({ primary: p.primary, accent: p.accent, navigation: p.navigation, text: p.text });
      expect(updateSetting).toHaveBeenCalledWith("teachStyle", { preset: p.key, background: p.surface }, "brand");
    }
  });

  it("marks the saved canonical preset selected, and 'Custom colors' for custom or legacy keys", () => {
    const sel = (preset: string) => radios(makeApi(preset).api).filter((r) => r.checked).map((r) => r.label);
    expect(sel("terracotta")).toEqual(["Terracotta"]);
    expect(sel("custom")).toEqual(["Custom colors"]);
    expect(sel("earth")).toEqual(["Custom colors"]);
  });

  it("just rendering the step never writes anything (no silent rewrite of a saved Space)", () => {
    const { api, setColors, updateSetting } = makeApi("earth", { primary: "#7A4E34", accent: "#C98B5E", navigation: null, text: null });
    renderToStaticMarkup(createElement(BrandSection, { api }));
    expect(setColors).not.toHaveBeenCalled();
    expect(updateSetting).not.toHaveBeenCalled();
  });
});

describe("Time to Heal exposes no Brand preset UI", () => {
  it("nothing outside the registry itself asks for client_hub presets", () => {
    const root = join(__dirname, "..", "..", "..");
    const hits: string[] = [];
    const scan = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) scan(full);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) && !full.endsWith(join("lib", "brand", "presets.ts"))) {
          if (/getBrandPresets\(\s*["']client_hub["']/.test(readFileSync(full, "utf8"))) hits.push(full);
        }
      }
    };
    scan(root);
    expect(hits).toEqual([]);
  });
});
