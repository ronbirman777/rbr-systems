import { beforeEach, describe, expect, it, vi } from "vitest";

const toBuffer = vi.fn(async (_text: string, _opts: unknown) => Buffer.from([0x89, 0x50, 0x4e, 0x47]));
vi.mock("qrcode", () => ({ default: { toBuffer: (t: string, o: unknown) => toBuffer(t, o) } }));
vi.mock("@/lib/site-url", () => ({ APP_URL: "https://preview.example.test", SITE_URL: "https://preview.example.test" }));

let user: { id: string } | null = { id: "u1" };
let row: { id: string; slug: string | null } | null = { id: "t1", slug: "my-space" };
const selected: string[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({
      select: (cols: string) => {
        selected.push(cols);
        return { eq: () => ({ maybeSingle: async () => ({ data: row }) }) };
      },
    }),
  }),
}));

import { GET } from "./route";

const call = (tenantId = "t1") => GET(new Request(`http://x/api/qr/${tenantId}`), { params: Promise.resolve({ tenantId }) });

describe("GET /api/qr/[tenantId]", () => {
  beforeEach(() => {
    user = { id: "u1" };
    row = { id: "t1", slug: "my-space" };
    selected.length = 0;
    toBuffer.mockClear();
  });

  it("encodes exactly the published Guest App URL (slug route) and returns a PNG, never cached", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(toBuffer.mock.calls[0][0]).toBe("https://preview.example.test/s/my-space");
  });

  it("falls back to the id route before a slug is reserved", async () => {
    row = { id: "t1", slug: null };
    await call();
    expect(toBuffer.mock.calls[0][0]).toBe("https://preview.example.test/g/t1");
  });

  it("follows the current slug (no stored image)", async () => {
    await call();
    row = { id: "t1", slug: "renamed" };
    await call();
    expect(toBuffer.mock.calls[1][0]).toBe("https://preview.example.test/s/renamed");
  });

  it("never reads access mode or codes, so the QR carries no secret and gated Spaces use the normal public URL", async () => {
    await call();
    expect(selected).toEqual(["id, slug"]);
    expect(String(toBuffer.mock.calls[0][0])).not.toMatch(/[?#=]|token|code|secret/i);
  });

  it("returns 404 when signed out or when RLS hides the tenant", async () => {
    user = null;
    expect((await call()).status).toBe(404);
    user = { id: "u1" };
    row = null;
    expect((await call("someone-elses")).status).toBe(404);
    expect(toBuffer).not.toHaveBeenCalled();
  });
});
