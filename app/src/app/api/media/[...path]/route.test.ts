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

// The signed-in member's own session client: module_items rows visible to
// them (RLS), keyed by item id. `user` null = anonymous.
let sessionUser: { id: string } | null = null;
let draftRows: Array<{ id: string; tenant_id: string; metadata: Record<string, unknown> | null }> = [];
let sessionThrows = false;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    if (sessionThrows) throw new Error("no cookies");
    return {
      auth: { getUser: async () => ({ data: { user: sessionUser } }) },
      from: () => {
        const f: Record<string, unknown> = {};
        const q = {
          select: () => q,
          eq: (c: string, v: unknown) => {
            f[c] = v;
            return q;
          },
          maybeSingle: async () => ({
            data: draftRows.find((r) => r.id === f.id && r.tenant_id === f.tenant_id) ?? null,
            error: null,
          }),
        };
        return q;
      },
    };
  },
}));

const mockAccess = vi.fn();
// The Space's access mode, which /api/media needs in order to decide
// whether a response may be cached publicly. Defaults to "code" so every
// pre-existing test keeps the old, uncacheable contract unless it opts in.
let accessMode: "public" | "code" = "code";
vi.mock("@/lib/guestAccess/effectiveAccess", () => ({
  resolveGuestAccess: (...a: unknown[]) => mockAccess(...a),
  resolveGuestAccessDetailed: async (...a: unknown[]) => {
    const state = await mockAccess(...a);
    return { state, mode: state === "unavailable" ? null : accessMode };
  },
}));

const { GET } = await import("./route");

const modules = {
  brand: { hero: { imageRef: P.hero }, logo: { imageRef: P.logo }, space: { imageRef: null } },
  moduleCovers: { meals: { imageRef: P.cover } },
  meals: [{ id: "a", imageRef: P.item }],
};

async function call(path: string[], query = "") {
  return GET(new Request(`http://x/api/media${query ? `?${query}` : ""}`), {
    params: Promise.resolve({ path }),
  });
}

