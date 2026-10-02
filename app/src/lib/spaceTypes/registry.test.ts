import { describe, expect, it } from "vitest";
import { SPACE_TYPES, getSpaceType, resolveSpaceType, studioHref, studioRouteDecision, CREATE_ORDER } from "./registry";
import { PRODUCT_FAMILIES } from "@/lib/brand/productFamilies";

const T = "11111111-2222-4333-8444-555555555555";

describe("Space Type Registry", () => {
  it("pins Time to Flow to its pre-registry behaviour", () => {
    const r = SPACE_TYPES.retreat;
    expect(r.product).toMatchObject({ name: "Time to Flow", tagline: "For retreats and wellness programs.", accent: "#A86750" });
    expect(r.studio).toEqual({ basePath: "/configurator/retreat", publishQuery: "step=publish" });
    expect(r.create).toEqual({ kind: "link", href: "/configurator/retreat" });
    expect(r.guest).toEqual({ renderer: "retreat" });
    expect(r.publish.sqlBuilder).toBeNull();
    expect(r.copy.untitledName).toBe("Untitled Retreat");
    expect(r.copy.guestAccess).toEqual({ title: "Private Retreat", openLabel: "Open Retreat", askHint: "Ask your retreat organizer for the access code." });
    expect(studioHref("retreat", T)).toBe(`/configurator/retreat/${T}`);
    expect(studioHref("retreat", T, { publish: true })).toBe(`/configurator/retreat/${T}?step=publish`);
  });

  it("Time to Teach routes and copy", () => {
    expect(studioHref("teach", T, { publish: true })).toBe(`/configurator/teach/${T}?section=publish`);
    expect(SPACE_TYPES.teach.copy.guestAccess.title).not.toMatch(/retreat/i);
    expect(SPACE_TYPES.teach.copy.untitledName).not.toMatch(/retreat/i);
    expect(SPACE_TYPES.teach.publish.sqlBuilder).toBe("build_teach_payload");
  });

  it("never falls back for unknown explicit types", () => {
    expect(resolveSpaceType("sanctuary")).toEqual({ kind: "unknown", value: "sanctuary" });
    expect(resolveSpaceType("RETREAT")).toEqual({ kind: "unknown", value: "RETREAT" });
    expect(resolveSpaceType(null)).toEqual({ kind: "unknown", value: null });
    expect(getSpaceType("bogus")).toBeNull();
    expect(studioHref("bogus", T)).toBeNull();
  });

  it("types without a Studio or guest app are not routable", () => {
    expect(studioHref("client_hub", T)).toBeNull();
    expect(SPACE_TYPES.client_hub.guest).toBeNull();
    expect(SPACE_TYPES.client_hub.create.kind).toBe("none");
  });

  it("studio route decisions: render / redirect / unsupported", () => {
    expect(studioRouteDecision("retreat", "retreat", T)).toEqual({ action: "render" });
    expect(studioRouteDecision("teach", "retreat", T)).toEqual({ action: "redirect", href: `/configurator/teach/${T}` });
    expect(studioRouteDecision("retreat", "teach", T)).toEqual({ action: "redirect", href: `/configurator/retreat/${T}` });
    expect(studioRouteDecision("client_hub", "retreat", T)).toEqual({ action: "unsupported" });
    expect(studioRouteDecision("mystery", "teach", T)).toEqual({ action: "unsupported" });
  });

  it("product families are derived from the registry (sanctuary stays marketing-only)", () => {
    expect(PRODUCT_FAMILIES.retreat.name).toBe(SPACE_TYPES.retreat.product.name);
    expect(PRODUCT_FAMILIES.client_hub.accent).toBe("#BAC5B2");
    expect(PRODUCT_FAMILIES.sanctuary.name).toBe("Time to Elevate");
    expect(CREATE_ORDER).toEqual(["retreat", "teach", "client_hub"]);
  });
});
