import { describe, expect, it } from "vitest";
import { safeInternalRedirectPath } from "./safe-redirect";

describe("safeInternalRedirectPath - valid same-site paths pass through unchanged", () => {
  it("allows a simple valid path", () => {
    expect(safeInternalRedirectPath("/create", "/create")).toBe("/create");
  });

  it("allows a nested internal path", () => {
    expect(safeInternalRedirectPath("/configurator/retreat", "/create")).toBe("/configurator/retreat");
  });

  it("preserves a query string on an otherwise-valid path", () => {
    expect(safeInternalRedirectPath("/space?tab=live", "/create")).toBe("/space?tab=live");
  });

  it("allows the bare root", () => {
    expect(safeInternalRedirectPath("/", "/create")).toBe("/");
  });
});

describe("safeInternalRedirectPath - rejects anything that could leave the site", () => {
  it("rejects an absolute external HTTPS URL", () => {
    expect(safeInternalRedirectPath("https://evil.example", "/create")).toBe("/create");
  });

  it("rejects an absolute external HTTP URL", () => {
    expect(safeInternalRedirectPath("http://evil.example/phish", "/create")).toBe("/create");
  });

  it("rejects a protocol-relative URL", () => {
    expect(safeInternalRedirectPath("//evil.example", "/create")).toBe("/create");
  });

  it("rejects a protocol-relative URL with a path", () => {
    expect(safeInternalRedirectPath("//evil.example/phish", "/create")).toBe("/create");
  });

  it("rejects a backslash-based protocol-relative trick", () => {
    expect(safeInternalRedirectPath("/\\evil.example", "/create")).toBe("/create");
  });

  it("rejects a javascript: URL", () => {
    expect(safeInternalRedirectPath("javascript:alert(1)", "/create")).toBe("/create");
  });

  it("rejects a data: URL", () => {
    expect(safeInternalRedirectPath("data:text/html,<script>alert(1)</script>", "/create")).toBe("/create");
  });

  it("rejects a value with no leading slash at all", () => {
    expect(safeInternalRedirectPath("create", "/create")).toBe("/create");
  });
});

describe("safeInternalRedirectPath - missing/empty/malformed input falls back", () => {
  it("falls back for null", () => {
    expect(safeInternalRedirectPath(null, "/create")).toBe("/create");
  });

  it("falls back for undefined", () => {
    expect(safeInternalRedirectPath(undefined, "/create")).toBe("/create");
  });

  it("falls back for an empty string", () => {
    expect(safeInternalRedirectPath("", "/create")).toBe("/create");
  });

  it("falls back when the URL parser rejects the value outright", () => {
    // "http://" alone has no host - genuinely malformed, and doesn't
    // start with "/" either, so this is rejected by the prefix check
    // before the parser even runs.
    expect(safeInternalRedirectPath("http://", "/create")).toBe("/create");
  });

  it("allows an unusual but genuinely same-origin path through unchanged", () => {
    // A raw space doesn't let anything escape the origin - the URL parser
    // percent-encodes it internally, but this function only cares whether
    // the resolved origin matches, so the original string passes through.
    expect(safeInternalRedirectPath("/ bad", "/create")).toBe("/ bad");
  });

  it("uses whatever fallback the caller supplies", () => {
    expect(safeInternalRedirectPath(null, "/")).toBe("/");
    expect(safeInternalRedirectPath("https://evil.example", "/")).toBe("/");
  });
});
