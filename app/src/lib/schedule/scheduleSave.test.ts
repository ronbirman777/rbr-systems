import { describe, expect, it } from "vitest";
import {
  afterScheduleSave,
  noteScheduleRemoval,
  parseRemovedIds,
  scheduleIdsToDelete,
  schedulePersistenceFrom,
} from "./scheduleSave";

/** TASK 033 addendum B: explicit deletes and editor-side persistence bookkeeping. */

describe("parseRemovedIds", () => {
  it("treats a missing field as nothing removed", () => {
    expect(parseRemovedIds(null)).toEqual([]);
    expect(parseRemovedIds("")).toEqual([]);
  });
  it("accepts a JSON array of ids", () => {
    expect(parseRemovedIds('["a","b"]')).toEqual(["a", "b"]);
  });
  it("rejects anything malformed (fail closed: no delete at all)", () => {
    for (const v of ["nope", "{}", "[1]", '[""]', '"a"']) expect(parseRemovedIds(v), v).toBeNull();
  });
});

describe("scheduleIdsToDelete", () => {
  it("never deletes an id that is also being saved, and de-duplicates", () => {
    expect(scheduleIdsToDelete(["a", "b", "a", "c"], ["b"])).toEqual(["a", "c"]);
  });
  it("deletes nothing when nothing was removed - rows the editor never loaded are safe", () => {
    expect(scheduleIdsToDelete([], ["x"])).toEqual([]);
  });
});

describe("editor persistence bookkeeping", () => {
  it("a new (never saved) session removed again is never sent for deletion", () => {
    const s = schedulePersistenceFrom(["saved-1"]);
    expect(noteScheduleRemoval(s, "new-1").removed.size).toBe(0);
  });

  it("removing one saved session marks exactly that one", () => {
    const s = noteScheduleRemoval(schedulePersistenceFrom(["a", "b", "c"]), "b");
    expect([...s.removed]).toEqual(["b"]);
    expect(scheduleIdsToDelete([...s.removed], ["a", "c"])).toEqual(["b"]);
  });

  it("twins (identical content, distinct ids) are independent", () => {
    const s = noteScheduleRemoval(schedulePersistenceFrom(["twin-a", "twin-b"]), "twin-a");
    expect(scheduleIdsToDelete([...s.removed], ["twin-b"])).toEqual(["twin-a"]);
  });

  it("after a save, new ids count as persisted and deleted ids are forgotten", () => {
    let s = schedulePersistenceFrom(["a", "b"]);
    s = noteScheduleRemoval(s, "b");
    s = afterScheduleSave(s, ["a", "new-1"], ["b"]);
    expect([...s.persisted].sort()).toEqual(["a", "new-1"]);
    expect(s.removed.size).toBe(0);
    // ...so removing the just-saved new one is now a real delete
    expect([...noteScheduleRemoval(s, "new-1").removed]).toEqual(["new-1"]);
  });
});
