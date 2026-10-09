import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectElements, findByType, textOf } from "@/lib/spaceTypes/elementTree.test-util";

/** TASK 027.5 Phase 2B: My Spaces is registry-aware; account controls preserved. */

type Tenant = { id: string; name: string; product_type: string | null; status: string; slug: string | null; content_updated_at: string; published_spaces: unknown };

const state = vi.hoisted(() => ({
  user: { id: "u1", email: "owner@example.test" } as { id: string; email: string } | null,
  tenants: [] as unknown[],
  roles: [] as unknown[],
  mode: "legacy" as "legacy" | "paid" | "unavailable",
  subs: [] as unknown[],
  slots: { slotsUsed: 1, slotsAllowed: 2, slotsAvailable: 1 },
}));

class Redirect extends Error {}
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));
vi.mock("@/lib/i18n/accountLocale", () => ({ getAccountLocale: async () => "en" }));
vi.mock("next/link", () => ({ default: function Link() { return null; } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const resolveTo = (data: unknown) => {
      const p: Record<string, unknown> = { then: (ok: (v: unknown) => unknown) => Promise.resolve({ data }).then(ok) };
      p.order = () => p;
      p.eq = () => p;
      p.in = () => p;
      return p;
    };
    return {
      auth: { getUser: async () => ({ data: { user: state.user } }) },
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
      from: (table: string) => ({
        select: () => {
          if (table === "tenants") return resolveTo(state.tenants);
          if (table === "tenant_members") return resolveTo(state.roles);
          if (table === "space_subscriptions") return resolveTo(state.subs);
          return resolveTo([]);
        },
      }),
    };
  },
}));
vi.mock("@/app/(site)/configurator/retreat/lifecycleActions", () => ({
  getSpaceSlotSummary: async () => state.slots,
}));
vi.mock("@/lib/billing/funnelMode", () => ({ getCreateMode: async () => state.mode }));
vi.mock("@/components/brand/wordmark", () => ({ InnerDweSMark: function Mark() { return null; } }));
vi.mock("@/components/publish-space-button", () => ({ PublishSpaceButton: function Publish() { return null; } }));
vi.mock("@/components/space-thumbnail", () => ({ SpaceThumbnail: function Thumb() { return null; } }));
vi.mock("@/components/space-lifecycle-controls", () => ({ SpaceLifecycleControls: function Lifecycle() { return null; } }));
vi.mock("@/components/space-open-link", () => ({ SpaceOpenLink: function OpenLink() { return null; } }));
vi.mock("@/app/(site)/(auth)/actions", () => ({ signOut: async () => {} }));
vi.mock("@/components/logout-button", () => ({ LogoutButton: function Logout() { return null; } }));
vi.mock("@/components/delete-space-control", () => ({ DeleteSpaceControl: function DeleteSpace() { return null; } }));
vi.mock("@/components/delete-account-control", () => ({ DeleteAccountControl: function DeleteAccount() { return null; } }));

import { PublishSpaceButton } from "@/components/publish-space-button";
import { SpaceLifecycleControls } from "@/components/space-lifecycle-controls";
import { SpaceOpenLink } from "@/components/space-open-link";
import { DeleteAccountControl } from "@/components/delete-account-control";
import { DeleteSpaceControl } from "@/components/delete-space-control";
import MySpacePage from "./page";

const ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const tenant = (over: Partial<Tenant>): Tenant => ({
  id: ID,
  name: "Mine",
  product_type: "retreat",
  status: "active",
  slug: null,
  content_updated_at: "2026-01-01T00:00:00Z",
  published_spaces: null,
  ...over,
});

async function render(tenants: Tenant[], role = "owner") {
  state.tenants = tenants;
  state.roles = tenants.map((t) => ({ tenant_id: t.id, role }));
  return MySpacePage();
}
const hrefs = (tree: unknown) => findByType(tree, SpaceOpenLink).map((e) => e.props.href);

beforeEach(() => {
  state.user = { id: "u1", email: "owner@example.test" };
  state.tenants = [];
  state.roles = [];
  state.mode = "legacy";
  state.subs = [];
  state.slots = { slotsUsed: 1, slotsAllowed: 2, slotsAvailable: 1 };
});

