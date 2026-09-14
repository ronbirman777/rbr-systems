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
