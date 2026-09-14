import { describe, expect, it, beforeEach, vi } from "vitest";

// cookieToken.ts imports "server-only" as a build-time guard against
// accidental client-bundle inclusion - it throws when actually imported
// outside a server context (which vitest's plain node environment
// counts as, even though this module never touches the browser). Stub
// it exactly like sharp/other native/environment-specific modules are
// stubbed elsewhere in this test suite (see publishSpace.test.ts).
vi.mock("server-only", () => ({}));

const { signGuestAccessToken, verifyGuestAccessToken, guestAccessCookieName } = await import("./cookieToken");

describe("guestAccessCookieName", () => {
  it("is tenant-specific, not a single shared cookie name", () => {
    expect(guestAccessCookieName("tenant-a")).toBe("idw_guest_access_tenant-a");
    expect(guestAccessCookieName("tenant-a")).not.toBe(guestAccessCookieName("tenant-b"));
  });
});

describe("signGuestAccessToken / verifyGuestAccessToken", () => {
  beforeEach(() => {
    vi.stubEnv("GUEST_ACCESS_TOKEN_SECRET", "test-secret-do-not-use-in-production");
  });

  it("round-trips: a token signed for a tenant+version verifies against that same tenant+version", async () => {
    const token = await signGuestAccessToken("tenant-1", 3);
    expect(await verifyGuestAccessToken(token, "tenant-1", 3)).toBe(true);
  });

  it("rejects a token checked against the wrong tenant - a cookie for tenant A can never unlock tenant B", async () => {
    const token = await signGuestAccessToken("tenant-a", 1);
    expect(await verifyGuestAccessToken(token, "tenant-b", 1)).toBe(false);
  });

  it("rejects a token checked against a different version - code reset/rotation invalidates it", async () => {
    const token = await signGuestAccessToken("tenant-1", 1);
    expect(await verifyGuestAccessToken(token, "tenant-1", 2)).toBe(false);
  });

  it("rejects a malformed token (wrong shape) without throwing", async () => {
    await expect(verifyGuestAccessToken("not-a-real-token", "tenant-1", 1)).resolves.toBe(false);
    await expect(verifyGuestAccessToken("only.one.part.too.many", "tenant-1", 1)).resolves.toBe(false);
    await expect(verifyGuestAccessToken("", "tenant-1", 1)).resolves.toBe(false);
  });

  it("rejects a token with a tampered payload (signature no longer matches)", async () => {
    const token = await signGuestAccessToken("tenant-1", 1);
    const [payload] = token.split(".");
    const tampered = `${payload}x.invalidsignature`;
    expect(await verifyGuestAccessToken(tampered, "tenant-1", 1)).toBe(false);
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers();
    const token = await signGuestAccessToken("tenant-1", 1);
    // 7 days + 1 second later
    vi.advanceTimersByTime(1000 * 60 * 60 * 24 * 7 + 1000);
    expect(await verifyGuestAccessToken(token, "tenant-1", 1)).toBe(false);
    vi.useRealTimers();
  });

  it("a token signed under one secret does not verify under another (secret rotation invalidates old cookies)", async () => {
    const token = await signGuestAccessToken("tenant-1", 1);
    vi.stubEnv("GUEST_ACCESS_TOKEN_SECRET", "a-completely-different-secret");
    expect(await verifyGuestAccessToken(token, "tenant-1", 1)).toBe(false);
  });

  it("throws a clear error when the secret is entirely unset, rather than silently weakening security", async () => {
    vi.stubEnv("GUEST_ACCESS_TOKEN_SECRET", "");
    await expect(signGuestAccessToken("tenant-1", 1)).rejects.toThrow(/GUEST_ACCESS_TOKEN_SECRET/);
  });
});
