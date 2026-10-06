import { describe, expect, it } from "vitest";
import { audioNote, readingMetadataSchema } from "./library";
import { collectMediaRefs, collectImageRefs, isPublishedMediaPath, isDraftMediaPath } from "@/lib/media/path";
// The REAL Flow schema, not a copy of it - this file is worth little if
// it validates a second declaration that could drift from the shipped one.
import { flowAudioMetadataSchema, parseFlowReadings, parseFlowTracks } from "./flowLibrary";
import { publicScheduleItemSchema, hasActivityExtras } from "@/lib/schedule/types";
import { facilitatorSchema } from "./facilitator";
import { facilitySchema } from "./facility";
import { treatmentSchema } from "./treatment";
import { publishedGuidelineSchema } from "./guideline";
import { retreatProfileSchema } from "./retreatProfile";
import { moduleIntro, moduleIntrosSchema } from "./moduleIntro";

const T = "c585f413-fdaf-44c1-994a-83248b180ae8";
const UP = "up-t029-344caa61";

/** Copied verbatim out of Staging's published_spaces.modules after 0033. */
const STAGING = {
  readings: [
    { id: "033d7def-9c91-4389-8e63-52cc7fdb52c3", title: "On arriving", subtitle: null,
      description: "Landing takes a day. Expect to feel busy for the first evening and let that be fine.",
      imageRef: `${T}/readings/r1/${UP}/published.webp`, externalLink: null,
      metadata: { date: "2026-04-20", author: "Lena Hoffmann", excerpt: "Landing takes a day.", category: "Before you come", imagePosition: { x: 50, y: 30 } } },
    { id: "ee879838-2556-4c63-a4b7-caf9c706acdb", title: "On leaving", subtitle: null,
      description: "The week after is part of the retreat.", imageRef: null, externalLink: "https://example.test/essay",
      metadata: { date: "2026-05-12", author: "Lena Hoffmann", excerpt: "The week after is part of it.", category: "After" } },
  ],
  audio: [
    { id: "3287bd8f-6c2f-48b5-8b70-afe6adc01ea6", title: "Evening Nidra", subtitle: null,
      description: "A slow landing, for the first night.", imageRef: null, externalLink: null,
      metadata: { note: "Lie down somewhere warm.", audioRef: `${T}/audio/a1/${UP}/published.mp3`, category: "Evening", imagePosition: { x: 50, y: 40 }, durationSeconds: 1448 } },
    { id: "44140df2-41f8-4439-9f82-0551b8e958e9", title: "Morning Breath", subtitle: null,
      description: "Ten minutes before you get up.", imageRef: null, externalLink: null,
      metadata: { audioRef: `${T}/audio/a2/${UP}/published.mp3`, category: "Morning", durationSeconds: 612 } },
    { id: "fa24b2ae-da2e-4e17-9dce-c00b3fb72151", title: "No file yet", subtitle: null,
      description: null, imageRef: null, externalLink: null, metadata: { category: "Morning" } },
  ],
  moduleCovers: {
    audio: { imageRef: `${T}/audio/_cover/${UP}/published.webp`, imagePosition: { x: 55, y: 35 } },
    readings: { imageRef: `${T}/readings/_cover/${UP}/published.webp`, imagePosition: { x: 40, y: 20 } },
    guidelines: { imageRef: `${T}/guidelines/_cover/${UP}/published.webp`, imagePosition: { x: 50, y: 50 } },
  },
};

