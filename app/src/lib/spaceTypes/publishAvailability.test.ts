import { describe, expect, it } from "vitest";
import { getPublishAvailability } from "./publishAvailability";
import { SPACE_TYPES, SPACE_TYPE_IDS } from "./registry";

describe("getPublishAvailability (TASK 027.5 Phase 2B)", () => {
  it("only Retreat is publishable until Teach has media (Phase 3) and publish_space (Phase 5)", () => {
    expect(getPublishAvailability("retreat")).toEqual({ available: true });
  });

  it("Teach is explicitly unavailable, naming the product", () => {
    const r = getPublishAvailability("teach");
    expect(r.available).toBe(false);
    if (!r.available) expect(r.message).toContain(SPACE_TYPES.teach.product.name);
  });

  it.each([["client_hub"], ["mystery"], [""], [null], [undefined]])("fails closed for %j", (type) => {
    expect(getPublishAvailability(type as string | null | undefined).available).toBe(false);
  });

  it("exactly one registered type (retreat) is publishable - any new type is closed by default until opted in", () => {
    const open = SPACE_TYPE_IDS.filter((id) => getPublishAvailability(id).available);
    expect(open).toEqual(["retreat"]);
  });
});
