import { describe, expect, it } from "vitest";
import { customPageSchema, publishedCustomPageSchema } from "./customPage";

describe("customPageSchema (Studio/editable shape)", () => {
  it("accepts a complete page", () => {
    const result = customPageSchema.safeParse({ title: "What to Bring", body: "Comfortable clothes.", imageRef: null, enabled: true });
    expect(result.success).toBe(true);
  });

  it("rejects an empty title", () => {
    const result = customPageSchema.safeParse({ title: "", body: null, imageRef: null, enabled: true });
    expect(result.success).toBe(false);
  });

  it("accepts an organizer-chosen title with no fixed vocabulary", () => {
    for (const title of ["Community Guidelines", "About the Retreat", "Ceremony Information", "Anything At All"]) {
      expect(customPageSchema.safeParse({ title, body: null, imageRef: null, enabled: true }).success).toBe(true);
    }
  });
});

describe("publishedCustomPageSchema (guest-facing shape)", () => {
  it("has no enabled field", () => {
    const result = publishedCustomPageSchema.safeParse({ title: "T", body: "B", imageRef: null });
    expect(result.success).toBe(true);
    if (result.success) expect("enabled" in result.data).toBe(false);
  });
});

/**
 * TASK 020 - a legacy published snapshot (written before imagePosition
 * existed) has no such key at all; a stale/invalid one might carry a
 * malformed value. Both must resolve to null (render at the shared
 * default), never fail parsing - the exact same backward-compatibility
 * discipline already proven for facilitators' imagePosition
 * (facilitator.test.ts), now covering this module's own shape too.
 */
describe("customPageSchema/publishedCustomPageSchema - imagePosition (TASK 020)", () => {
  it("defaults to null when entirely absent (legacy content)", () => {
    const result = publishedCustomPageSchema.safeParse({ title: "T", body: "B", imageRef: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.imagePosition).toBeNull();
  });

  it("accepts a valid position on the editable schema", () => {
    const result = customPageSchema.safeParse({
      title: "T",
      body: null,
      imageRef: "t1/customPages/i1/draft.webp",
      enabled: true,
      imagePosition: { x: 80, y: 20 },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.imagePosition).toEqual({ x: 80, y: 20 });
  });

  it("rejects an out-of-range position rather than silently clamping at the schema layer", () => {
    const result = customPageSchema.safeParse({
      title: "T",
      body: null,
      imageRef: null,
      enabled: true,
      imagePosition: { x: 101, y: 0 },
    });
    expect(result.success).toBe(false);
  });
});
