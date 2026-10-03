import { describe, expect, it } from "vitest";
import { getPublishAvailability } from "./publishAvailability";
import { SPACE_TYPES, SPACE_TYPE_IDS } from "./registry";

describe("getPublishAvailability (TASK 027.5 Phase 2B)", () => {
  it("Retreat is publishable", () => {
    expect(getPublishAvailability("retreat")).toEqual({ available: true });
  });

  it("Teach is publishable (migration 0028 + publishTeachSpace, Phase 4A)", () => {
    expect(getPublishAvailability("teach")).toEqual({ available: true });
  });

  it("client_hub is registered but explicitly unavailable, naming the product", () => {
    const r = getPublishAvailability("client_hub");
    expect(r.available).toBe(false);
    if (!r.available) expect(r.message).toContain(SPACE_TYPES.client_hub.product.name);
  });

  it.each([["client_hub"], ["mystery"], [""], [null], [undefined]])("fails closed for %j", (type) => {
    expect(getPublishAvailability(type as string | null | undefined).available).toBe(false);
  });

  it("exactly retreat and teach are publishable - any new type is closed by default until opted in", () => {
    const open = SPACE_TYPE_IDS.filter((id) => getPublishAvailability(id).available);
    expect(open).toEqual(["retreat", "teach"]);
  });
});
