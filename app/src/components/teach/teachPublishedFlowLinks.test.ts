import { describe, expect, it, vi } from "vitest";

const flow = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/teach/flowLinkServer", () => ({ checkFlowGuestUrl: flow }));
vi.mock("./teach-guest-app", () => ({ TeachGuestApp: function Guest() { return null; } }));

import { TeachPublishedSpaceScreen } from "./teach-published-screen";

const space = (retreats: unknown[]) => ({
  name: "Lena Hoffmann",
  theme: null,
  timezone: "Asia/Bangkok",
  enabled_modules: ["teachRetreats"],
  modules: { teach: { settings: {}, items: { teachRetreats: retreats } } },
});
const r = (id: string, flowGuestUrl: string | null) => ({ id, title: `Retreat ${id}`, subtitle: null, description: "d", imageRef: null, externalLink: null, metadata: { enabled: true, flowGuestUrl } });

async function dataFor(retreats: unknown[]) {
  const el = (await TeachPublishedSpaceScreen({ space: space(retreats) })) as { props: { children: { props: { data: { retreats: { id: string; metadata: { flowGuestUrl: string | null } }[] } } } } };
  return el.props.children.props.data.retreats;
}

describe("published Teach page re-verifies linked Flow Spaces on every render", () => {
  it("keeps a link that is still public, as its canonical address", async () => {
    flow.mockResolvedValue({ ok: true, canonicalUrl: "https://innerdwes.com/s/a-space", name: "A" });
    const out = await dataFor([r("1", "https://innerdwes.com/s/a-space")]);
    expect(out[0].metadata.flowGuestUrl).toBe("https://innerdwes.com/s/a-space");
  });

  it.each(["notFound", "notFlow", "notPublic", "invalid"])("drops the link when the Space is now %s - but the retreat still shows", async (reason) => {
    flow.mockResolvedValue({ ok: false, reason });
    const out = await dataFor([r("1", "https://innerdwes.com/s/gone")]);
    expect(out).toHaveLength(1);
    expect(out[0].metadata.flowGuestUrl).toBeNull();
  });

  it("a failing lookup fails CLOSED (no link), never open", async () => {
    flow.mockRejectedValue(new Error("db down"));
    const out = await dataFor([r("1", "https://innerdwes.com/s/a-space")]);
    expect(out[0].metadata.flowGuestUrl).toBeNull();
  });

  it("retreats without a link cost no lookup", async () => {
    flow.mockReset();
    await dataFor([r("1", null), r("2", null)]);
    expect(flow).not.toHaveBeenCalled();
  });
});
