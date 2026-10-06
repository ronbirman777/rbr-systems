import { z } from "zod";
import {
  audioItemFields,
  audioNoteField,
  parseLibraryItems,
  readingMetadataSchema,
  type EditableLibraryItem,
  type LibraryItem,
  type ReadingMetadata,
} from "./library";

/**
 * Time to Flow's Readings and Audio.
 *
 * Both are the shared library (lib/modules/library.ts) under Flow's own
 * module keys, so this file is mostly names: the shapes, the caps, the
 * selectors and the player all come from the shared layer, and what
 * belongs to Flow is only which `module_key` the rows live under and
 * what the audio note is called.
 *
 *   Flow   module_items 'readings' / 'audio'      note field: `note`
 *   Teach  module_items 'teachReadings' / 'teachAudio'   note: `teacherNote`
 *
 * Teach's keys and its `teacherNote` field name are live data in every
 * published snapshot and are deliberately NOT renamed to match (TASK
 * 029, D2 and D7). `audioNote()` in the shared layer reads either, so
 * nothing downstream has to know which product it is looking at.
 */

export const FLOW_READINGS_KEY = "readings";
export const FLOW_AUDIO_KEY = "audio";

/**
 * Flow's audio metadata: the shared fields, with Flow's name for the note.
 *
 * Assembled from `audioItemFields` rather than re-declared, so the cap on
 * `category`, the 12-hour ceiling on `durationSeconds` and the
 * `.catch(null)` tolerance on `audioRef` are the same values Teach
 * validates against and cannot drift from them.
 */
export const flowAudioMetadataSchema = z.object({
  audioRef: audioItemFields.audioRef,
  durationSeconds: audioItemFields.durationSeconds,
  category: audioItemFields.category,
  note: audioNoteField,
  imagePosition: audioItemFields.imagePosition,
});

export type FlowAudioMetadata = z.infer<typeof flowAudioMetadataSchema>;

export type FlowReading = LibraryItem<ReadingMetadata>;
export type FlowTrack = LibraryItem<FlowAudioMetadata>;

export type EditableFlowReading = EditableLibraryItem<ReadingMetadata>;
export type EditableFlowTrack = EditableLibraryItem<FlowAudioMetadata>;

/**
 * What a renderer needs: the item plus its resolved, display-ready URLs.
 *
 * The same two shapes serve the Studio preview (signed draft URLs) and
 * the published Guest App (/api/media URLs). Neither screen knows or
 * cares which it was given - exactly like DisplayMeal and its siblings.
 */
export type DisplayFlowReading = FlowReading & { imageUrl: string | null };
export type DisplayFlowTrack = FlowTrack & { imageUrl: string | null; audioUrl: string | null };

/** Tolerant parse of the published `modules.readings` array. */
export function parseFlowReadings(raw: unknown): FlowReading[] {
  return parseLibraryItems(raw, readingMetadataSchema);
}

/** Tolerant parse of the published `modules.audio` array. */
export function parseFlowTracks(raw: unknown): FlowTrack[] {
  return parseLibraryItems(raw, flowAudioMetadataSchema);
}

export const EMPTY_READING_METADATA: ReadingMetadata = {
  excerpt: null,
  category: null,
  author: null,
  date: null,
  imagePosition: null,
};

export const EMPTY_FLOW_AUDIO_METADATA: FlowAudioMetadata = {
  audioRef: null,
  durationSeconds: null,
  category: null,
  note: null,
  imagePosition: null,
};

export function blankFlowReading(): EditableFlowReading {
  return {
    id: crypto.randomUUID(),
    title: "",
    subtitle: null,
    description: null,
    imageRef: null,
    imageUrl: null,
    externalLink: null,
    metadata: { ...EMPTY_READING_METADATA },
  };
}

export function blankFlowTrack(): EditableFlowTrack {
  return {
    id: crypto.randomUUID(),
    title: "",
    subtitle: null,
    description: null,
    imageRef: null,
    imageUrl: null,
    audioUrl: null,
    externalLink: null,
    metadata: { ...EMPTY_FLOW_AUDIO_METADATA },
  };
}

/**
 * A track a guest can actually play.
 *
 * The Guest list hides a track with no file: an organizer who has added
 * the row but not yet uploaded the audio has a draft, not a broadcast.
 * The Studio still shows it, with "no file yet", which is the difference
 * between the two surfaces rather than two different rules.
 */
export function playableTracks(tracks: FlowTrack[]): FlowTrack[] {
  return tracks.filter((t) => Boolean(t.metadata.audioRef));
}

/**
 * The media-path folder segment audio files live under.
 *
 * Deliberately NOT the module key. A versioned media path is
 * `{tenant}/{folder}/{item}/{uploadId}/{draft|published}.<ext>`, and an
 * audio item has BOTH an artwork image and an audio file - so if both
 * used the folder "audio" they would share an item folder and the
 * published-media walker could not tell one kind from the other. Teach
 * solved this the same way in 0028 with `teachAudioFile`; this is its
 * Flow counterpart, and the two must stay distinct from each other and
 * from every module key.
 */
export const FLOW_AUDIO_FOLDER_KEY = "audioFile";
