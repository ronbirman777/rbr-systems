import { beforeEach, describe, expect, it, vi } from "vitest";
import { findByType, textOf, collectElements } from "@/lib/spaceTypes/elementTree.test-util";

/** TASK 027.5 Phase 2B: Create page - Retreat unchanged, Teach added on the same slot model. */

const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  slotsAvailable: 1,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("next/link", () => ({ default: function Link() { return null; } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}));
vi.mock("@/components/brand/wordmark", () => ({ InnerDweSMark: function Mark() { return null; } }));
vi.mock("@/app/configurator/retreat/lifecycleActions", () => ({
  getSpaceSlotSummary: async () => ({ slotsUsed: 2 - state.slotsAvailable, slotsAllowed: 2, slotsAvailable: state.slotsAvailable }),
}));
vi.mock("@/app/configurator/teach/actions", () => ({ createTeachSpace: async function createTeachSpaceSentinel() {} }));

import Link from "next/link";
import { createTeachSpace } from "@/app/configurator/teach/actions";
import { CreateTeachSubmit } from "./create-teach-submit";
import CreatePage from "./page";

const render = (error?: string) => CreatePage({ searchParams: Promise.resolve({ error }) });

beforeEach(() => {
  state.user = { id: "u1" };
  state.slotsAvailable = 1;
});

describe("Create page (TASK 027.5 Phase 2B)", () => {
  it("Retreat card is the unchanged link to the Retreat configurator", async () => {
    const tree = await render();
    const links = findByType(tree, Link).map((e) => e.props.href);
    expect(links).toContain("/configurator/retreat");
    expect(textOf(tree)).toContain("Time to Flow");
  });

  it("Teach card is a form posting to createTeachSpace (server-side create, then Studio redirect)", async () => {
    const tree = await render();
    const forms = findByType(tree, "form").filter((f) => f.props.action === createTeachSpace);
    expect(forms).toHaveLength(1);
    // The submit control is the pending-aware client button: it owns type=submit,
    // data-testid=create-teach and the disabled-while-pending behaviour.
    const submit = collectElements(forms[0]).find((e) => e.type === CreateTeachSubmit);
    expect(submit).toBeTruthy();
    expect(submit?.props.pendingLabel).toMatch(/creating/i);
    expect(textOf(forms[0])).toContain("Time to Teach");
  });

  it("Heal stays Coming Soon and is not actionable", async () => {
    const tree = await render();
    expect(textOf(tree)).toContain("Coming Soon");
    expect(findByType(tree, "form")).toHaveLength(1);
  });

  it("no slots available: the same honest no-slots screen, and NO create entry for any product", async () => {
    state.slotsAvailable = 0;
    const tree = await render();
    expect(textOf(tree)).toContain("No available Space slots");
    expect(findByType(tree, "form")).toHaveLength(0);
    expect(findByType(tree, Link).map((e) => e.props.href)).toEqual(["/space"]);
  });

  it("signed-out visitors are redirected to log-in", async () => {
    state.user = null;
    await expect(render()).rejects.toThrow("REDIRECT:/log-in");
  });

  it("shows the slots message for ?error=slots and a generic one otherwise", async () => {
    expect(textOf(await render("slots"))).toContain("used all your available Space slots");
    expect(textOf(await render("create"))).toContain("couldn't create that Space");
    expect(textOf(await render())).not.toContain("couldn't create");
  });
});