describe("the real Staging 0033 payload, through the real Flow read path", () => {
  // Through parseFlowReadings/parseFlowTracks - the functions the
  // published route actually calls - not just their metadata schemas.
  const readings = parseFlowReadings(STAGING.readings);
  const tracks = parseFlowTracks(STAGING.audio);

  it("keeps every published reading, with its metadata and its envelope", () => {
    expect(readings).toHaveLength(STAGING.readings.length);
    expect(readings[0]?.metadata.excerpt).toBe("Landing takes a day.");
    expect(readings[0]?.imageRef).toContain("/published.webp");
    // The reading with no date or focal point still gets the defaults.
    expect(readings[1]?.metadata.imagePosition).toBeNull();
    expect(readings[1]?.externalLink).toBe("https://example.test/essay");
    expect(readingMetadataSchema.parse({}).date).toBeNull();
  });

  it("keeps every published track, including the one with no file yet", () => {
    expect(tracks).toHaveLength(STAGING.audio.length);
    expect(tracks[0]?.metadata.durationSeconds).toBe(1448);
    expect(tracks[2]?.metadata.audioRef).toBeNull();
    expect(flowAudioMetadataSchema.parse({}).note).toBeNull();
  });

  it("audioNote reads Flow's `note` without Teach's key being present", () => {
    expect(audioNote(tracks[0]!.metadata)).toBe("Lie down somewhere warm.");
    expect(audioNote(tracks[1]!.metadata)).toBeNull();
  });
});

describe("media authorization sees the new Flow refs", () => {
  const refs = collectMediaRefs(STAGING);

  it("collectMediaRefs finds both Flow audio tracks' audioRef", () => {
    expect(refs.has(`${T}/audio/a1/${UP}/published.mp3`)).toBe(true);
    expect(refs.has(`${T}/audio/a2/${UP}/published.mp3`)).toBe(true);
  });

  it("it finds the reading image and all three new module covers", () => {
    expect(refs.has(`${T}/readings/r1/${UP}/published.webp`)).toBe(true);
    for (const m of ["audio", "readings", "guidelines"]) {
      expect(refs.has(`${T}/${m}/_cover/${UP}/published.webp`), m).toBe(true);
    }
  });

  it("every ref it collected is a published path, and none is a draft", () => {
    expect(refs.size).toBe(6);
    for (const r of refs) {
      expect(isPublishedMediaPath(r), r).toBe(true);
      expect(isDraftMediaPath(r), r).toBe(false);
    }
  });

  it("the audio refs are reachable only through collectMediaRefs, not collectImageRefs", () => {
    const images = collectImageRefs(STAGING);
    expect(images.has(`${T}/audio/a1/${UP}/published.mp3`)).toBe(false);
    expect(images.size).toBe(4);
  });
});

/**
 * The Guest read path for everything 0033 publishes.
 *
 * This is the half a SQL test cannot cover: publish_space() decides what
 * is IN the snapshot, and these schemas decide what a guest can SEE of
 * it. A field that publishes but is not declared here is silently
 * stripped and never reaches a screen - which is how a shipped feature
 * can be invisible with every other test green.
 */
