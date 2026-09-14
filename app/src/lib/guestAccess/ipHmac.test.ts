import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

const { resolveTrustedIp } = await import("./ipHmac");

describe("resolveTrustedIp - trusted-header precedence", () => {
  it("prefers x-nf-client-connection-ip (Netlify's own, non-spoofable header) when present", () => {
    const h = new Headers({
      "x-nf-client-connection-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.1, 203.0.113.99",
    });
    expect(resolveTrustedIp(h)).toBe("203.0.113.7");
  });

  it("falls back to the first x-forwarded-for entry when the Netlify header is absent (local dev)", () => {
    const h = new Headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.99" });
    expect(resolveTrustedIp(h)).toBe("198.51.100.1");
  });

  it("falls back to a fixed placeholder when neither header is present, rather than throwing", () => {
    const h = new Headers();
    expect(resolveTrustedIp(h)).toBe("unknown");
  });

  it("trims whitespace around the resolved IP", () => {
    const h = new Headers({ "x-forwarded-for": "  198.51.100.1  , 203.0.113.99" });
    expect(resolveTrustedIp(h)).toBe("198.51.100.1");
  });
});
