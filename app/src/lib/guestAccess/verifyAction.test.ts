import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockIsSpacePubliclyAvailable = vi.fn();
vi.mock("@/lib/entitlements/isSpacePubliclyAvailable", () => ({
  isSpacePubliclyAvailable: (...args: unknown[]) => mockIsSpacePubliclyAvailable(...args),
}));

const mockDeriveRequestIpHmac = vi.fn();
vi.mock("./ipHmac", () => ({
  deriveRequestIpHmac: () => mockDeriveRequestIpHmac(),
}));

const mockRpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mockRpc }),
}));

const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mockCookieSet }),
}));

vi.mock("./cookieToken", () => ({
  guestAccessCookieName: (tenantId: string) => `idw_guest_access_${tenantId}`,
  signGuestAccessToken: vi.fn(async () => "signed-token"),
  GUEST_ACCESS_COOKIE_MAX_AGE_SECONDS: 60 * 60 * 24 * 7,
}));

const { verifyGuestCode, verifyGuestCodeInitialState } = await import("./verifyAction");

function formDataWithCode(code: string) {
  const fd = new FormData();
  fd.set("code", code);
  return fd;
}

describe("verifyGuestCode - ordering: commercial availability is checked BEFORE anything else", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never calls the throttle or verify RPCs when the Space isn't publicly available", async () => {
    mockIsSpacePubliclyAvailable.mockResolvedValue(false);

    const result = await verifyGuestCode("tenant-1", verifyGuestCodeInitialState, formDataWithCode("482731"));

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(mockDeriveRequestIpHmac).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it("checks the per-IP throttle before ever calling verify_guest_access_code", async () => {
    mockIsSpacePubliclyAvailable.mockResolvedValue(true);
    mockDeriveRequestIpHmac.mockResolvedValue("hmac-abc");
    // Throttled - the RPC call order matters: check_and_record_guest_attempt first
    mockRpc.mockResolvedValueOnce({ data: false, error: null });

    const result = await verifyGuestCode("tenant-1", verifyGuestCodeInitialState, formDataWithCode("482731"));

    expect(result.success).toBe(false);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("check_and_record_guest_attempt", expect.objectContaining({ p_tenant_id: "tenant-1" }));
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it("rejects a malformed code (not exactly 6 digits) before touching any RPC", async () => {
    mockIsSpacePubliclyAvailable.mockResolvedValue(true);

    const result = await verifyGuestCode("tenant-1", verifyGuestCodeInitialState, formDataWithCode("123"));

    expect(result.success).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("on success (allowed by throttle + correct code), sets the cookie and returns success", async () => {
    mockIsSpacePubliclyAvailable.mockResolvedValue(true);
    mockDeriveRequestIpHmac.mockResolvedValue("hmac-abc");
    mockRpc
      .mockResolvedValueOnce({ data: true, error: null }) // throttle: allowed
      .mockResolvedValueOnce({ data: 4, error: null }); // verify: version 4

    const result = await verifyGuestCode("tenant-1", verifyGuestCodeInitialState, formDataWithCode("482731"));

    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
    expect(mockCookieSet).toHaveBeenCalledWith(
      "idw_guest_access_tenant-1",
      "signed-token",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" })
    );
  });

  it("an incorrect code (verify RPC returns null) never sets a cookie", async () => {
    mockIsSpacePubliclyAvailable.mockResolvedValue(true);
    mockDeriveRequestIpHmac.mockResolvedValue("hmac-abc");
    mockRpc
      .mockResolvedValueOnce({ data: true, error: null }) // throttle: allowed
      .mockResolvedValueOnce({ data: null, error: null }); // verify: wrong code

    const result = await verifyGuestCode("tenant-1", verifyGuestCodeInitialState, formDataWithCode("000000"));

    expect(result.success).toBe(false);
    expect(mockCookieSet).not.toHaveBeenCalled();
  });
});
