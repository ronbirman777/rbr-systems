import { describe, expect, it } from "vitest";
import fixture from "./postgresSnapshot.fixture.json";
import { parsePublishedTeachSpace } from "./guestData";

/**
 * TASK 027.5 Phase 4A: the fixture is a REAL published_spaces row produced by
 * migration 0028's publish_space() on a local Postgres (synthetic data; see
 * supabase/verification/0028_teach_foundation_verification.sql for the
 * scenario). It proves the SQL payload and the Guest App parser agree.
 */
const TENANT = "11111111-2222-4333-8444-555555555555";

describe("Guest parser consumes the real build_teach_payload output", () => {
  const data = parsePublishedTeachSpace(fixture as unknown as Parameters<typeof parsePublishedTeachSpace>[0]);

  it("yields a non-empty Teach space with identity, zone and brand hero", () => {
    expect(data.teacherName).toBe("E2E Teacher");
    expect(data.timezone).toBe("Asia/Bangkok");
    expect(data.heroImageRef).toBe(`${TENANT}/brand/hero/${data.heroImageRef?.split("/")[3]}/published.webp`);
  });

  it("expands the recurring class server-side and keeps its venue/registration", () => {
    expect(data.classes.length).toBeGreaterThan(1);
    expect(data.classes[0].title).toBe("Morning flow");
    expect(data.classes[0].metadata.venue.name).toBe("Venue");
  });

  it("hidden content never arrives: disabled availability and disabled custom pages are absent", () => {
    expect(data.availability).toHaveLength(1);
    expect(data.customPages.map((p) => p.title)).toEqual(["On"]);
  });

  it("every media ref is a published.* object inside this tenant (no draft leaks)", () => {
    for (const ref of Object.keys(data.mediaUrls)) {
      expect(ref.startsWith(`${TENANT}/`)).toBe(true);
      expect(ref).toMatch(/\/published\.[a-z0-9]+$/);
    }
    expect(Object.keys(data.mediaUrls).length).toBeGreaterThanOrEqual(5);
    expect(data.audio[0].metadata.audioRef).toMatch(/\/teachAudioFile\/a1\/[0-9a-f-]+\/published\.mp3$/);
    expect(JSON.stringify(fixture)).not.toMatch(/\/draft\./);
  });

  it("settings, Explore modules and daily inspiration come through", () => {
    expect(data.settings.teachAbout.about).toBe("About me");
    expect(data.settings.teachStyle.preset).toBe("earth");
    expect(data.settings.dailyInspiration.quotes).toEqual(["Breathe"]);
    expect(data.enabledExplore).toEqual(["teachReadings", "teachAudio", "customPages"]);
    expect(data.gallery).toHaveLength(1);
    expect(data.certificates).toHaveLength(1);
    expect(data.readings).toHaveLength(1);
  });
});