describe("My Spaces - registry-aware (TASK 027.5 Phase 2B)", () => {
  it("Retreat: Manage Space / Preview point at the Retreat Studio exactly as before, Publish chip present", async () => {
    const tree = await render([tenant({ product_type: "retreat" })]);
    expect(hrefs(tree)).toEqual([`/configurator/retreat/${ID}`, `/configurator/retreat/${ID}?step=publish`]);
    expect(findByType(tree, PublishSpaceButton)).toHaveLength(1);
    expect(textOf(tree)).toContain("Time to Flow");
  });

  it("Teach: Manage Space / Preview point at the Teach Studio and the Publish chip is offered", async () => {
    const tree = await render([tenant({ product_type: "teach" })]);
    expect(hrefs(tree)).toEqual([`/configurator/teach/${ID}`, `/configurator/teach/${ID}?section=publish`]);
    expect(findByType(tree, PublishSpaceButton)).toHaveLength(1);
    expect(textOf(tree)).not.toContain("isn't available yet");
  });

  it.each([["mystery"], [""], [null]])("unsupported product_type %j: no Studio links, no Publish, labelled unsupported", async (type) => {
    const tree = await render([tenant({ product_type: type })]);
    expect(hrefs(tree)).toEqual([]);
    expect(findByType(tree, PublishSpaceButton)).toHaveLength(0);
    expect(textOf(tree)).toContain("Unsupported Space type");
    expect(textOf(tree)).toContain("can’t be opened here");
  });

  it("client_hub (registered, no Studio yet) is treated as unsupported - never opens another product's Studio", async () => {
    const tree = await render([tenant({ product_type: "client_hub" })]);
    expect(hrefs(tree)).toEqual([]);
    expect(findByType(tree, PublishSpaceButton)).toHaveLength(0);
  });

  it("an unsupported Space still gets its owner lifecycle controls (Replace/Delete stay reachable) with a safe default name", async () => {
    const tree = await render([tenant({ product_type: "mystery" })]);
    const lifecycle = findByType(tree, SpaceLifecycleControls);
    expect(lifecycle).toHaveLength(1);
    expect(lifecycle[0].props.untitledName).toBe("Untitled Space");
    expect(findByType(tree, DeleteSpaceControl)).toHaveLength(1);
  });

  it("passes each product's own default name to the Replace dialog", async () => {
    const tree = await render([tenant({ id: "t-r", product_type: "retreat" }), tenant({ id: "t-t", product_type: "teach" })]);
    const names = findByType(tree, SpaceLifecycleControls).map((e) => e.props.untitledName);
    expect(names).toEqual(["Untitled Retreat", "My Teaching Space"]);
  });

  it("a mixed list renders every Space under its own product", async () => {
    const tree = await render([tenant({ id: "t-r", product_type: "retreat" }), tenant({ id: "t-t", product_type: "teach" })]);
    expect(hrefs(tree)).toEqual([
      "/configurator/retreat/t-r",
      "/configurator/retreat/t-r?step=publish",
      "/configurator/teach/t-t",
      "/configurator/teach/t-t?section=publish",
    ]);
  });

  it("archived Spaces offer no Studio/Publish regardless of product", async () => {
    const tree = await render([tenant({ product_type: "teach", status: "archived" })]);
    expect(hrefs(tree)).toEqual([]);
    expect(findByType(tree, PublishSpaceButton)).toHaveLength(0);
  });

  it("non-owner members get no lifecycle or delete controls", async () => {
    const tree = await render([tenant({ product_type: "teach" })], "member");
    expect(findByType(tree, SpaceLifecycleControls)).toHaveLength(0);
    expect(findByType(tree, DeleteSpaceControl)).toHaveLength(0);
  });

  it("DeleteAccountControl is present with the signed-in email and the real Space count", async () => {
    const tree = await render([tenant({ id: "a", product_type: "retreat" }), tenant({ id: "b", product_type: "teach" }), tenant({ id: "c", product_type: "mystery" })]);
    const del = findByType(tree, DeleteAccountControl);
    expect(del).toHaveLength(1);
    expect(del[0].props).toMatchObject({ email: "owner@example.test", spaceCount: 3 });
  });

  it("DeleteAccountControl is present even with zero Spaces", async () => {
    const tree = await render([]);
    expect(findByType(tree, DeleteAccountControl)[0].props).toMatchObject({ email: "owner@example.test", spaceCount: 0 });
  });

  it("signed-out visitors are redirected to log-in before anything renders", async () => {
    state.user = null;
    await expect(MySpacePage()).rejects.toThrow("/log-in");
  });

  it("the page is still force-dynamic (no bfcache of an authenticated snapshot)", async () => {
    const mod = await import("./page");
    expect(mod.dynamic).toBe("force-dynamic");
    expect(collectElements(await render([])).length).toBeGreaterThan(0);
  });
});

