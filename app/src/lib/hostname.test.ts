import { describe, expect, it } from "vitest";
import { classifyHostname, PRODUCTION_APEX, PRODUCTION_APP, PRODUCTION_WWW } from "./hostname";

describe("classifyHostname - production hostnames", () => {
  it("classifies the bare production apex", () => {
    expect(classifyHostname(PRODUCTION_APEX)).toEqual({ kind: "marketing-apex" });
  });

  it("classifies www as needing a redirect to the apex", () => {
    expect(classifyHostname(PRODUCTION_WWW)).toEqual({ kind: "marketing-www" });
  });

  it("classifies app.innerdwes.com as the Studio host", () => {
    expect(classifyHostname(PRODUCTION_APP)).toEqual({ kind: "app" });
  });

  it("is case-insensitive", () => {
    expect(classifyHostname("INNERDWES.COM")).toEqual({ kind: "marketing-apex" });
    expect(classifyHostname("App.InnerDweS.com")).toEqual({ kind: "app" });
  });

  it("strips a port suffix", () => {
    expect(classifyHostname("innerdwes.com:443")).toEqual({ kind: "marketing-apex" });
    expect(classifyHostname("app.innerdwes.com:3000")).toEqual({ kind: "app" });
  });
});

describe("classifyHostname - guest Space subdomains", () => {
  it("extracts a valid customer slug", () => {
    expect(classifyHostname("samadhi.innerdwes.com")).toEqual({ kind: "guest", slug: "samadhi" });
  });

  it("extracts a hyphenated slug", () => {
    expect(classifyHostname("soma-sanctuary.innerdwes.com")).toEqual({ kind: "guest", slug: "soma-sanctuary" });
  });

  it("treats an unknown/unpublished-looking slug the same way format-wise - the actual 404 happens downstream at /s/[slug], not here", () => {
    expect(classifyHostname("this-slug-does-not-exist.innerdwes.com")).toEqual({
      kind: "guest",
      slug: "this-slug-does-not-exist",
    });
  });
});

describe("classifyHostname - reserved words are 'blocked', never a guest lookup or marketing fallthrough", () => {
  // www/app are deliberately excluded here - they get their own dedicated
  // "marketing-www"/"app" kinds (tested above), not the generic reserved-
  // word fallthrough this covers.
  it.each(["admin", "api", "auth", "mail", "smtp", "support", "staging", "dashboard"])(
    "treats %s.innerdwes.com as blocked, not a guest slug",
    (word) => {
      expect(classifyHostname(`${word}.innerdwes.com`)).toEqual({ kind: "blocked" });
    }
  );
});

describe("classifyHostname - malformed / spoofed Host values under *.innerdwes.com are 'blocked' (fail closed, per the Domain Phase 2 hardening requirement - proxy.ts 404s these rather than falling through to marketing)", () => {
  it("blocks a multi-label subdomain smuggled ahead of the apex", () => {
    expect(classifyHostname("evil.samadhi.innerdwes.com")).toEqual({ kind: "blocked" });
  });

  it("blocks the exact multi-level example from the hardening spec", () => {
    expect(classifyHostname("foo.bar.innerdwes.com")).toEqual({ kind: "blocked" });
  });

  it("blocks an empty label", () => {
    expect(classifyHostname(".innerdwes.com")).toEqual({ kind: "blocked" });
  });

  it("blocks an invalid-format label (uppercase/underscore/too short)", () => {
    expect(classifyHostname("NotValid_Slug.innerdwes.com")).toEqual({ kind: "blocked" });
    expect(classifyHostname("ab.innerdwes.com")).toEqual({ kind: "blocked" });
  });
});

describe("classifyHostname - hosts NOT actually within the innerdwes.com namespace stay 'unknown' (no fail-closed handling needed - ordinary routing already applies)", () => {
  it("does not match a suffix-trick domain that only looks similar", () => {
    // Ends in ".example", not ".innerdwes.com" - never reaches the guest/
    // blocked branch at all, so this is genuinely "unrelated", not
    // "invalid within our namespace".
    expect(classifyHostname("innerdwes.com.attacker.example")).toEqual({ kind: "unknown" });
  });

  it("does not match a completely unrelated domain", () => {
    expect(classifyHostname("evil.example.com")).toEqual({ kind: "unknown" });
  });

  it("handles a null/empty Host header without throwing", () => {
    expect(classifyHostname(null)).toEqual({ kind: "unknown" });
    expect(classifyHostname(undefined)).toEqual({ kind: "unknown" });
    expect(classifyHostname("")).toEqual({ kind: "unknown" });
  });
});

describe("classifyHostname - localhost / development", () => {
  it("classifies bare localhost", () => {
    expect(classifyHostname("localhost")).toEqual({ kind: "localhost" });
  });

  it("classifies localhost with a port", () => {
    expect(classifyHostname("localhost:3000")).toEqual({ kind: "localhost" });
  });

  it("classifies 127.0.0.1", () => {
    expect(classifyHostname("127.0.0.1:3000")).toEqual({ kind: "localhost" });
  });

  it("classifies a *.localhost subdomain (used for local hostname testing - see the Domain Phase 2 report)", () => {
    expect(classifyHostname("app.localhost:3000")).toEqual({ kind: "localhost" });
  });
});

describe("classifyHostname - Netlify deploy preview hostnames", () => {
  it("classifies a Netlify draft deploy hostname", () => {
    expect(classifyHostname("6a9d4f3af3d134dcb79982b5--rbr-systems.netlify.app")).toEqual({ kind: "netlify-preview" });
  });

  it("classifies the site's primary Netlify subdomain", () => {
    expect(classifyHostname("rbr-systems.netlify.app")).toEqual({ kind: "netlify-preview" });
  });
});
