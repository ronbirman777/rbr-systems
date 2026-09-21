import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

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

const { verifyGuestCode } = await import("./verifyAction");
const { verifyGuestCodeInitialState } = await import("./verifyActionState");

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

describe("verifyGuestCode - fail-closed when no trusted client IP can be established", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never calls the rate-limit RPC when trusted-IP resolution fails", async () => {
    mockIsSpacePubliclyAvailable.mockResolvedValue(true);
    mockDeriveRequestIpHmac.mockResolvedValue(null);

    const result = await verifyGuestCode("tenant-1", verifyGuestCodeInitialState, formDataWithCode("482731"));

    expect(result.success).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("never verifies the guest code or issues a cookie after trusted-IP failure", async () => {
    mockIsSpacePubliclyAvailable.mockResolvedValue(true);
    mockDeriveRequestIpHmac.mockResolvedValue(null);

    const result = await verifyGuestCode("tenant-1", verifyGuestCodeInitialState, formDataWithCode("482731"));

    expect(result.success).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it("returns the same generic message, leaking nothing about request provenance", async () => {
    mockIsSpacePubliclyAvailable.mockResolvedValue(true);
    mockDeriveRequestIpHmac.mockResolvedValue(null);

    const ipFailure = await verifyGuestCode("tenant-1", verifyGuestCodeInitialState, formDataWithCode("482731"));

    vi.clearAllMocks();
    mockIsSpacePubliclyAvailable.mockResolvedValue(true);
    mockDeriveRequestIpHmac.mockResolvedValue("hmac-abc");
    mockRpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const wrongCode = await verifyGuestCode("tenant-1", verifyGuestCodeInitialState, formDataWithCode("000000"));

    expect(ipFailure.error).toBe(wrongCode.error);
    expect(ipFailure.error).not.toMatch(/ip|header|vercel|trust/i);
  });

  it("only ever passes the keyed HMAC identity to the rate-limit RPC, never a raw IP", async () => {
    mockIsSpacePubliclyAvailable.mockResolvedValue(true);
    mockDeriveRequestIpHmac.mockResolvedValue("f".repeat(64));
    mockRpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: 1, error: null });

    await verifyGuestCode("tenant-1", verifyGuestCodeInitialState, formDataWithCode("482731"));

    expect(mockRpc).toHaveBeenCalledWith("check_and_record_guest_attempt", {
      p_tenant_id: "tenant-1",
      p_ip_hmac: "f".repeat(64),
    });
    const throttleArgs = mockRpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(JSON.stringify(throttleArgs)).not.toMatch(/\d{1,3}(\.\d{1,3}){3}/);
  });
});

describe("verifyGuestCode - fail-closed when trusted-IP derivation throws (Task 008C, CRITICAL-1)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("an exception deriving the trusted IP degrades to the generic failure, not an uncaught crash", async () => {
    mockIsSpacePubliclyAvailable.mockResolvedValue(true);
    mockDeriveRequestIpHmac.mockRejectedValue(new Error("GUEST_ACCESS_IP_HMAC_SECRET is not set."));

    const result = await verifyGuestCode("tenant-1", verifyGuestCodeInitialState, formDataWithCode("482731"));

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("never calls the rate-limit RPC, verifies no code, and issues no cookie when derivation throws", async () => {
    mockIsSpacePubliclyAvailable.mockResolvedValue(true);
    mockDeriveRequestIpHmac.mockRejectedValue(new Error("GUEST_ACCESS_IP_HMAC_SECRET is not set."));

    await verifyGuestCode("tenant-1", verifyGuestCodeInitialState, formDataWithCode("482731"));

    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it("the thrown exception's message never leaks into the guest-facing error", async () => {
    mockIsSpacePubliclyAvailable.mockResolvedValue(true);
    mockDeriveRequestIpHmac.mockRejectedValue(new Error("GUEST_ACCESS_IP_HMAC_SECRET is not set."));

    const result = await verifyGuestCode("tenant-1", verifyGuestCodeInitialState, formDataWithCode("482731"));

    expect(result.error).not.toMatch(/GUEST_ACCESS|SECRET|HMAC/i);
  });

  it("returns the identical generic message as an ordinary wrong code, indistinguishable to the guest", async () => {
    mockIsSpacePubliclyAvailable.mockResolvedValue(true);
    mockDeriveRequestIpHmac.mockRejectedValue(new Error("GUEST_ACCESS_IP_HMAC_SECRET is not set."));
    const thrown = await verifyGuestCode("tenant-1", verifyGuestCodeInitialState, formDataWithCode("482731"));

    vi.clearAllMocks();
    mockIsSpacePubliclyAvailable.mockResolvedValue(true);
    mockDeriveRequestIpHmac.mockResolvedValue("hmac-abc");
    mockRpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const wrongCode = await verifyGuestCode("tenant-1", verifyGuestCodeInitialState, formDataWithCode("000000"));

    expect(thrown.error).toBe(wrongCode.error);
  });
});

describe("verifyAction.ts - \"use server\" export shape (Task 008C, CRITICAL-1 regression guard)", () => {
  // Next.js requires every export of a "use server" module to be an async
  // function. A single non-function export (verifyGuestCodeInitialState,
  // previously defined here as a plain object) crashed every invocation of
  // this action in Production with "A 'use server' file can only export
  // async functions, found object" - confirmed via Vercel runtime logs.
  // This structural check guards against that exact defect recurring,
  // independent of whatever the file's internal logic does.
  const source = readFileSync(
    path.join(process.cwd(), "src/lib/guestAccess/verifyAction.ts"),
    "utf8"
  );

  it("declares \"use server\" at module scope", () => {
    expect(source).toMatch(/^"use server";/);
  });

  it("exports exactly one runtime binding, and it is an async function", () => {
    const exportLines = source.split("\n").filter((line) => line.startsWith("export "));
    const runtimeExportLines = exportLines.filter((line) => !line.startsWith("export type "));
    expect(runtimeExportLines).toHaveLength(1);
    expect(runtimeExportLines[0]).toMatch(/^export async function\b/);
  });

  it("does not export the state type/initial-value pair itself (they moved to verifyActionState.ts)", () => {
    expect(source).not.toContain("export type VerifyGuestCodeState");
    expect(source).not.toContain("export const verifyGuestCodeInitialState");
  });
});
