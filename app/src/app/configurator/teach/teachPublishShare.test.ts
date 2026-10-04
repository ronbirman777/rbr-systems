import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { teachDirectorySchema, TEACH_DIRECTORY_KEY, TEACH_SETTINGS_KEYS, defaultTeachSettings } from "@/lib/teach/schemas";
import { DirectoryOptInCard, PublishSection } from "./teach-studio-sections";
import type { StudioApi } from "./teach-studio";

describe("Teach directory opt-in (schema)", () => {
  it("defaults to not listed, and a corrupt value falls back to not listed", () => {
    expect(teachDirectorySchema.parse({}).listed).toBe(false);
    expect(teachDirectorySchema.parse({ listed: "yes" }).listed).toBe(false);
    expect(teachDirectorySchema.parse({ listed: null }).listed).toBe(false);
    expect(teachDirectorySchema.parse({ listed: true }).listed).toBe(true);
  });

  it("is a private key that is never part of the published settings whitelist", () => {
    expect((TEACH_SETTINGS_KEYS as readonly string[]).includes(TEACH_DIRECTORY_KEY)).toBe(false);
    expect(Object.keys(defaultTeachSettings())).not.toContain(TEACH_DIRECTORY_KEY);
  });
});

function makeApi(over: Record<string, unknown> = {}) {
  return {
    tenantId: "11111111-2222-4333-8444-555555555555",
    name: "Lena Example Teacher",
    slug: "teacherexample",
    publishedAt: "2026-10-04T00:00:00Z",
    canPublish: true,
    accessLabel: "Complimentary",
    heroImageRef: null,
    directoryListed: false,
    items: { teachClasses: [], teachAvailability: [] },
    ...over,
  } as unknown as StudioApi;
}

describe("Teach Publish & Share section", () => {
  it("shows the public link, the QR code and an unchecked opt-in", () => {
    const html = renderToStaticMarkup(createElement(PublishSection, { api: makeApi(), preview: null }));
    expect(html).toContain("teacherexample");
    expect(html).toContain('data-testid="qr-code-card"');
    expect(html).toContain("/api/qr/11111111-2222-4333-8444-555555555555");
    expect(html).toContain("List me on InnerDweS");
    expect(html).toMatch(/role="switch"[^>]*aria-checked="false"/);
    expect(html).not.toContain("Open live app");
  });

  it("never embeds a token in the QR source", () => {
    const html = renderToStaticMarkup(createElement(PublishSection, { api: makeApi(), preview: null }));
    const urls = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
    expect(urls.filter((u) => /\/api\/qr\/|\/s\//.test(u)).every((u) => !u.includes("?") && !/token|code=/i.test(u))).toBe(true);
    expect(html).toContain('download="teacherexample-qr.png"');
  });

  it("renders the opt-in on only when previously saved as on", () => {
    const on = renderToStaticMarkup(createElement(DirectoryOptInCard, { tenantId: "t", initialListed: true }));
    expect(on).toMatch(/aria-checked="true"/);
    const off = renderToStaticMarkup(createElement(DirectoryOptInCard, { tenantId: "t", initialListed: false }));
    expect(off).toMatch(/aria-checked="false"/);
    expect(off).toContain("Not listed");
  });
});
