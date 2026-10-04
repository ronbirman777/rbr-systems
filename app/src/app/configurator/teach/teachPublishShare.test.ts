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
    settings: defaultTeachSettings(),
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

  it("offers the designed Share Card as a download beside the QR", () => {
    const html = renderToStaticMarkup(createElement(PublishSection, { api: makeApi(), preview: null }));
    expect(html).toContain('data-testid="share-card-panel"');
    expect(html).toContain("/api/share-card/11111111-2222-4333-8444-555555555555");
    expect(html).toContain('download="teacherexample-share-card.png"');
  });

  it("offers Share on WhatsApp with the teacher's name and role, and no phone number", () => {
    const api = makeApi();
    (api as unknown as { settings: { teachProfile: { teacherType: string | null } } }).settings.teachProfile.teacherType =
      "Yoga & Breathwork Educator";
    const html = renderToStaticMarkup(createElement(PublishSection, { api, preview: null }));
    expect(html).toContain('data-testid="share-whatsapp"');

    const share = [...html.matchAll(/href="(https:\/\/wa\.me\/[^"]*)"/g)].map((m) => m[1]);
    expect(share).toHaveLength(1);
    // No recipient digits - this opens WhatsApp's own contact picker.
    expect(share[0].startsWith("https://wa.me/?text=")).toBe(true);
    const text = decodeURIComponent(share[0].split("text=")[1]).replace(/&amp;/g, "&");
    expect(text).toContain("Lena Example Teacher");
    expect(text).toContain("Yoga & Breathwork Educator");
    expect(text).toContain("/s/teacherexample");
  });

  it("hides every share action until the Space is published", () => {
    const html = renderToStaticMarkup(createElement(PublishSection, { api: makeApi({ publishedAt: null }), preview: null }));
    expect(html).not.toContain('data-testid="share-whatsapp"');
    expect(html).not.toContain('download="teacherexample-share-card.png"');
    expect(html).not.toContain('download="teacherexample-qr.png"');
  });

  it("renders the opt-in on only when previously saved as on", () => {
    const on = renderToStaticMarkup(createElement(DirectoryOptInCard, { tenantId: "t", initialListed: true }));
    expect(on).toMatch(/aria-checked="true"/);
    const off = renderToStaticMarkup(createElement(DirectoryOptInCard, { tenantId: "t", initialListed: false }));
    expect(off).toMatch(/aria-checked="false"/);
    expect(off).toContain("Not listed");
  });
});
