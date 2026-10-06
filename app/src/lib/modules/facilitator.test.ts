import { describe, expect, it } from "vitest";
import { facilitatorSavePayload, facilitatorSchema } from "./facilitator";

describe("facilitatorSchema", () => {
  it("accepts a complete facilitator with socialLinks and specialties", () => {
    const result = facilitatorSchema.safeParse({
      name: "Maya Cohen",
      role: "Yoga Facilitator",
      bio: "Ten years teaching.",
      imageRef: null,
      specialties: ["Vinyasa Flow", "Pranayama"],
      socialLinks: [{ platform: "instagram", url: "https://instagram.com/maya" }],
    });
    expect(result.success).toBe(true);
  });

  /**
   * Backward compatibility: a published_spaces snapshot written before
   * socialLinks/specialties existed has neither key at all. Without
   * .default([]) on both fields, this parse would fail entirely - not
   * just for the missing fields, but for the whole facilitator object -
   * which would silently break an already-published, unrelated tenant's
   * Team screen the moment this code ships, with no migration and no
   * republish involved. This is the single most important backward-
   * compatibility guarantee in this batch.
   */
  it("defaults specialties and socialLinks to [] when absent - old snapshot shape", () => {
    const result = facilitatorSchema.safeParse({
      name: "Maya Cohen",
      role: "Yoga Facilitator",
      bio: "Ten years teaching.",
      imageRef: null,
      // socialLinks/specialties deliberately omitted, matching a real
      // pre-Product-Completion published snapshot's facilitator shape.
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.specialties).toEqual([]);
      expect(result.data.socialLinks).toEqual([]);
    }
  });

  it("rejects an empty name", () => {
    const result = facilitatorSchema.safeParse({ name: "", role: null, bio: null, imageRef: null });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed social link even when present", () => {
    const result = facilitatorSchema.safeParse({
      name: "Maya Cohen",
      role: null,
      bio: null,
      imageRef: null,
      specialties: [],
      socialLinks: [{ platform: "instagram", url: "not-a-url" }],
    });
    expect(result.success).toBe(false);
  });

  it("defaults imagePosition to null when absent - same backward-compat discipline as specialties/socialLinks", () => {
    const result = facilitatorSchema.safeParse({ name: "Maya Cohen", role: null, bio: null, imageRef: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.imagePosition).toBeNull();
  });

  it("accepts a valid imagePosition", () => {
    const result = facilitatorSchema.safeParse({
      name: "Maya Cohen",
      role: null,
      bio: null,
      imageRef: null,
      imagePosition: { x: 50, y: 15 },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.imagePosition).toEqual({ x: 50, y: 15 });
  });

  it("rejects an out-of-range imagePosition", () => {
    const result = facilitatorSchema.safeParse({
      name: "Maya Cohen",
      role: null,
      bio: null,
      imageRef: null,
      imagePosition: { x: 150, y: -5 },
    });
    expect(result.success).toBe(false);
  });

  it("accepts an explicit null imagePosition (reset to default)", () => {
    const result = facilitatorSchema.safeParse({
      name: "Maya Cohen",
      role: null,
      bio: null,
      imageRef: null,
      imagePosition: null,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.imagePosition).toBeNull();
  });

  /**
   * Manual QA Fixes phase - Team screen rendering. facilitators-screen.tsx
   * shows its whole "extras" panel (specialties pills, bio, social icons)
   * when ANY of the three is present - specialties/socialLinks with no
   * bio at all must still parse as a fully valid facilitator, since the
   * render condition depends on this exact shape being reachable.
   */
  it("accepts specialties and socialLinks with no bio at all - Team must be able to show just these two", () => {
    const result = facilitatorSchema.safeParse({
      name: "Maya Cohen",
      role: "Yoga Facilitator",
      bio: null,
      imageRef: null,
      specialties: ["Vinyasa Flow"],
      socialLinks: [{ platform: "instagram", url: "https://instagram.com/maya" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bio).toBeNull();
      expect(result.data.specialties.length).toBeGreaterThan(0);
      expect(result.data.socialLinks.length).toBeGreaterThan(0);
    }
  });

  it("accepts all six supported social platforms", () => {
    const platforms = ["instagram", "facebook", "youtube", "tiktok", "linkedin", "website"] as const;
    for (const platform of platforms) {
      const result = facilitatorSchema.safeParse({
        name: "Maya Cohen",
        role: null,
        bio: null,
        imageRef: null,
        socialLinks: [{ platform, url: "https://example.com/maya" }],
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("the Team save carries the whole facilitator", () => {
  it("posts every field the server will parse", () => {
    // TASK 029 found longBio missing from the Studio's save payload in
    // real Staging QA: the editor wrote the field, the save dropped it,
    // the server defaulted it back to null and nothing errored. The list
    // of posted keys now lives in one place, and this asserts it covers
    // the schema - so a new field added to facilitatorSchema without a
    // matching line in facilitatorSavePayload fails here.
    const schemaKeys = Object.keys(facilitatorSchema.shape).sort();
    const [posted] = facilitatorSavePayload([
      {
        id: "f1",
        name: "QA",
        role: null,
        bio: null,
        longBio: "the long version",
        imageRef: null,
        specialties: [],
        socialLinks: [],
        imagePosition: null,
      },
    ]);
    expect(Object.keys(posted).filter((k) => k !== "id").sort()).toEqual(schemaKeys);
    expect(posted.longBio).toBe("the long version");
    // And what is posted survives the server's own parse unchanged.
    expect(facilitatorSchema.parse(posted).longBio).toBe("the long version");
  });

  it("keeps longBio when it is empty, rather than dropping the key", () => {
    const [posted] = facilitatorSavePayload([
      { id: "f2", name: "QA", role: null, bio: "short", longBio: null, imageRef: null, specialties: [], socialLinks: [], imagePosition: null },
    ]);
    expect("longBio" in posted).toBe(true);
    expect(posted.longBio).toBeNull();
  });
});
