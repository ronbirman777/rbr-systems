import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Task 012. Exercises the real `GET` handler against plain `Request`
 * objects (same technique proxy.test.ts already uses for `NextRequest` -
 * Next's Request/URL implementation runs fine under plain Node, no jsdom
 * needed). `verifyOtp` and the recovery-flow-context cookie writer are
 * mocked; the redirect/cookie/header *routing decisions* this file makes
 * around them are what's under test, not Supabase's own token
 * verification.
 */

const mockVerifyOtp = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { verifyOtp: mockVerifyOtp },
  }),
}));

const mockSetRecoveryFlowCookie = vi.fn();

vi.mock("@/lib/supabase/recovery", () => ({
  setRecoveryFlowCookie: (...args: unknown[]) => mockSetRecoveryFlowCookie(...args),
}));

async function loadRoute() {
  return import("./route");
}

const ORIGIN = "https://app.innerdwes.com";

function req(url: string) {
  return new Request(url);
}

describe("/auth/confirm route - Task 012 recovery branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("non-recovery (signup) success still redirects to the safe next path, unchanged from before Task 012", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const { GET } = await loadRoute();

    const res = await GET(req(`${ORIGIN}/auth/confirm?token_hash=abc&type=signup`));

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/create");
    expect(mockSetRecoveryFlowCookie).not.toHaveBeenCalled();
  });

  it("non-recovery success honors a safe explicit next path", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const { GET } = await loadRoute();

    const res = await GET(req(`${ORIGIN}/auth/confirm?token_hash=abc&type=signup&next=%2Fspace`));

    expect(new URL(res.headers.get("location")!).pathname).toBe("/space");
  });

  it("non-recovery success rejects an external next path, falling back to /create", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const { GET } = await loadRoute();

    const res = await GET(
      req(`${ORIGIN}/auth/confirm?token_hash=abc&type=signup&next=${encodeURIComponent("https://evil.example/")}`)
    );

    expect(new URL(res.headers.get("location")!).pathname).toBe("/create");
  });

  it("recovery success redirects to a clean /reset-password with no token/hash/code/next in the URL", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: { id: "user-42" } }, error: null });
    const { GET } = await loadRoute();

    const res = await GET(
      req(`${ORIGIN}/auth/confirm?token_hash=abc123&type=recovery&next=%2Fspace`)
    );

    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/reset-password");
    expect(location.search).toBe("");
  });

  it("recovery success ignores even a malicious next path - destination is always the fixed /reset-password", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: { id: "user-42" } }, error: null });
    const { GET } = await loadRoute();

    const res = await GET(
      req(`${ORIGIN}/auth/confirm?token_hash=abc123&type=recovery&next=${encodeURIComponent("https://evil.example/")}`)
    );

    expect(new URL(res.headers.get("location")!).pathname).toBe("/reset-password");
  });

  it("recovery success binds the flow-context cookie to the verified user id from THIS verifyOtp response", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: { id: "user-42" } }, error: null });
    const { GET } = await loadRoute();

    await GET(req(`${ORIGIN}/auth/confirm?token_hash=abc123&type=recovery`));

    expect(mockSetRecoveryFlowCookie).toHaveBeenCalledWith("user-42");
  });

  it("recovery success sets no-store/no-referrer headers on the sensitive redirect", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: { id: "user-42" } }, error: null });
    const { GET } = await loadRoute();

    const res = await GET(req(`${ORIGIN}/auth/confirm?token_hash=abc123&type=recovery`));

    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("an expired/tampered recovery token (verifyOtp error) routes to the recovery request-a-new-link screen, not the signup notice", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: null }, error: { message: "Token has expired or is invalid" } });
    const { GET } = await loadRoute();

    const res = await GET(req(`${ORIGIN}/auth/confirm?token_hash=abc123&type=recovery`));

    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/forgot-password");
    expect(location.searchParams.get("recoveryError")).toBe("1");
    expect(mockSetRecoveryFlowCookie).not.toHaveBeenCalled();
  });

  it("a recovery attempt with a missing token_hash never calls verifyOtp and still routes to the recovery failure screen", async () => {
    const { GET } = await loadRoute();

    const res = await GET(req(`${ORIGIN}/auth/confirm?type=recovery`));

    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(new URL(res.headers.get("location")!).pathname).toBe("/forgot-password");
  });

  it("an unsupported/unrecognized type value never calls verifyOtp and falls back to the generic signup-error notice", async () => {
    const { GET } = await loadRoute();

    const res = await GET(req(`${ORIGIN}/auth/confirm?token_hash=abc123&type=totally-unknown-type`));

    expect(mockVerifyOtp).not.toHaveBeenCalled();
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/log-in");
    expect(location.searchParams.get("confirmError")).toBe("1");
  });

  it("a provider error-query-param callback with no token_hash/type at all fails safely to the generic notice, never rendering raw error_description", async () => {
    const { GET } = await loadRoute();

    const res = await GET(
      req(`${ORIGIN}/auth/confirm?error=access_denied&error_code=otp_expired&error_description=Some+raw+message`)
    );

    expect(mockVerifyOtp).not.toHaveBeenCalled();
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/log-in");
    expect(location.toString()).not.toContain("Some+raw+message");
  });
});
