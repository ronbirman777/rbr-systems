import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const P = {
  hero: `${TENANT}/brand/hero/published.webp`,
  logo: `${TENANT}/brand/logo/published.webp`,
  item: `${TENANT}/meals/a/published.webp`,
  cover: `${TENANT}/meals/cover/published.webp`,
  draft: `${TENANT}/meals/a/draft.webp`,
};

let snapshot: unknown = null;
const mockMaybeSingle = vi.fn(async () => ({ data: snapshot }));
vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }) }),
}));

const mockSign = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ storage: { from: () => ({ createSignedUrl: mockSign }) } }),
}));

const mockAccess = vi.fn();
vi.mock("@/lib/guestAccess/effectiveAccess", () => ({ resolveGuestAccess: (...a: unknown[]) => mockAccess(...a) }));

const { GET } = await import("./route");

const modules = {
  brand: { hero: { imageRef: P.hero }, logo: { imageRef: P.logo }, space: { imageRef: null } },
  moduleCovers: { meals: { imageRef: P.cover } },
  meals: [{ id: "a", imageRef: P.item }],
};

async function call(path: string[]) {
  return GET(new Request("http://x/api/media"), { params: Promise.resolve({ path }) });
}

describe("GET /api/media - published snapshot AND current guest access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshot = { modules };
    mockAccess.mockResolvedValue("granted");
    mockSign.mockResolvedValue({ data: { signedUrl: "http://storage/sign/x?token=t" }, error: null });
  });

  it("granted Space + published path -> redirect to a SHORT-lived signed URL, never cacheable", async () => {
    const res = await call(P.item.split("/"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://storage/sign/x?token=t");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mockSign).toHaveBeenCalledWith(P.item, 60);
  });

  it("commercially unavailable Space -> 404, nothing signed (brand images too)", async () => {
    mockAccess.mockResolvedValue("unavailable");
    for (const p of [P.item, P.hero, P.cover]) expect((await call(p.split("/"))).status).toBe(404);
    expect(mockSign).not.toHaveBeenCalled();
  });

  it("code Space without access: item/cover -> 404; the code screen's own hero and logo stay reachable", async () => {
    mockAccess.mockResolvedValue("code-required");
    expect((await call(P.item.split("/"))).status).toBe(404);
    expect((await call(P.cover.split("/"))).status).toBe(404);
    expect((await call(P.hero.split("/"))).status).toBe(307);
    expect((await call(P.logo.split("/"))).status).toBe(307);
  });

  it("draft path and paths absent from the snapshot -> 404 even when access is granted", async () => {
    expect((await call(P.draft.split("/"))).status).toBe(404);
    expect((await call(`${TENANT}/meals/removed/published.webp`.split("/"))).status).toBe(404);
    expect(mockSign).not.toHaveBeenCalled();
  });

  it("unpublished tenant (no snapshot) -> 404 and no access lookup", async () => {
    snapshot = null;
    expect((await call(P.item.split("/"))).status).toBe(404);
    expect(mockAccess).not.toHaveBeenCalled();
  });

  it("cross-tenant: tenant B's file under tenant A's id is not in A's snapshot -> 404", async () => {
    expect((await call([TENANT, OTHER, "meals", "a", "published.webp"])).status).toBe(404);
    expect((await call([TENANT, "..", OTHER, "meals", "a", "published.webp"])).status).toBe(404);
    expect(mockSign).not.toHaveBeenCalled();
  });

  it("malformed paths are rejected before any lookup", async () => {
    const nul = String.fromCharCode(0);
    for (const p of [["not-a-uuid", "meals", "x"], [TENANT, "", "x"], [TENANT, ".", "x"], [TENANT, "a\\b", "x"], [TENANT, `a${nul}b`, "x"], [TENANT]]) {
      expect((await call(p)).status).toBe(404);
    }
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it("access lookup failure fails closed (503, no signed URL)", async () => {
    mockAccess.mockRejectedValue(new Error("db down"));
    const res = await call(P.item.split("/"));
    expect(res.status).toBe(503);
    expect(mockSign).not.toHaveBeenCalled();
  });

  it("storage refusing to sign -> 404", async () => {
    mockSign.mockResolvedValue({ data: null, error: { message: "nope" } });
    expect((await call(P.item.split("/"))).status).toBe(404);
  });

  it("TASK 023: versioned (uploadId) published paths are authorized by snapshot membership, like any other", async () => {
    const A = `${TENANT}/meals/a/up-A/published.webp`;
    const B = `${TENANT}/meals/a/up-B/published.webp`;
    snapshot = { modules: { meals: [{ id: "a", imageRef: A }] } };
    expect((await call(A.split("/"))).status).toBe(307);
    expect((await call(B.split("/"))).status).toBe(404); // copied but not yet published
    expect(mockSign).toHaveBeenCalledTimes(1);
    expect(mockSign).toHaveBeenCalledWith(A, 60);
  });

  it("TASK 023: after republish the OLD path is denied even though its object may still exist in Storage", async () => {
    const A = `${TENANT}/meals/a/up-A/published.webp`;
    const B = `${TENANT}/meals/a/up-B/published.webp`;
    snapshot = { modules: { meals: [{ id: "a", imageRef: B }] } };
    expect((await call(A.split("/"))).status).toBe(404);
    expect((await call(B.split("/"))).status).toBe(307);
    // Authorization never consults Storage existence - only the snapshot.
    expect(mockSign).toHaveBeenCalledTimes(1);
  });

  it("TASK 023: a versioned DRAFT path is never served", async () => {
    snapshot = { modules };
    expect((await call(`${TENANT}/meals/a/up-A/draft.webp`.split("/"))).status).toBe(404);
    expect(mockSign).not.toHaveBeenCalled();
  });
});