describe("the 0033 published payload, read by the Flow schemas", () => {
  it("a schedule item carries its per-activity extras through", () => {
    const r = publicScheduleItemSchema.parse({
      date: "2026-05-04", startTime: "07:00", endTime: "08:15", title: "Sunrise Movement",
      facilitator: "Lena Hoffmann", location: "Shala", description: "Gentle flow.", category: "yoga",
      whatToBring: ["Mat", "Blanket"], whatToExpect: ["Barefoot", "Outdoors if dry"],
    });
    expect(r.whatToBring).toEqual(["Mat", "Blanket"]);
    expect(r.whatToExpect).toEqual(["Barefoot", "Outdoors if dry"]);
    expect(hasActivityExtras(r)).toBe(true);
  });

  it("an activity published with NO extras defaults to empty, not undefined", () => {
    // publish_space omits the keys entirely for such an activity - that
    // is the byte-equivalence guarantee - so the read side must default.
    const r = publicScheduleItemSchema.parse({
      date: "2026-05-04", startTime: "19:30", endTime: null, title: "Sound Bath",
      facilitator: null, location: "Garden", description: null, category: "sound",
    });
    expect(r.whatToBring).toEqual([]);
    expect(hasActivityExtras(r)).toBe(false);
  });

  it("guidelines parse in their published order", () => {
    const out = [
      { title: "Quiet hours", description: "22:00 to 07:00, everywhere on the grounds." },
      { title: "Phones", description: "Please keep them in your room during sessions." },
      { title: "Shoes", description: "Off at the shala door." },
    ].map((g) => publishedGuidelineSchema.parse(g));
    expect(out.map((g) => g.title)).toEqual(["Quiet hours", "Phones", "Shoes"]);
  });

  it("retreatProfile parses the six approved fields verbatim", () => {
    const r = retreatProfileSchema.parse({
      tagline: "Seven days of coming back to yourself",
      shortDescription: "A small, quiet retreat in the Black Forest.",
      longDescription: "Return to Balance is seven days of movement, silence and long meals.",
      welcome: "We are glad you are coming.",
      whatToBring: ["Layers", "A journal", "Shoes you can walk in"],
      whatToExpect: ["Early mornings", "Long silences", "No phones in sessions"],
    });
    expect(r.whatToBring).toHaveLength(3);
    expect(r.tagline).toBe("Seven days of coming back to yourself");
  });

  it("moduleIntros reads the meals intro, and nothing for a module without one", () => {
    const intros = moduleIntrosSchema.parse({
      meals: { intro: "Everything is cooked that morning, and almost all of it is vegetarian." },
    });
    expect(moduleIntro(intros, "meals")).toContain("cooked that morning");
    expect(moduleIntro(intros, "facilities")).toBeNull();
  });

  it("a treatment carries price / currency / chargeType / availability through", () => {
    const r = treatmentSchema.parse({
      name: "Massage Treatments", shortDescription: "Deep tissue and Thai",
      description: "Ninety minutes with Noi.", durationMinutes: 90, imageRef: null,
      provider: "Noi", location: "Spa hut", bookingInfo: "Ask at reception", imagePosition: null,
      price: 700, currency: "THB", chargeType: "additional", availability: "Subject to availability",
    });
    expect([r.price, r.currency, r.chargeType, r.availability]).toEqual([
      700, "THB", "additional", "Subject to availability",
    ]);
  });

  it("a treatment published before 0033 defaults all four to null", () => {
    const r = treatmentSchema.parse({
      name: "Massage", shortDescription: null, description: null, durationMinutes: null,
      imageRef: null, provider: null, location: null, bookingInfo: null, imagePosition: null,
    });
    expect([r.price, r.currency, r.chargeType, r.availability]).toEqual([null, null, null, null]);
  });

  it("drops a chargeType that is not one of the two, rather than printing it", () => {
    expect(
      treatmentSchema.parse({
        name: "x", shortDescription: null, description: null, durationMinutes: null, imageRef: null,
        provider: null, location: null, bookingInfo: null, imagePosition: null, chargeType: "free",
      }).chargeType
    ).toBeNull();
  });

  it("a facility's two descriptions are distinct fields", () => {
    const f = facilitySchema.parse({
      name: "Spring Pool",
      shortDescription: "Spring fed, always 18 degrees",
      description: "The pool is fed by the hillside spring and is never heated.",
      imageRef: null, openingHours: "07:00-20:00", location: "Lower terrace",
      importantInfo: "No diving", imagePosition: null,
    });
    expect(f.shortDescription).toBe("Spring fed, always 18 degrees");
    expect(f.description).toContain("never heated");
    // There must be no second home for it - see lib/modules/facility.ts.
    expect(Object.keys(f)).not.toContain("metadata");
  });

  it("a facility published before 0033 has no shortDescription and still parses", () => {
    expect(
      facilitySchema.parse({
        name: "Pool", description: "d", imageRef: null, openingHours: null,
        location: null, importantInfo: null, imagePosition: null,
      }).shortDescription
    ).toBeNull();
  });

  it("a facilitator carries both bios, and neither replaces the other", () => {
    const f = facilitatorSchema.parse({
      name: "Lena Hoffmann", role: "Lead facilitator", bio: "Twenty years of practice.",
      longBio: "Lena trained in Mysore and has taught since 2006.",
      imageRef: null, specialties: ["Hatha"], socialLinks: [], imagePosition: null,
    });
    expect(f.bio).toBe("Twenty years of practice.");
    expect(f.longBio).toContain("Mysore");
  });

  it("a facilitator published before 0033 has no longBio and still parses", () => {
    expect(
      facilitatorSchema.parse({
        name: "Lena", role: null, bio: "short", imageRef: null, specialties: [],
        socialLinks: [], imagePosition: null,
      }).longBio
    ).toBeNull();
  });
});
