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
import { BrandPaletteEditor } from "@/components/studio/brand-palette-editor";
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

/**
 * TASK 033: the radio cards now live in the shared BrandPaletteEditor, so
 * these tests read the props BrandSection hands it (the wiring under test)
 * and render the whole step for the visible cards.
 */
function editorProps(api: StudioApi) {
  let found: Record<string, unknown> | null = null;
  walk(BrandSection({ api }), (el) => {
    if (el.type === BrandPaletteEditor) found = el.props;
  });
  if (!found) throw new Error("BrandPaletteEditor not mounted");
  return found as unknown as {
    presets: ReturnType<typeof getBrandPresets>;
    selection: { mode: string; selectedKey: string | null };
    onApplyPreset: (p: ReturnType<typeof getBrandPresets>[number]) => void;
    onChange: (role: "primary" | "accent" | "surface", hex: string) => void;
    advanced: ReactNode;
    showSurface?: boolean;
  };
}
const checkedCards = (api: StudioApi) =>
  [...renderToStaticMarkup(createElement(BrandSection, { api })).matchAll(/aria-checked="true"[^>]*data-preset="([^"]+)"/g)].map((m) => m[1]);

describe("Teach Brand step uses the shared canonical registry", () => {
  it("shows exactly the 8 canonical presets, plus the Custom colours card while custom is in use", () => {
    const { api } = makeApi("custom");
    expect(editorProps(api).presets.map((p) => p.label)).toEqual(getBrandPresets("teach").map((p) => p.label));
    const html = renderToStaticMarkup(createElement(BrandSection, { api }));
    expect([...html.matchAll(/data-preset="([^"]+)"/g)].map((m) => m[1])).toEqual([...getBrandPresets("teach").map((p) => p.key), "custom"]);
    for (const gone of ["Calm", "Mediterranean", "Sunrise", "Sacred", "Deep Forest"]) expect(html).not.toContain(`>${gone}<`);
  });

  it("clicking a preset applies its full five-colour model (colours + background tint + preset key)", () => {
    for (const p of getBrandPresets("teach")) {
      const { api, setColors, updateSetting } = makeApi("custom");
      editorProps(api).onApplyPreset(p);
      expect(setColors).toHaveBeenCalledWith({ primary: p.primary, accent: p.accent, navigation: p.navigation, text: p.text });
      expect(updateSetting).toHaveBeenCalledWith("teachStyle", { preset: p.key, background: p.surface }, "brand");
    }
  });

  it("marks the saved canonical preset selected, and 'Custom colours' for custom or legacy keys", () => {
    expect(checkedCards(makeApi("terracotta").api)).toEqual(["terracotta"]);
    expect(checkedCards(makeApi("custom").api)).toEqual(["custom"]);
    expect(checkedCards(makeApi("earth").api)).toEqual(["custom"]);
  });

  it("custom edits keep navigation/text as saved and mark the palette custom", () => {
    const colors = { primary: "#111111", accent: "#222222", navigation: "#333333", text: "#444444" };
    const { api, setColors, updateSetting } = makeApi("forest", colors);
    editorProps(api).onChange("primary", "#ABCDEF");
    expect(setColors).toHaveBeenCalledWith({ ...colors, primary: "#ABCDEF" });
    expect(updateSetting).toHaveBeenCalledWith("teachStyle", { preset: "custom" }, "brand");
    editorProps(api).onChange("surface", "#FAFAFA");
    expect(updateSetting).toHaveBeenCalledWith("teachStyle", { background: "#FAFAFA", preset: "custom" }, "brand");
  });

  // release/033-ux-fast backport: the advanced colour controls Teach had
  // ("Fine-tune navigation and text colours") stay, with the same writes.
  function advancedControls(api: StudioApi) {
    const p = editorProps(api);
    const toggles: Record<string, unknown>[] = [];
    const fields: Record<string, unknown>[] = [];
    walk(p.advanced, (el) => {
      if (typeof el.props.label === "string" && typeof el.props.checked === "boolean") toggles.push(el.props);
      if (typeof el.props.label === "string" && typeof el.props.value === "string") fields.push(el.props);
    });
    return { p, toggles, fields };
  }

  it("keeps Background tint (teachStyle.background) and the fine-tune toggle under Advanced", () => {
    const { p, toggles } = advancedControls(makeApi("custom").api);
    expect(p.showSurface).not.toBe(false);
    expect(toggles.map((x) => x.label)).toEqual(["Fine-tune navigation and text colours"]);
    expect(toggles[0].checked).toBe(false);
  });

  it("advanced navigation/text edits write exactly what they wrote before (colour + preset custom)", () => {
    const colors = { primary: "#111111", accent: "#222222", navigation: "#333333", text: "#444444" };
    const { api, setColors, updateSetting } = makeApi("forest", colors);
    const { toggles, fields } = advancedControls(api);
    expect(toggles[0].checked).toBe(true);
    expect(fields.map((f) => [f.label, f.value])).toEqual([
      ["Navigation colour", "#333333"],
      ["Text colour", "#444444"],
    ]);
    (fields[0].onChange as (h: string) => void)("#ABCDEF");
    expect(setColors).toHaveBeenLastCalledWith({ ...colors, navigation: "#ABCDEF" });
    expect(updateSetting).toHaveBeenLastCalledWith("teachStyle", { preset: "custom" }, "brand");
    (fields[1].onChange as (h: string) => void)("#FEDCBA");
    expect(setColors).toHaveBeenLastCalledWith({ ...colors, text: "#FEDCBA" });
    expect(updateSetting).toHaveBeenLastCalledWith("teachStyle", { preset: "custom" }, "brand");
  });

  it("turning fine-tune off resets navigation/text to follow primary (null), as before", () => {
    const colors = { primary: "#111111", accent: "#222222", navigation: "#333333", text: "#444444" };
    const { api, setColors, updateSetting } = makeApi("custom", colors);
    (advancedControls(api).toggles[0].onChange as (v: boolean) => void)(false);
    expect(setColors).toHaveBeenCalledWith({ ...colors, navigation: null, text: null });
    expect(updateSetting).not.toHaveBeenCalled();
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