describe("GET /api/media - published snapshot AND current guest access", () => {
  beforeEach(() => {
    accessMode = "code";
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

  // ---- CP4: caching policy -------------------------------------------
  // The rule is one property the publish pipeline guarantees: a VERSIONED
  // published object is created once and never rewritten, so its URL is
  // its own version. Everything without that guarantee stays uncacheable.

  it("versioned published object in a PUBLIC Space -> publicly cacheable, longer signed URL", async () => {
    const V = `${TENANT}/meals/a/up-A/published.webp`;
    snapshot = { modules: { meals: [{ imageRef: V }] } };
    accessMode = "public";
    const res = await call(V.split("/"));
    expect(res.status).toBe(307);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300, immutable");
    // The signed URL must outlive the cache window, or a redirect served
    // at the end of its life would point at an expired URL - and no
    // longer than that arithmetic needs, because the TTL is also the
    // window in which a revoked visitor's already-issued URL still works.
    expect(mockSign).toHaveBeenCalledWith(V, 420);
    expect(420).toBeGreaterThan(300);
  });

  it("LEGACY published path is never cacheable - those bytes are overwritten in place", async () => {
    // `{tenant}/{module}/{item}/published.webp` has no uploadId, and the
    // legacy publish branch rewrites it with upsert. Caching it is exactly
    // how a guest would keep seeing the previous image after a republish.
    accessMode = "public";
    const res = await call(P.item.split("/"));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mockSign).toHaveBeenCalledWith(P.item, 60);
  });

  it("CODE-protected Space is never publicly cacheable, even for a visitor who is let through", async () => {
    const V = `${TENANT}/meals/a/up-A/published.webp`;
    snapshot = { modules: { meals: [{ imageRef: V }] } };
    accessMode = "code"; // granted => this visitor holds a valid cookie
    const res = await call(V.split("/"));
    expect(res.status).toBe(307);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mockSign).toHaveBeenCalledWith(V, 60);
  });

  it("a width on the allowlist asks Storage for a narrower render; an invalid one is ignored", async () => {
    const V = `${TENANT}/meals/a/up-A/published.webp`;
    snapshot = { modules: { meals: [{ imageRef: V }] } };
    accessMode = "public";

    await call(V.split("/"), "w=640");
    expect(mockSign).toHaveBeenCalledWith(V, 420, { transform: { width: 640 } });

    // Off-ladder, absurd and non-numeric widths all fall back to the
    // untransformed object rather than minting a new cache entry.
    for (const bad of ["w=641", "w=99999", "w=-1", "w=abc", "w="]) {
      mockSign.mockClear();
      await call(V.split("/"), bad);
      expect(mockSign, bad).toHaveBeenCalledWith(V, 420);
    }
  });

  it("falls back to the plain object when Storage cannot render a transform", async () => {
    const V = `${TENANT}/meals/a/up-A/published.webp`;
    snapshot = { modules: { meals: [{ imageRef: V }] } };
    accessMode = "public";
    mockSign.mockReset();
    mockSign
      .mockResolvedValueOnce({ data: null, error: { message: "transformations not enabled" } })
      .mockResolvedValueOnce({ data: { signedUrl: "http://storage/sign/x?token=t" }, error: null });
    const res = await call(V.split("/"), "w=640");
    expect(res.status).toBe(307);
    expect(mockSign).toHaveBeenNthCalledWith(2, V, 420);
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

// ---------------------------------------------------------------------------
// TASK 027.5 Phase 3B - audio authorization
// ---------------------------------------------------------------------------
const ITEM = "33333333-3333-4333-8333-333333333333";
const AUD = {
  draftV1: `${TENANT}/teachAudioFile/${ITEM}/up-1/draft.mp3`,
  draftV2: `${TENANT}/teachAudioFile/${ITEM}/up-2/draft.mp3`,
  pubV1: `${TENANT}/teachAudioFile/${ITEM}/up-1/published.mp3`,
  pubV2: `${TENANT}/teachAudioFile/${ITEM}/up-2/published.mp3`,
};

describe("GET /api/media - Teach audio (draft: referenced by current draft data; published: in the snapshot)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionUser = { id: "member" };
    sessionThrows = false;
    draftRows = [{ id: ITEM, tenant_id: TENANT, metadata: { audioRef: AUD.draftV2 } }];
    snapshot = { modules: { ...modules, teachAudio: [{ id: ITEM, audioRef: AUD.pubV1 }] } };
    mockAccess.mockResolvedValue("granted");
    mockSign.mockResolvedValue({ data: { signedUrl: "http://storage/sign/a?token=t" }, error: null });
  });

  it("1. signed-in member + draft audio the current draft data references -> 307, 60s URL, no-store", async () => {
    const res = await call(AUD.draftV2.split("/"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://storage/sign/a?token=t");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mockSign).toHaveBeenCalledWith(AUD.draftV2, 60);
  });

  it("2. a random versioned draft audio object the draft data does not reference -> 404", async () => {
    expect((await call(`${TENANT}/teachAudioFile/${ITEM}/up-zzz/draft.mp3`.split("/"))).status).toBe(404);
    // an item that has no audio attached at all (unattached prepare/upload)
    draftRows = [{ id: ITEM, tenant_id: TENANT, metadata: { audioRef: null } }];
    expect((await call(AUD.draftV2.split("/"))).status).toBe(404);
    expect(mockSign).not.toHaveBeenCalled();
  });

  it("3. stale prior draft version (replaced by a newer one) -> 404", async () => {
    expect((await call(AUD.draftV1.split("/"))).status).toBe(404);
    expect(mockSign).not.toHaveBeenCalled();
  });

  it("4. cross-tenant: tenant B's draft audio is never served through A's session or A's id", async () => {
    const bPath = `${OTHER}/teachAudioFile/${ITEM}/up-2/draft.mp3`;
    // B's row exists but is not visible to this member (RLS) - and its item id is A's
    expect((await call(bPath.split("/"))).status).toBe(404);
    // a B item id under A's tenant folder resolves to no A row
    const foreign = `${TENANT}/teachAudioFile/44444444-4444-4444-8444-444444444444/up-2/draft.mp3`;
    draftRows.push({ id: "44444444-4444-4444-8444-444444444444", tenant_id: OTHER, metadata: { audioRef: foreign } });
    expect((await call(foreign.split("/"))).status).toBe(404);
    expect(mockSign).not.toHaveBeenCalled();
  });

  it("5. malformed audio paths -> 404 before any session or snapshot lookup", async () => {
    for (const p of [
      [TENANT, "teachAudioFile", ITEM, "draft.mp3"],
      [TENANT, "teachAudioFile", ITEM, "up-2", "..", "draft.mp3"],
      [TENANT, "teachAudioFile", ITEM, "up-2", "draft.mp3", "extra"],
      [TENANT, "teachAudioFile", ITEM, "up-2", "draft.mp3.exe"],
      ["not-a-uuid", "teachAudioFile", ITEM, "up-2", "draft.mp3"],
    ]) {
      expect((await call(p)).status).toBe(404);
    }
    expect(mockSign).not.toHaveBeenCalled();
  });

  it("anonymous caller, or a session lookup failure, is denied draft audio (fail closed)", async () => {
    sessionUser = null;
    expect((await call(AUD.draftV2.split("/"))).status).toBe(404);
    sessionUser = { id: "member" };
    sessionThrows = true;
    expect((await call(AUD.draftV2.split("/"))).status).toBe(404);
    expect(mockSign).not.toHaveBeenCalled();
  });

  it("a draft-only reference never authorizes the published sibling", async () => {
    expect((await call(AUD.pubV2.split("/"))).status).toBe(404); // not in snapshot, only the draft refers to up-2
    expect(mockSign).not.toHaveBeenCalled();
  });

  it("6. guest + audio the published snapshot references -> 307 with the same 60s no-store contract", async () => {
    sessionUser = null;
    const res = await call(AUD.pubV1.split("/"));
    expect(res.status).toBe(307);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mockSign).toHaveBeenCalledWith(AUD.pubV1, 60);
  });

  it("7. guests never get draft audio, even the one the draft data references", async () => {
    sessionUser = null;
    expect((await call(AUD.draftV2.split("/"))).status).toBe(404);
    expect((await call(AUD.draftV1.split("/"))).status).toBe(404);
    expect(mockSign).not.toHaveBeenCalled();
  });

  it("7b. a snapshot that (wrongly) named a draft audio path still does not serve it to a guest", async () => {
    sessionUser = null;
    snapshot = { modules: { teachAudio: [{ id: ITEM, audioRef: AUD.draftV1 }] } };
    expect((await call(AUD.draftV1.split("/"))).status).toBe(404);
  });

  it("8. stale published audio (replaced in the snapshot) -> 404 even though its object may still exist", async () => {
    sessionUser = null;
    snapshot = { modules: { teachAudio: [{ id: ITEM, audioRef: AUD.pubV2 }] } };
    expect((await call(AUD.pubV1.split("/"))).status).toBe(404);
    expect((await call(AUD.pubV2.split("/"))).status).toBe(307);
    expect(mockSign).toHaveBeenCalledTimes(1);
  });

  it("9. private/code-gated and lapsed Spaces: audio follows the Space decision (hero/logo exception unchanged)", async () => {
    sessionUser = null;
    mockAccess.mockResolvedValue("code-required");
    expect((await call(AUD.pubV1.split("/"))).status).toBe(404);
    expect((await call(P.hero.split("/"))).status).toBe(307);
    mockAccess.mockResolvedValue("unavailable");
    expect((await call(AUD.pubV1.split("/"))).status).toBe(404);
    expect((await call(P.hero.split("/"))).status).toBe(404);
  });

  it("9b. a cross-tenant published audio path is not in this tenant's snapshot -> 404", async () => {
    sessionUser = null;
    expect((await call([TENANT, OTHER, "teachAudioFile", ITEM, "up-1", "published.mp3"])).status).toBe(404);
    expect((await call([OTHER, "teachAudioFile", ITEM, "up-1", "published.mp3"])).status).toBe(404); // other tenant has no snapshot
  });

  it("10. audio and image authorization coexist; images are not served as drafts through this route", async () => {
    expect((await call(P.item.split("/"))).status).toBe(307);
    expect((await call(AUD.pubV1.split("/"))).status).toBe(307);
    expect((await call(AUD.draftV2.split("/"))).status).toBe(307);
    // a signed-in member does NOT gain draft IMAGE access here
    expect((await call(`${TENANT}/meals/a/up-A/draft.webp`.split("/"))).status).toBe(404);
    expect((await call(P.draft.split("/"))).status).toBe(404);
  });

  it("11/12. TTL stays 60 and every audio response (served or denied) is private, no-store", async () => {
    for (const path of [AUD.draftV2, AUD.pubV1, AUD.draftV1, AUD.pubV2]) {
      const res = await call(path.split("/"));
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
    for (const c of mockSign.mock.calls) expect(c[1]).toBe(60);
  });
});

/**
 * CP4 section 16. CP4 changed exactly two things about this route: it may
 * now attach a width to the Storage request, and it may now let a browser
 * reuse the answer. Neither touches the authorization above it - but
 * "neither touches it" is a claim, and this is the suite that holds it to
 * account, by re-asserting each guarantee with the NEW surface exercised.
 */
describe("CP4 security regression: the new delivery options cannot widen access", () => {
  const V = `${TENANT}/meals/a/up-A/published.webp`;
  const VDRAFT = `${TENANT}/meals/a/up-A/draft.webp`;

  beforeEach(() => {
    accessMode = "public";
    vi.clearAllMocks();
    snapshot = { modules };
    mockAccess.mockResolvedValue("granted");
    mockSign.mockResolvedValue({ data: { signedUrl: "http://storage/sign/x?token=t" }, error: null });
  });

  // 1. DRAFT / PRIVATE MEDIA remains protected.
  it("a draft object is refused with a width, in a public Space, exactly as without one", async () => {
    snapshot = { modules: { meals: [{ imageRef: VDRAFT }] } };
    for (const q of ["", "w=96", "w=1600"]) {
      vi.clearAllMocks();
      const res = await call(VDRAFT.split("/"), q);
      expect(res.status, q).toBe(404);
      expect(res.headers.get("cache-control"), q).toBe("private, no-store");
      expect(mockSign, q).not.toHaveBeenCalled();
    }
  });

  it("a draft object is never given a cacheable header even if it were somehow served", async () => {
    // Belt and braces for the policy itself: whatever the route does,
    // the decision for a draft path is no-store.
    const { mediaCacheDecision } = await import("@/lib/media/cachePolicy");
    for (const mode of ["public", "code"] as const) {
      const d = mediaCacheDecision({ objectPath: VDRAFT, accessMode: mode });
      expect(d.cacheControl, mode).toBe("private, no-store");
      expect(d.signedTtlSeconds, mode).toBe(60);
    }
  });

  // 2. Unknown / unpublished refs fail.
  it("a width cannot make an unpublished path servable", async () => {
    snapshot = { modules: { meals: [{ imageRef: V }] } };
    const unknown = `${TENANT}/meals/ghost/up-Z/published.webp`;
    const res = await call(unknown.split("/"), "w=320");
    expect(res.status).toBe(404);
    expect(mockSign).not.toHaveBeenCalled();
  });

  it("an unknown tenant fails before anything is signed, with or without a width", async () => {
    snapshot = null;
    const res = await call(`${OTHER}/meals/a/up-A/published.webp`.split("/"), "w=640");
    expect(res.status).toBe(404);
    expect(mockSign).not.toHaveBeenCalled();
  });

  // 3. Cross-Space access denied.
  it("another Space's object is refused under this tenant's id, width or not", async () => {
    const foreign = `${OTHER}/meals/a/up-A/published.webp`;
    snapshot = { modules: { meals: [{ imageRef: V }] } };
    for (const q of ["", "w=480"]) {
      vi.clearAllMocks();
      expect((await call(foreign.split("/"), q)).status, q).toBe(404);
      expect(mockSign, q).not.toHaveBeenCalled();
    }
  });

  // 4. No auth/session token leaks.
  it("leaks nothing of its own: no cookie is set, and the body carries no URL", async () => {
    snapshot = { modules: { meals: [{ imageRef: V }] } };
    const res = await call(V.split("/"), "w=320");
    expect(res.status).toBe(307);
    expect(res.headers.get("set-cookie")).toBeNull();
    // The only token in the response is Supabase's own object-scoped
    // signature in Location, which is the mechanism, not a leak.
    expect(await res.text()).not.toContain("token");
    // A cacheable response must still tell shared caches that the
    // answer depended on the request's cookie.
    expect(res.headers.get("vary")).toBe("Cookie");
  });

  it("a denial says nothing about why, and is itself never cacheable", async () => {
    const cases: [string, string[]][] = [
      ["unpublished", `${TENANT}/meals/ghost/up-Z/published.webp`.split("/")],
      ["draft", VDRAFT.split("/")],
      ["foreign tenant", `${OTHER}/meals/a/up-A/published.webp`.split("/")],
      ["malformed", ["not-a-uuid", "x", "published.webp"]],
    ];
    for (const [label, path] of cases) {
      const res = await call(path, "w=320");
      expect(res.status, label).toBe(404);
      expect(await res.text(), label).toBe("Not found");
      expect(res.headers.get("cache-control"), label).toBe("private, no-store");
    }
  });

  // 5. Published public media still works - including the new ladder.
  it("serves a versioned published object at every allowlisted width, and only those", async () => {
    const { MEDIA_WIDTHS } = await import("@/lib/media/cachePolicy");
    snapshot = { modules: { meals: [{ imageRef: V }] } };
    for (const w of MEDIA_WIDTHS) {
      vi.clearAllMocks();
      mockSign.mockResolvedValue({ data: { signedUrl: "http://storage/sign/x?token=t" }, error: null });
      const res = await call(V.split("/"), `w=${w}`);
      expect(res.status, String(w)).toBe(307);
      expect(mockSign, String(w)).toHaveBeenCalledWith(V, 420, { transform: { width: w } });
    }
    // Anything off the ladder is ignored rather than forwarded, so one
    // path cannot mint unbounded distinct renders or cache entries.
    for (const bad of ["97", "1601", "0", "-320", "320.5", "1e3", "abc", "320px", ""]) {
      vi.clearAllMocks();
      mockSign.mockResolvedValue({ data: { signedUrl: "http://storage/sign/x?token=t" }, error: null });
      await call(V.split("/"), `w=${bad}`);
      expect(mockSign, bad).toHaveBeenCalledWith(V, 420);
    }
  });

  // 6. A lapsed or code-gated Space is unaffected by any of it.
  it("an unavailable Space serves nothing, at any width", async () => {
    mockAccess.mockResolvedValue("unavailable");
    for (const q of ["", "w=96", "w=1600"]) {
      vi.clearAllMocks();
      mockAccess.mockResolvedValue("unavailable");
      expect((await call(P.hero.split("/"), q)).status, q).toBe(404);
      expect(mockSign, q).not.toHaveBeenCalled();
    }
  });

  it("a code Space without the cookie still serves only its own hero and logo, width or not", async () => {
    mockAccess.mockResolvedValue("code-required");
    accessMode = "code";
    for (const q of ["", "w=320"]) {
      expect((await call(P.hero.split("/"), q)).status, q).toBe(307);
      expect((await call(P.logo.split("/"), q)).status, q).toBe(307);
      expect((await call(P.item.split("/"), q)).status, q).toBe(404);
      expect((await call(P.cover.split("/"), q)).status, q).toBe(404);
    }
  });

  it("the hero a code screen does show is still never publicly cacheable", async () => {
    mockAccess.mockResolvedValue("code-required");
    accessMode = "code";
    const res = await call(P.hero.split("/"), "w=320");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("an access-mode lookup that fails leaves nothing cacheable and nothing signed", async () => {
    snapshot = { modules: { meals: [{ imageRef: V }] } };
    mockAccess.mockRejectedValue(new Error("db down"));
    const res = await call(V.split("/"), "w=320");
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mockSign).not.toHaveBeenCalled();
  });

  it("an unknown access mode fails closed to uncacheable", async () => {
    // resolveGuestAccessDetailed returns mode null only when the Space is
    // unavailable, but the route must not depend on that staying true.
    const { mediaCacheDecision } = await import("@/lib/media/cachePolicy");
    expect(mediaCacheDecision({ objectPath: V, accessMode: "code" }).cacheControl).toBe("private, no-store");
  });
});

describe("CP4 security regression: published audio", () => {
  const AUDIO = `${TENANT}/teachAudioFile/a1/up-A/published.mp3`;

  beforeEach(() => {
    vi.clearAllMocks();
    snapshot = { modules: { teach: { items: { teachAudio: [{ metadata: { audioRef: AUDIO } }] } } } };
    mockAccess.mockResolvedValue("granted");
    mockSign.mockResolvedValue({ data: { signedUrl: "http://storage/sign/a?token=t" }, error: null });
  });

  it("a published audio object in a PUBLIC Space is cacheable on the same immutability rule as an image", async () => {
    // Its path is versioned and published, so the same guarantee holds:
    // replacing the file produces a new uploadId and a new URL. This also
    // means a seek - which re-requests the same URL - reuses the cached
    // redirect instead of re-signing.
    accessMode = "public";
    const res = await call(AUDIO.split("/"));
    expect(res.status).toBe(307);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300, immutable");
    expect(mockSign).toHaveBeenCalledWith(AUDIO, 420);
  });

  it("the same audio in a CODE Space keeps the 60-second, uncacheable contract", async () => {
    accessMode = "code";
    const res = await call(AUDIO.split("/"));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mockSign).toHaveBeenCalledWith(AUDIO, 60);
  });

  it("a width is never forwarded for audio, because nothing ever asks for one", async () => {
    // Defensive: if a crafted request did, the transform attempt fails
    // and the route falls back to the plain object rather than 404ing.
    accessMode = "public";
    mockSign
      .mockResolvedValueOnce({ data: null, error: { message: "cannot transform audio" } })
      .mockResolvedValueOnce({ data: { signedUrl: "http://storage/sign/a?token=t" }, error: null });
    const res = await call(AUDIO.split("/"), "w=320");
    expect(res.status).toBe(307);
    expect(mockSign).toHaveBeenNthCalledWith(2, AUDIO, 420);
  });

  it("a draft audio path is still never served to a guest, at any width", async () => {
    const draft = `${TENANT}/teachAudioFile/a1/up-A/draft.mp3`;
    snapshot = { modules: { teach: { items: { teachAudio: [{ metadata: { audioRef: draft } }] } } } };
    sessionUser = null;
    for (const q of ["", "w=320"]) {
      vi.clearAllMocks();
      expect((await call(draft.split("/"), q)).status, q).toBe(404);
      expect(mockSign, q).not.toHaveBeenCalled();
    }
  });
});
