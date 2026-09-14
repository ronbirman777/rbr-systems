import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { STUDIO_MODULE_SECTIONS, type StudioModuleSection } from "./studioSection";

/**
 * The seven Studio module editors are React components, and this project's
 * test environment is deliberately `node` with no DOM and no React testing
 * library (see vitest.config.ts). Adding one is out of scope here, so these
 * are STRUCTURAL wiring tests: they prove each editor actually integrates
 * the shared unsaved-changes contract rather than proving rendered
 * behavior. Runtime behavior still needs browser QA - that distinction is
 * stated explicitly in the Task 004 report rather than implied away.
 *
 * They are written against observable contract points (imports, props,
 * call sites, fail-closed save ordering) so that deleting or weakening the
 * wiring in any single editor fails a test.
 */

const DIR = path.join(process.cwd(), "src/app/configurator/retreat");

const EDITOR_FILES: Record<StudioModuleSection, string> = {
  meals: "meals-step.tsx",
  treatments: "treatments-step.tsx",
  facilities: "facilities-step.tsx",
  arrival: "arrival-step.tsx",
  faq: "faq-step.tsx",
  customPages: "custom-pages-step.tsx",
  stayConnected: "stay-connected-step.tsx",
};

function editorSource(section: StudioModuleSection): string {
  return readFileSync(path.join(DIR, EDITOR_FILES[section]), "utf8");
}

const configuratorSource = readFileSync(path.join(DIR, "retreat-configurator.tsx"), "utf8");

describe("STUDIO_MODULE_SECTIONS", () => {
  it("names exactly the seven module editors the guard must cover", () => {
    expect([...STUDIO_MODULE_SECTIONS].sort()).toEqual(
      ["arrival", "customPages", "facilities", "faq", "meals", "stayConnected", "treatments"].sort()
    );
  });

  it("has no duplicate sections", () => {
    expect(new Set(STUDIO_MODULE_SECTIONS).size).toBe(STUDIO_MODULE_SECTIONS.length);
  });

  it("has a source file mapped for every section", () => {
    for (const section of STUDIO_MODULE_SECTIONS) {
      expect(() => editorSource(section)).not.toThrow();
    }
  });
});

describe.each(STUDIO_MODULE_SECTIONS)("Studio module editor: %s", (section) => {
  const src = editorSource(section);

  it("imports the shared unsaved-changes contract", () => {
    expect(src).toMatch(/import \{[^}]*useRegisteredSave[^}]*\} from "\.\/studioSection";/);
    expect(src).toContain("type StudioSectionEditorProps");
  });

  it("declares the contract on its props type, so wiring is compile-time enforced", () => {
    expect(src).toContain("} & StudioSectionEditorProps;");
  });

  it("destructures onDirty, onSaved and registerSave", () => {
    expect(src).toMatch(/onDirty,\s*onSaved,\s*registerSave\s*\}/);
  });

  it("marks the section dirty on a user edit", () => {
    expect(src).toContain("onDirty();");
  });

  it("registers its save with the parent guard", () => {
    expect(src).toContain("useRegisteredSave(registerSave, handleSave);");
  });

  it("returns a boolean result from handleSave", () => {
    expect(src).toContain("async function handleSave(): Promise<boolean> {");
  });

  it("fails closed: a save error returns false BEFORE onSaved() is ever called", () => {
    const errorReturn = src.indexOf("if (result.error) return false;");
    const savedCall = src.indexOf("onSaved();");
    expect(errorReturn).toBeGreaterThan(-1);
    expect(savedCall).toBeGreaterThan(-1);
    expect(errorReturn).toBeLessThan(savedCall);
  });

  it("clears the section only after a successful save", () => {
    expect(src).toMatch(/if \(result\.error\) return false;\s*\n\s*onSaved\(\);\s*\n\s*return true;/);
  });

  it("never clears dirty state directly - only the parent owns markClean", () => {
    expect(src).not.toContain("markClean");
  });
});

describe("retreat-configurator wiring", () => {
  it.each(STUDIO_MODULE_SECTIONS)("passes the shared section props to the %s editor", (section) => {
    expect(configuratorSource).toContain(`{...moduleSectionProps.${section}}`);
  });

  it("builds the section props from the shared section list", () => {
    expect(configuratorSource).toContain("STUDIO_MODULE_SECTIONS.map((section)");
    expect(configuratorSource).toContain("onDirty: () => markDirty(section)");
    expect(configuratorSource).toContain("onSaved: () => markClean(section)");
  });

  it("keeps a saver registry so Save-and-continue can reach each editor", () => {
    expect(configuratorSource).toContain("moduleSaversRef");
    expect(configuratorSource).toMatch(/registerSave: \(save: \(\(\) => Promise<boolean>\) \| null\) =>/);
  });

  it("saves every dirty module section during Save and continue", () => {
    expect(configuratorSource).toMatch(/for \(const section of STUDIO_MODULE_SECTIONS\) \{/);
    expect(configuratorSource).toContain("const succeeded = await save();");
  });

  it("reports failure when a dirty section has no mounted editor to save it", () => {
    const loop = configuratorSource.slice(configuratorSource.indexOf("for (const section of STUDIO_MODULE_SECTIONS) {"));
    const guard = loop.slice(0, loop.indexOf("return allSucceeded;"));
    expect(guard).toContain("if (!save) {");
    expect(guard).toContain("allSucceeded = false;");
  });

  it("still registers the native unload warning only while something is dirty", () => {
    expect(configuratorSource).toContain('window.addEventListener("beforeunload", handleBeforeUnload);');
    expect(configuratorSource).toContain('window.removeEventListener("beforeunload", handleBeforeUnload);');
    expect(configuratorSource).toMatch(/if \(!dirty\.isDirtyAnywhere\) return;/);
  });

  it("routes in-Studio navigation through the guard rather than setStep directly", () => {
    expect(configuratorSource).toContain("function attemptNavigate(action: () => void) {");
    expect(configuratorSource).toMatch(/if \(dirty\.isDirtyAnywhere\) \{\s*\n\s*setPendingNavigation/);
  });

  it("no longer claims the module editors are unwired", () => {
    expect(configuratorSource).not.toContain("not wired into this guard yet");
  });
});
