import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectElements, findByType, textOf } from "@/lib/spaceTypes/elementTree.test-util";

/** TASK 027.5 Phase 2B: My Spaces is registry-aware; account controls preserved. */

type Tenant = { id: string; name: string; product_type: string | null; status: string; slug: string | null; content_updated_at: string; published_spaces: unknown };

const state = vi.hoisted(() => ({
  user: { id: "u1", email: "owner@example.test" } as { id: string; email: string } | null,
  tenants: [] as unknown[],
  roles: [] as unknown[],
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
          return resolveTo([]);
        },
      }),
    };
  },
}));
vi.mock("@/app/configurator/retreat/lifecycleActions", () => ({
  getSpaceSlotSummary: async () => ({ slotsUsed: 1, slotsAllowed: 2, slotsAvailable: 1 }),
}));
vi.mock("@/components/brand/wordmark", () => ({ InnerDweSMark: function Mark() { return null; } }));
vi.mock("@/components/publish-space-button", () => ({ PublishSpaceButton: function Publish() { return null; } }));
vi.mock("@/components/space-thumbnail", () => ({ SpaceThumbnail: function Thumb() { return null; } }));
vi.mock("@/components/space-lifecycle-controls", () => ({ SpaceLifecycleControls: function Lifecycle() { return null; } }));
vi.mock("@/components/space-open-link", () => ({ SpaceOpenLink: function OpenLink() { return null; } }));
vi.mock("@/app/(auth)/actions", () => ({ signOut: async () => {} }));
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
