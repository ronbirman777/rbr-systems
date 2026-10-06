import { describe, expect, it } from "vitest";
import {
  EMPTY_FLOW_AUDIO_METADATA,
  FLOW_AUDIO_FOLDER_KEY,
  FLOW_AUDIO_KEY,
  FLOW_READINGS_KEY,
  blankFlowReading,
  blankFlowTrack,
  flowAudioMetadataSchema,
  parseFlowReadings,
  parseFlowTracks,
  playableTracks,
} from "./flowLibrary";
import { audioItemFields, audioNote, audioNoteField, readingMetadataSchema } from "./library";
import { audioMetadataSchema } from "@/lib/teach/schemas";
import { TEACH_AUDIO_FOLDER_KEY } from "@/lib/teach/schemas";

/**
 * TASK 029 - Flow's half of the shared library. What is tested here is
 * mostly that Flow is NOT its own thing: the validation comes from the
 * shared fields, and only the key names differ.
 */

describe("Flow uses its own keys and Teach keeps its own", () => {
  it("the module keys are distinct from Teach's", () => {
    expect(FLOW_READINGS_KEY).toBe("readings");
    expect(FLOW_AUDIO_KEY).toBe("audio");
  });

  it("the audio media folder is distinct from the module key AND from Teach's", () => {
    // A versioned path is {tenant}/{folder}/{item}/{uploadId}/... and an
    // audio item has both artwork and a file. Sharing the folder would
    // put two kinds of media in one item folder.
    expect(FLOW_AUDIO_FOLDER_KEY).toBe("audioFile");
    expect(FLOW_AUDIO_FOLDER_KEY).not.toBe(FLOW_AUDIO_KEY);
    expect(FLOW_AUDIO_FOLDER_KEY).not.toBe(TEACH_AUDIO_FOLDER_KEY);
  });
});

describe("flowAudioMetadataSchema is the shared fields plus Flow's note", () => {
  it("validates identically to Teach's, key names aside", () => {
    const stored = {
      audioRef: "t/audioFile/a/u/draft.mp3",
      durationSeconds: 1448,
      category: "Evening",
      imagePosition: { x: 50, y: 40 },
    };
    const flow = flowAudioMetadataSchema.parse({ ...stored, note: "  Lie down.  " });
    const teach = audioMetadataSchema.parse({ ...stored, teacherNote: "  Lie down.  " });
    expect(flow.audioRef).toBe(teach.audioRef);
    expect(flow.durationSeconds).toBe(teach.durationSeconds);
    expect(flow.category).toBe(teach.category);
    expect(flow.imagePosition).toEqual(teach.imagePosition);
    // Same trimming, same cap - because it is the same field builder.
    expect(flow.note).toBe(teach.teacherNote);
    expect(audioNoteField.safeParse("x".repeat(801)).success).toBe(false);
  });

  it("is assembled from the shared fields, not re-declared", () => {
    // The shared ceiling on duration, reached through Flow's schema.
    expect(flowAudioMetadataSchema.parse({ durationSeconds: 60 * 60 * 12 }).durationSeconds).toBe(60 * 60 * 12);
    expect(flowAudioMetadataSchema.parse({ durationSeconds: 60 * 60 * 12 + 1 }).durationSeconds).toBeNull();
    expect(audioItemFields.durationSeconds.parse(-1)).toBeNull();
  });

  it("tolerates every malformed stored value rather than failing the item", () => {
    expect(flowAudioMetadataSchema.parse({ audioRef: 42, durationSeconds: "nope" })).toEqual(
      EMPTY_FLOW_AUDIO_METADATA
    );
  });

  it("audioNote reads Flow's note without Teach's key present", () => {
    expect(audioNote(flowAudioMetadataSchema.parse({ note: "About the track" }))).toBe("About the track");
  });
});

describe("parsing a published payload", () => {
  const T = "11111111-1111-4111-8111-111111111111";

  it("reads the raw item envelope, camelCase or snake_case", () => {
    const [fromSnapshot] = parseFlowReadings([
      { id: "r1", title: "On arriving", imageRef: `${T}/readings/r1/u/published.webp`, metadata: { excerpt: "x" } },
    ]);
    const [fromRow] = parseFlowReadings([
      { id: "r1", title: "On arriving", image_ref: `${T}/readings/r1/u/published.webp`, metadata: { excerpt: "x" } },
    ]);
    expect(fromSnapshot?.imageRef).toBe(fromRow?.imageRef);
    expect(fromSnapshot?.metadata.excerpt).toBe("x");
  });

  it("drops one unusable item instead of blanking the whole screen", () => {
    const out = parseFlowReadings([
      { id: "r1", title: "Fine", metadata: {} },
      { id: "r2", title: "", metadata: {} },
      "not an object",
      null,
    ]);
    expect(out.map((r) => r.id)).toEqual(["r1"]);
  });

  it("returns nothing for a missing or non-array key", () => {
    expect(parseFlowReadings(undefined)).toEqual([]);
    expect(parseFlowTracks({ nope: true })).toEqual([]);
  });

  it("parses tracks through the shared reading/audio metadata schemas", () => {
    const [track] = parseFlowTracks([
      { id: "a1", title: "Nidra", metadata: { audioRef: "x", durationSeconds: 10, note: "n" } },
    ]);
    expect(track?.metadata.note).toBe("n");
    expect(readingMetadataSchema.parse({}).date).toBeNull();
  });
});

describe("playableTracks", () => {
  const track = (id: string, audioRef: string | null) => ({
    id,
    title: id,
    subtitle: null,
    description: null,
    imageRef: null,
    externalLink: null,
    metadata: { ...EMPTY_FLOW_AUDIO_METADATA, audioRef },
  });

  it("hides a track with no file from the guest, and keeps the rest in order", () => {
    const out = playableTracks([track("a", "ref-a"), track("b", null), track("c", "ref-c")]);
    expect(out.map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("is empty when nothing has been uploaded yet", () => {
    expect(playableTracks([track("a", null)])).toEqual([]);
  });
});

describe("blank items", () => {
  it("a new reading and a new track start fully defaulted", () => {
    const r = blankFlowReading();
    expect(r.title).toBe("");
    expect(r.metadata).toEqual({ excerpt: null, category: null, author: null, date: null, imagePosition: null });
    const a = blankFlowTrack();
    expect(a.metadata).toEqual(EMPTY_FLOW_AUDIO_METADATA);
    expect(a.audioUrl).toBeNull();
  });
});