/** TASK 032 (B2): Restore / Replace visibility per launch-flag mode. */
describe("My Spaces - Restore / Replace under billing (TASK 032 B2)", () => {
  const PAID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const subRow = (tenantId: string, over: Record<string, unknown> = {}) => ({
    id: `s-${tenantId}`, tenant_id: tenantId, status: "active", cancel_at_period_end: false,
    current_period_end: "2099-01-01T00:00:00Z", payment_failed_at: null, exempt_expires_at: null, next_action: "renewal", ...over,
  });
  const controls = (tree: unknown) =>
    Object.fromEntries(findByType(tree, SpaceLifecycleControls).map((e) => [e.props.tenantId, e.props]));

  it("flag OFF: exactly the Task 011 rule - live Space shows Replace only when no slot is free; archived shows both", async () => {
    state.slots = { slotsUsed: 1, slotsAllowed: 2, slotsAvailable: 1 };
    let c = controls(await render([tenant({ id: "live" }), tenant({ id: "arch", status: "archived" })]));
    expect(c.live).toMatchObject({ showRestore: false, showReplace: false, billingLockedNote: null });
    expect(c.arch).toMatchObject({ showRestore: true, showReplace: true, billingLockedNote: null });

    state.slots = { slotsUsed: 2, slotsAllowed: 2, slotsAvailable: 0 };
    c = controls(await render([tenant({ id: "live" })]));
    expect(c.live).toMatchObject({ showReplace: true });
  });

  it("flag OFF: a billing row does not change anything (no lock note, slot copy kept)", async () => {
    state.subs = [subRow(ID, { status: "canceled" })];
    const tree = await render([tenant({ status: "archived" })]);
    expect(controls(tree)[ID]).toMatchObject({ showRestore: true, showReplace: true, billingLockedNote: null });
    expect(textOf(tree)).toContain("Still uses one Space slot");
  });

  it.each([["paid"], ["unavailable"]] as const)("flag ON (%s): an active paid Space offers Replace regardless of slots; archived offers Restore", async (mode) => {
    state.mode = mode;
    state.slots = { slotsUsed: 3, slotsAllowed: 1, slotsAvailable: 0 };
    state.subs = [subRow(ID), subRow(PAID)];
    const tree = await render([tenant({ id: ID }), tenant({ id: PAID, status: "archived" })]);
    const c = controls(tree);
    expect(c[ID]).toMatchObject({ showRestore: false, showReplace: true, billingLockedNote: null });
    expect(c[PAID]).toMatchObject({ showRestore: true, showReplace: true, billingLockedNote: null });
    expect(textOf(tree)).not.toContain("Still uses one Space slot");
    expect(textOf(tree)).not.toContain("slot used");
  });

  it("flag ON: an archived Space whose subscription ended shows neither action, only the billing note", async () => {
    state.mode = "paid";
    state.subs = [subRow(ID, { status: "canceled" })];
    const c = controls(await render([tenant({ status: "archived" })]));
    expect(c[ID]).toMatchObject({
      showRestore: false,
      showReplace: false,
      billingLockedNote: "Resolve billing for this Space before restoring or replacing it.",
    });
  });

  it("flag ON: an exempt internal Space behaves like a paying one", async () => {
    state.mode = "paid";
    state.slots = { slotsUsed: 5, slotsAllowed: 1, slotsAvailable: 0 };
    state.subs = [subRow(ID, { status: "exempt", current_period_end: null })];
    const c = controls(await render([tenant({ status: "archived" })]));
    expect(c[ID]).toMatchObject({ showRestore: true, showReplace: true, billingLockedNote: null });
  });

  it("flag ON: a legacy Space's Restore is judged against legacy Spaces only", async () => {
    state.mode = "paid";
    // allowance 1: the legacy archived Space + one bought Space -> still fine
    state.slots = { slotsUsed: 2, slotsAllowed: 1, slotsAvailable: 0 };
    state.subs = [subRow(PAID)];
    const c = controls(await render([tenant({ id: ID, status: "archived" }), tenant({ id: PAID })]));
    expect(c[ID]).toMatchObject({ showRestore: true, showReplace: true });
  });
});
