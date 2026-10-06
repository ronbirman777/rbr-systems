import { describe, expect, it } from "vitest";
import { z } from "zod";
import { audioItemFields, audioNote, audioNoteField, readingMetadataSchema } from "./library";
import { collectMediaRefs, collectImageRefs, isPublishedMediaPath, isDraftMediaPath } from "@/lib/media/path";

/** What Phase 3 will declare for Flow: the shared fields, with Flow's `note`. */
const flowAudioMetadataSchema = z.object({
  audioRef: audioItemFields.audioRef,
  durationSeconds: audioItemFields.durationSeconds,
  category: audioItemFields.category,
  note: audioNoteField,
  imagePosition: audioItemFields.imagePosition,
});

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

describe("the shared Phase 1 schemas accept the real Staging 0033 Flow payload", () => {
  it("parses every published Flow reading", () => {
    for (const r of STAGING.readings) {
      const out = readingMetadataSchema.safeParse(r.metadata);
      expect(out.success, r.title).toBe(true);
    }
    expect(readingMetadataSchema.parse(STAGING.readings[0].metadata).excerpt).toBe("Landing takes a day.");
    // The reading with no date/imagePosition still gets the defaults.
    expect(readingMetadataSchema.parse(STAGING.readings[1].metadata).imagePosition).toBeNull();
  });

  it("parses every published Flow track, including the one with no file", () => {
    for (const a of STAGING.audio) {
      const out = flowAudioMetadataSchema.safeParse(a.metadata);
      expect(out.success, a.title).toBe(true);
    }
    expect(flowAudioMetadataSchema.parse(STAGING.audio[2].metadata).audioRef).toBeNull();
    expect(flowAudioMetadataSchema.parse(STAGING.audio[0].metadata).durationSeconds).toBe(1448);
  });

  it("audioNote reads Flow's `note` without Teach's key being present", () => {
    expect(audioNote(flowAudioMetadataSchema.parse(STAGING.audio[0].metadata))).toBe("Lie down somewhere warm.");
    expect(audioNote(flowAudioMetadataSchema.parse(STAGING.audio[1].metadata))).toBeNull();
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
