import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockAvailable = vi.fn();
const mockMode = vi.fn();
const mockCookie = vi.fn();
vi.mock("@/lib/entitlements/isSpacePubliclyAvailable", () => ({ isSpacePubliclyAvailable: (...a: unknown[]) => mockAvailable(...a) }));
vi.mock("./mode", () => ({ getGuestAccessMode: (...a: unknown[]) => mockMode(...a) }));
vi.mock("./checkCookie", () => ({ hasValidGuestAccessCookie: (...a: unknown[]) => mockCookie(...a) }));

const { resolveGuestAccess } = await import("./effectiveAccess");

describe("resolveGuestAccess - the one shared Guest App + media policy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("unavailable Space is 'unavailable' and never reaches the code check (a lapsed Space's code cannot route around it)", async () => {
    mockAvailable.mockResolvedValue(false);
    expect(await resolveGuestAccess("t")).toBe("unavailable");
    expect(mockMode).not.toHaveBeenCalled();
    expect(mockCookie).not.toHaveBeenCalled();
  });

  it("available public Space is 'granted' without consulting any cookie", async () => {
    mockAvailable.mockResolvedValue(true);
    mockMode.mockResolvedValue("public");
    expect(await resolveGuestAccess("t")).toBe("granted");
    expect(mockCookie).not.toHaveBeenCalled();
  });

  it("available code Space without a valid cookie is 'code-required'", async () => {
    mockAvailable.mockResolvedValue(true);
    mockMode.mockResolvedValue("code");
    mockCookie.mockResolvedValue(false);
    expect(await resolveGuestAccess("t")).toBe("code-required");
  });

  it("available code Space with a valid cookie is 'granted'", async () => {
    mockAvailable.mockResolvedValue(true);
    mockMode.mockResolvedValue("code");
    mockCookie.mockResolvedValue(true);
    expect(await resolveGuestAccess("t")).toBe("granted");
    expect(mockCookie).toHaveBeenCalledWith("t");
  });

  it("propagates a genuine mode-lookup failure (callers fail closed) instead of defaulting to 'granted'", async () => {
    mockAvailable.mockResolvedValue(true);
    mockMode.mockRejectedValue(new Error("db down"));
    await expect(resolveGuestAccess("t")).rejects.toThrow("db down");
  });
});
