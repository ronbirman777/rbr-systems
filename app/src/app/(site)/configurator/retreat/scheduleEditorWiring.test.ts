import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * TASK 033 Studio UX + addendum B - structural wiring of the Flow Schedule
 * editor (node test env, no DOM; see studioDirtyWiring.test.ts). Browser
 * behaviour is covered by the local-stack QA in docs/tasks/033.
 */
const DIR = path.join(process.cwd(), "src/app/(site)/configurator/retreat");
const src = readFileSync(path.join(DIR, "retreat-configurator.tsx"), "utf8");
const editor = src.slice(src.indexOf("function ScheduleEditor("), src.indexOf("function ScheduleEditor(") + 40000);

describe("Schedule editor: no placeholder rows", () => {
  it("no longer persists a stub on Add/Duplicate", () => {
    expect(src).not.toContain("persistNewScheduleItemStub");
    expect(src).not.toContain("persistScheduleItemRemoval");
    expect(existsSync(path.join(process.cwd(), "src/lib/modules/persistSchedule.ts"))).toBe(false);
  });

  it("an added or removed session marks the Schedule dirty, so the unsaved-changes guard covers it", () => {
    const add = src.slice(src.indexOf("function addScheduleItem("), src.indexOf("function addScheduleItem(") + 200);
    expect(add).toContain('dirty.markDirty("schedule")');
    const remove = src.slice(src.indexOf("function removeScheduleItem("), src.indexOf("function removeScheduleItem(") + 400);
    expect(remove).toContain("noteScheduleRemoval(");
    expect(remove).toContain('dirty.markDirty("schedule")');
  });

  it("Save sends only the explicitly removed ids and updates the bookkeeping only on success", () => {
    const save = src.slice(src.indexOf("async function handleSaveSchedule()"), src.indexOf("async function handleSaveFacilitators()"));
    expect(save).toContain('formData.set("removedIds"');
    expect(save).toMatch(/if \(!result\.error\) \{\s*\n\s*schedulePersistenceRef\.current = afterScheduleSave\(/);
  });
});

describe("Schedule editor: Duplicate and automatic end time", () => {
  it("has a Duplicate row action that creates a new id via the shared helper", () => {
    expect(editor).toContain('t("flow", "duplicateSession")');
    expect(editor).toContain('aria-label={t("flow", "duplicateSessionLabel")}');
    expect(editor).toContain("duplicateScheduleItem(item, crypto.randomUUID())");
  });

  it("routes start/end edits through the follow-the-start rule", () => {
    expect(editor).toContain("onChange={(e) => handleStartTime(editing.id, e.target.value)}");
    expect(editor).toContain("onChange={(e) => handleEndTime(editing.id, e.target.value)}");
    expect(editor).toContain("startTimePatch(value, endFollows[id] ?? null)");
  });

  it("only sessions created in this editor follow the start", () => {
    // endFollows is populated in openNew() (Add / Duplicate) and nowhere else
    expect(editor.match(/setEndFollows\(\(f\) => \(\{ \.\.\.f, \[/g)?.length).toBe(1);
    const openNew = editor.slice(editor.indexOf("function openNew("), editor.indexOf("function handleAdd("));
    expect(openNew).toContain("setEndFollows");
  });
});
