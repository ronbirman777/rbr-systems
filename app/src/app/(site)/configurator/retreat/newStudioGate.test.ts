import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TASK 032 (B2): the blank "new Flow Space" Studio is a second Create entry
 * point. With the launch flag on it must hand off to the paid funnel (/create)
 * instead of showing a form whose first save the 0038 trigger refuses; with
 * the flag off the Task 011 slot pre-check is unchanged.
 */
const state = vi.hoisted(() => ({
  mode: "legacy" as "legacy" | "paid" | "unavailable",
  slots: { slotsAllowed: 1, slotsUsed: 0, slotsAvailable: 1 },
  slotReads: 0,
}));

class Redirect extends Error {}
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));
vi.mock("next/link", () => ({ default: function Link() { return null; } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }),
}));
vi.mock("@/lib/billing/funnelMode", () => ({ getCreateMode: async () => state.mode }));
vi.mock("./lifecycleActions", () => ({
  getSpaceSlotSummary: async () => {
    state.slotReads++;
    return state.slots;
  },
}));
vi.mock("./retreat-configurator", () => ({ RetreatConfigurator: function RetreatConfigurator() { return null; } }));
vi.mock("@/components/brand/wordmark", () => ({ InnerDweSMark: function Mark() { return null; } }));

import { RetreatConfigurator } from "./retreat-configurator";
import { findByType, textOf } from "@/lib/spaceTypes/elementTree.test-util";
import NewRetreatConfiguratorPage from "./page";

beforeEach(() => {
  state.mode = "legacy";
  state.slots = { slotsAllowed: 1, slotsUsed: 0, slotsAvailable: 1 };
  state.slotReads = 0;
});

describe("new Flow Studio entry point", () => {
  it("flag OFF, slot free: renders the blank Studio (unchanged)", async () => {
    const tree = await NewRetreatConfiguratorPage();
    expect(findByType(tree, RetreatConfigurator)).toHaveLength(1);
  });

  it("flag OFF, no slot: the Task 011 'No available Space slots' screen (unchanged)", async () => {
    state.slots = { slotsAllowed: 1, slotsUsed: 1, slotsAvailable: 0 };
    const tree = await NewRetreatConfiguratorPage();
    expect(findByType(tree, RetreatConfigurator)).toHaveLength(0);
    expect(textOf(tree)).toContain("No available Space slots");
  });

  it.each([["paid"], ["unavailable"]] as const)("flag ON (%s): hands off to the paid funnel without reading slots", async (mode) => {
    state.mode = mode;
    await expect(NewRetreatConfiguratorPage()).rejects.toThrow("/create");
    expect(state.slotReads).toBe(0);
  });
});
