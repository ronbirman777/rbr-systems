import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockHeaders = vi.fn();
vi.mock("next/headers", () => ({ headers: () => mockHeaders() }));

const { resolveTrustedIp, isVercelRuntime, deriveRequestIpHmac, VERCEL_TRUSTED_IP_HEADER } =
  await import("./ipHmac");

const VERCEL = { isVercel: true } as const;
const LOCAL = { isVercel: false } as const;

describe("resolveTrustedIp - Vercel deployment (production/preview)", () => {
  it("resolves the client IP from Vercel's own edge-controlled header", () => {
    const h = new Headers({ [VERCEL_TRUSTED_IP_HEADER]: "203.0.113.7" });
    expect(resolveTrustedIp(h, VERCEL)).toEqual({ ok: true, ip: "203.0.113.7", source: "vercel" });
  });

  it("takes the first entry of Vercel's forwarding list", () => {
    const h = new Headers({ [VERCEL_TRUSTED_IP_HEADER]: "203.0.113.7, 198.51.100.1" });
    expect(resolveTrustedIp(h, VERCEL)).toEqual({ ok: true, ip: "203.0.113.7", source: "vercel" });
  });

  it("normalizes surrounding whitespace", () => {
    const h = new Headers({ [VERCEL_TRUSTED_IP_HEADER]: "   203.0.113.7   , 198.51.100.1" });
    expect(resolveTrustedIp(h, VERCEL)).toEqual({ ok: true, ip: "203.0.113.7", source: "vercel" });
  });

  it("accepts a valid IPv6 client address", () => {
    const h = new Headers({ [VERCEL_TRUSTED_IP_HEADER]: "2001:db8::1" });
    expect(resolveTrustedIp(h, VERCEL)).toEqual({ ok: true, ip: "2001:db8::1", source: "vercel" });
  });

  it("accepts the IPv6 loopback literal", () => {
    const h = new Headers({ [VERCEL_TRUSTED_IP_HEADER]: "::1" });
    expect(resolveTrustedIp(h, VERCEL)).toEqual({ ok: true, ip: "::1", source: "vercel" });
  });

  it("fails closed when Vercel's header is absent", () => {
    expect(resolveTrustedIp(new Headers(), VERCEL)).toEqual({ ok: false, reason: "missing" });
  });

  it("fails closed when Vercel's header is present but empty", () => {
    const h = new Headers({ [VERCEL_TRUSTED_IP_HEADER]: "   ,  " });
    expect(resolveTrustedIp(h, VERCEL)).toEqual({ ok: false, reason: "missing" });
  });

  it("fails closed on a malformed IPv4 value", () => {
    const h = new Headers({ [VERCEL_TRUSTED_IP_HEADER]: "999.1.1.1" });
    expect(resolveTrustedIp(h, VERCEL)).toEqual({ ok: false, reason: "malformed" });
  });

  it("fails closed on a non-IP string", () => {
    const h = new Headers({ [VERCEL_TRUSTED_IP_HEADER]: "not-an-ip" });
    expect(resolveTrustedIp(h, VERCEL)).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("resolveTrustedIp - spoofing resistance on Vercel", () => {
  it("a conflicting client-supplied x-forwarded-for cannot override Vercel's value", () => {
    const h = new Headers({
      [VERCEL_TRUSTED_IP_HEADER]: "203.0.113.7",
      "x-forwarded-for": "198.51.100.1, 203.0.113.99",
    });
    expect(resolveTrustedIp(h, VERCEL)).toEqual({ ok: true, ip: "203.0.113.7", source: "vercel" });
  });

  it("a client-supplied x-forwarded-for alone never satisfies the Vercel contract", () => {
    const h = new Headers({ "x-forwarded-for": "198.51.100.1" });
    expect(resolveTrustedIp(h, VERCEL)).toEqual({ ok: false, reason: "missing" });
  });

  it("a client-supplied Netlify header is ignored entirely and has no effect", () => {
    const h = new Headers({
      "x-nf-client-connection-ip": "198.51.100.1",
      [VERCEL_TRUSTED_IP_HEADER]: "203.0.113.7",
    });
    expect(resolveTrustedIp(h, VERCEL)).toEqual({ ok: true, ip: "203.0.113.7", source: "vercel" });
  });

  it("a client-supplied Netlify header alone fails closed on Vercel", () => {
    const h = new Headers({ "x-nf-client-connection-ip": "198.51.100.1" });
    expect(resolveTrustedIp(h, VERCEL)).toEqual({ ok: false, reason: "missing" });
  });

  it("a client-supplied x-real-ip is not trusted on Vercel", () => {
    const h = new Headers({ "x-real-ip": "198.51.100.1" });
    expect(resolveTrustedIp(h, VERCEL)).toEqual({ ok: false, reason: "missing" });
  });
});

describe("resolveTrustedIp - local development only", () => {
  it("uses the first x-forwarded-for entry when demonstrably not on Vercel", () => {
    const h = new Headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.99" });
    expect(resolveTrustedIp(h, LOCAL)).toEqual({ ok: true, ip: "198.51.100.1", source: "local" });
  });

  it("uses the loopback literal when no forwarding header exists locally", () => {
    expect(resolveTrustedIp(new Headers(), LOCAL)).toEqual({ ok: true, ip: "127.0.0.1", source: "local" });
  });

  it("still fails closed locally on a malformed forwarding value", () => {
    const h = new Headers({ "x-forwarded-for": "999.1.1.1" });
    expect(resolveTrustedIp(h, LOCAL)).toEqual({ ok: false, reason: "malformed" });
  });

  it("the local path is NOT reachable on Vercel merely because the Vercel header is absent", () => {
    const h = new Headers({ "x-forwarded-for": "198.51.100.1" });
    expect(resolveTrustedIp(h, VERCEL)).not.toEqual({ ok: true, ip: "198.51.100.1", source: "local" });
    expect(resolveTrustedIp(h, VERCEL).ok).toBe(false);
  });
});

describe("isVercelRuntime", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is true when the platform marks the runtime as Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    expect(isVercelRuntime()).toBe(true);
  });

  it("is false when the platform marker is absent", () => {
    vi.stubEnv("VERCEL", "");
    expect(isVercelRuntime()).toBe(false);
  });

  it("is false for any value other than the documented marker", () => {
    vi.stubEnv("VERCEL", "0");
    expect(isVercelRuntime()).toBe(false);
  });
});

describe("deriveRequestIpHmac", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it("returns null (fail closed) when a trusted IP cannot be established on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("GUEST_ACCESS_IP_HMAC_SECRET", "unit-test-secret-value");
    mockHeaders.mockResolvedValue(new Headers());

    await expect(deriveRequestIpHmac()).resolves.toBeNull();
  });

  it("returns null (fail closed) when the trusted IP is malformed on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("GUEST_ACCESS_IP_HMAC_SECRET", "unit-test-secret-value");
    mockHeaders.mockResolvedValue(new Headers({ [VERCEL_TRUSTED_IP_HEADER]: "not-an-ip" }));

    await expect(deriveRequestIpHmac()).resolves.toBeNull();
  });

  it("still throws when the HMAC secret is absent, rather than silently skipping throttling", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("GUEST_ACCESS_IP_HMAC_SECRET", "");
    mockHeaders.mockResolvedValue(new Headers({ [VERCEL_TRUSTED_IP_HEADER]: "203.0.113.7" }));

    await expect(deriveRequestIpHmac()).rejects.toThrow(/GUEST_ACCESS_IP_HMAC_SECRET/);
  });

  it("returns a keyed hex digest that never contains the raw IP", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("GUEST_ACCESS_IP_HMAC_SECRET", "unit-test-secret-value");
    mockHeaders.mockResolvedValue(new Headers({ [VERCEL_TRUSTED_IP_HEADER]: "203.0.113.7" }));

    const digest = await deriveRequestIpHmac();

    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain("203.0.113.7");
  });

  it("produces different identities for different clients and a stable one per client", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("GUEST_ACCESS_IP_HMAC_SECRET", "unit-test-secret-value");

    mockHeaders.mockResolvedValue(new Headers({ [VERCEL_TRUSTED_IP_HEADER]: "203.0.113.7" }));
    const a1 = await deriveRequestIpHmac();
    const a2 = await deriveRequestIpHmac();

    mockHeaders.mockResolvedValue(new Headers({ [VERCEL_TRUSTED_IP_HEADER]: "203.0.113.8" }));
    const b1 = await deriveRequestIpHmac();

    expect(a1).toBe(a2);
    expect(a1).not.toBe(b1);
  });
});
