import { describe, expect, it } from "vitest";
import {
  previewDraftLabel,
  saveStatusLabel,
  studioStatusLabel,
  formatPublishedAtUtc,
  studioPublishState,
} from "./status";
import { displayPublicUrl, guestAppPath, publicSpaceUrl, qrDownloadFileName, qrImagePath } from "./publicLink";

describe("studio status vocabulary", () => {
  it("uses the shared Draft / Published / Previewing current draft labels", () => {
    expect(studioStatusLabel("draft")).toBe("Draft");
    expect(studioStatusLabel("published")).toBe("Published");
    expect(previewDraftLabel()).toBe("Previewing current draft");
  });

  it("speaks the Space language, not always English", () => {
    // This module is shared infrastructure rather than a product
    // surface, which is how it stayed English through CP3B's first pass
    // until browser QA caught it. These assertions are what stop that
    // happening again.
    expect(studioStatusLabel("draft", "he")).toBe("טיוטה");
    expect(studioStatusLabel("published", "de")).toBe("Veröffentlicht");
    expect(previewDraftLabel("de")).toBe("Vorschau des aktuellen Entwurfs");
    expect(saveStatusLabel({ saving: false, dirty: false }, "he")).toBe("כל השינויים נשמרו");
    expect(saveStatusLabel({ saving: false, dirty: true }, "de")).toBe("Nicht gespeicherte Änderungen");
    expect(saveStatusLabel({ saving: true, dirty: true }, "he")).toBe("שומר…");
  });
  it("derives state from the published stamp", () => {
    expect(studioPublishState(null)).toBe("draft");
    expect(studioPublishState(undefined)).toBe("draft");
    expect(studioPublishState("2026-10-03T10:38:12Z")).toBe("published");
  });
  it("formats the published time deterministically in UTC", () => {
    expect(formatPublishedAtUtc("2026-10-03T10:38:12.000Z")).toBe("2026-10-03 10:38 UTC");
    expect(formatPublishedAtUtc(null)).toBeNull();
    expect(formatPublishedAtUtc("not a date")).toBeNull();
  });
  it("describes save status", () => {
    expect(saveStatusLabel({ saving: true, dirty: true })).toBe("Saving…");
    expect(saveStatusLabel({ saving: false, dirty: true })).toBe("Unsaved changes");
    expect(saveStatusLabel({ saving: false, dirty: false })).toBe("All changes saved");
  });
});

describe("studio public link helpers", () => {
  const id = "3e6e4978-79a3-4912-98b5-c26d15d30155";
  it("uses the slug route when a slug exists, the id route otherwise", () => {
    expect(guestAppPath(id, "my-retreat")).toBe("/s/my-retreat");
    expect(guestAppPath(id, null)).toBe(`/g/${id}`);
    expect(publicSpaceUrl(id, "my-retreat").endsWith("/s/my-retreat")).toBe(true);
    expect(publicSpaceUrl(id, null).endsWith(`/g/${id}`)).toBe(true);
  });
  it("strips the scheme for display only", () => {
    expect(displayPublicUrl("https://app.example.com/s/x")).toBe("app.example.com/s/x");
  });
  it("builds a safe QR file name and the organizer-only QR path", () => {
    expect(qrDownloadFileName("My-Retreat")).toBe("my-retreat-qr.png");
    expect(qrDownloadFileName("../../x y")).toBe("xy-qr.png");
    expect(qrDownloadFileName(null)).toBe("space-qr.png");
    expect(qrImagePath(id)).toBe(`/api/qr/${id}`);
  });
});
