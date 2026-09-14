import { describe, expect, it } from "vitest";
import { faqItemSchema, publishedFaqItemSchema } from "./faq";

describe("faqItemSchema (Studio/editable shape)", () => {
  it("accepts a complete item", () => {
    const result = faqItemSchema.safeParse({ question: "What should I pack?", answer: "Comfortable clothes.", enabled: true });
    expect(result.success).toBe(true);
  });

  it("accepts a null answer", () => {
    const result = faqItemSchema.safeParse({ question: "Draft question", answer: null, enabled: false });
    expect(result.success).toBe(true);
  });

  it("rejects an empty question", () => {
    const result = faqItemSchema.safeParse({ question: "", answer: null, enabled: true });
    expect(result.success).toBe(false);
  });

  it("requires enabled to be present", () => {
    const result = faqItemSchema.safeParse({ question: "Q", answer: null });
    expect(result.success).toBe(false);
  });
});

describe("publishedFaqItemSchema (guest-facing shape)", () => {
  it("has no enabled field - disabled items are filtered before this shape exists", () => {
    const result = publishedFaqItemSchema.safeParse({ question: "Q", answer: "A" });
    expect(result.success).toBe(true);
    if (result.success) expect("enabled" in result.data).toBe(false);
  });

  it("accepts a null answer", () => {
    expect(publishedFaqItemSchema.safeParse({ question: "Q", answer: null }).success).toBe(true);
  });
});
