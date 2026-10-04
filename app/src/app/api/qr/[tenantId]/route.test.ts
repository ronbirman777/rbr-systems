import { beforeEach, describe, expect, it, vi } from "vitest";

const toBuffer = vi.fn(async (_text: string, _opts: unknown) => Buffer.from([0x89, 0x50, 0x4e, 0x47]));
vi.mock("qrcode", () => ({ default: { toBuffer: (t: string, o: unknown) => toBuffer(t, o) } }));
vi.mock("@/lib/site-url", () => ({
  APP_URL: "https://preview.example.test",
  SITE_URL: "https://preview.example.test",
  GUEST_PUBLIC_ORIGIN: "https://preview.example.test",
}));

let user: { id: string } | null = { id: "u1" };
let row: { id: string; name?: string; slug: string | null } | null = { id: "t1", name: "Lena", slug: "my-space" };
let classRow: { id: string; title: string | null; metadata: unknown } | null = null;
const selected: string[] = [];
const tables: string[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) => {
      tables.push(table);
      return {
        select: (cols: string) => {
          selected.push(cols);
          const data = table === "module_items" ? classRow : row;
          const chain: Record<string, unknown> = { maybeSingle: async () => ({ data }) };
          chain.eq = () => chain;
          return chain;
        },
      };
    },
  }),
}));

import { GET } from "./route";

const call = (tenantId = "t1") => GET(new Request(`http://x/api/qr/${tenantId}`), { params: Promise.resolve({ tenantId }) });

describe("GET /api/qr/[tenantId]", () => {
  beforeEach(() => {
    user = { id: "u1" };
    row = { id: "t1", slug: "my-space" };
    selected.length = 0;
    tables.length = 0;
    classRow = null;
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
    // Only the tenant's own id/name/slug - never an access mode, code or
    // any other column that could carry a secret into the encoded URL.
    expect(selected).toEqual(["id, name, slug"]);
    expect(selected.join(" ")).not.toMatch(/access|code|secret|token/i);
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

describe("GET /api/qr/[tenantId]?class= (WhatsApp registration QR)", () => {
  const withClass = (registration: Record<string, unknown>, title = "Morning Vinyasa Flow") => {
    classRow = {
      id: "c1",
      title,
      metadata: {
        startDate: "2026-10-05",
        startTime: "07:00",
        endTime: "08:30",
        location: "The Bamboo Shala",
        registration,
      },
    };
  };
  const callClass = (classId = "c1") =>
    GET(new Request(`http://x/api/qr/t1?class=${classId}`), { params: Promise.resolve({ tenantId: "t1" }) });

  beforeEach(() => {
    user = { id: "u1" };
    row = { id: "t1", name: "Lena", slug: "my-space" };
    selected.length = 0;
    tables.length = 0;
    classRow = null;
    toBuffer.mockClear();
  });

  it("encodes a prefilled wa.me link built from the stored number, with the Space URL", async () => {
    withClass({ method: "whatsapp", value: "+62 812 3456 7890" });
    const res = await callClass();
    expect(res.status).toBe(200);

    const encoded = String(toBuffer.mock.calls[0][0]);
    expect(encoded.startsWith("https://wa.me/6281234567890?text=")).toBe(true);
    const text = new URL(encoded).searchParams.get("text")!;
    expect(text).toContain("Hi Lena");
    expect(text).toContain("Morning Vinyasa Flow");
    expect(text).toContain("https://preview.example.test/s/my-space");
    expect(tables).toContain("module_items");
  });

  it("is a 404 for any registration method other than WhatsApp", async () => {
    for (const registration of [
      { method: "website", value: "https://innerdwes.com/" },
      { method: "instagram", value: "https://instagram.com/innerdwes" },
      { method: "email", value: "hi@example.test" },
      { method: null, value: null },
    ]) {
      withClass(registration);
      expect((await callClass()).status).toBe(404);
    }
    expect(toBuffer).not.toHaveBeenCalled();
  });

  it("is a 404 when the number is not a valid public number, so nothing half-configured leaks", async () => {
    withClass({ method: "whatsapp", value: "123" });
    expect((await callClass()).status).toBe(404);
    withClass({ method: "whatsapp", value: null });
    expect((await callClass()).status).toBe(404);
    expect(toBuffer).not.toHaveBeenCalled();
  });

  it("is a 404 when the class is not this tenant's (RLS returns nothing)", async () => {
    classRow = null;
    expect((await callClass()).status).toBe(404);
    expect(toBuffer).not.toHaveBeenCalled();
  });
});
