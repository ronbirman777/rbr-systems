import { describe, expect, it } from "vitest";
import { z } from "zod";
import { optionalFocalPointSchema } from "@/lib/media/focalPoint";
import { audioMetadataSchema, readingMetadataSchema as teachReadingSchema } from "@/lib/teach/schemas";
import { audioFileProblem, MAX_AUDIO_BYTES } from "@/lib/media/audio";
import { formatDuration } from "./duration";
import { isoDateString, optText } from "./fields";
import {
  audioItemFields,
  audioNote,
  audioNoteField,
  itemCategories,
  readingMetadataSchema,
  readingMinutes,
  sortByDateDesc,
} from "./library";

/**
 * TASK 029 Phase 1 - the extraction must not change what Teach stores.
 *
 * The Readings/Audio metadata shapes moved out of lib/teach/schemas.ts into
 * lib/modules/library.ts so Flow can share them. The risk of that move is
 * silent drift: a cap that changed, a `.catch()` that was dropped, a key
 * that got reordered. So the schemas Teach uses today are compared against
 * a LITERAL RE-DECLARATION of their pre-extraction definitions, copied
 * verbatim from the commit before this one, rather than against themselves.
 */

/** lib/teach/schemas.ts at d3f4bed, verbatim. */
const PRE_EXTRACTION_OPT_TEXT = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => {
      const t = v?.trim();
      return t ? t : null;
    });
const PRE_EXTRACTION_ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const preExtractionReadingSchema = z.object({
  excerpt: PRE_EXTRACTION_OPT_TEXT(500),
  category: PRE_EXTRACTION_OPT_TEXT(60),
  author: PRE_EXTRACTION_OPT_TEXT(100),
  date: PRE_EXTRACTION_ISO_DATE.nullable().catch(null).default(null),
  imagePosition: optionalFocalPointSchema,
});

const preExtractionAudioSchema = z.object({
  audioRef: z.string().max(400).nullable().catch(null).default(null),
  durationSeconds: z.number().min(0).max(60 * 60 * 12).nullable().catch(null).default(null),
  category: PRE_EXTRACTION_OPT_TEXT(60),
  teacherNote: PRE_EXTRACTION_OPT_TEXT(800),
  imagePosition: optionalFocalPointSchema,
});

/** Stored values, including the malformed ones the `.catch()`es exist for. */
const READING_INPUTS: unknown[] = [
  {},
  { excerpt: "  spaced  ", category: "", author: null, date: "2026-03-01", imagePosition: { x: 20, y: 80 } },
  { excerpt: "x".repeat(500), category: "Morning", author: "Lena Hoffmann", date: "not-a-date" },
  { date: 12345, imagePosition: "nonsense" },
  { excerpt: "   ", category: "   ", author: "   ", date: null, imagePosition: null },
  { excerpt: undefined, category: undefined },
  { imagePosition: { x: -40, y: 400 } },
];

const AUDIO_INPUTS: unknown[] = [
  {},
  { audioRef: "t/m/i/u/draft.mp3", durationSeconds: 612, category: "Evening", teacherNote: "  breathe  " },
  { audioRef: 42, durationSeconds: "nope", category: "", teacherNote: "   " },
  { durationSeconds: -1 },
  { durationSeconds: 60 * 60 * 12 },
  { durationSeconds: 60 * 60 * 12 + 1 },
  { audioRef: "x".repeat(401), teacherNote: "x".repeat(800) },
  { imagePosition: { x: 10, y: 10 } },
];

describe("the shared library schemas are the pre-extraction Teach schemas", () => {
  it("parses every reading input identically, key order included", () => {
    for (const input of READING_INPUTS) {
      const before = preExtractionReadingSchema.safeParse(input);
      const after = teachReadingSchema.safeParse(input);
      expect(after.success).toBe(before.success);
      if (before.success && after.success) {
        expect(after.data).toEqual(before.data);
        expect(Object.keys(after.data)).toEqual(Object.keys(before.data));
      }
    }
  });

  it("parses every audio input identically, key order included", () => {
    for (const input of AUDIO_INPUTS) {
      const before = preExtractionAudioSchema.safeParse(input);
      const after = audioMetadataSchema.safeParse(input);
      expect(after.success).toBe(before.success);
      if (before.success && after.success) {
        expect(after.data).toEqual(before.data);
        // Teach's stored key order is part of the contract: the shared
        // fields are assembled into Teach's own object, not appended to a
        // base, precisely so this stays true.
        expect(Object.keys(after.data)).toEqual(["audioRef", "durationSeconds", "category", "teacherNote", "imagePosition"]);
      }
    }
  });

  it("Teach re-exports the shared reading schema rather than a copy of it", () => {
    expect(teachReadingSchema).toBe(readingMetadataSchema);
  });

  it("the shared primitives are the ones Teach's other fields still use", () => {
    expect(optText(10).parse("  hi  ")).toBe("hi");
    expect(optText(10).parse("   ")).toBeNull();
    expect(optText(10).parse(undefined)).toBeNull();
    expect(optText(3).safeParse("abcd").success).toBe(false);
    expect(isoDateString.safeParse("2026-10-06").success).toBe(true);
    expect(isoDateString.safeParse("2026-10-6").success).toBe(false);
  });

  it("exposes the audio note field Flow will store under its own key", () => {
    expect(audioNoteField.parse("  note  ")).toBe("note");
    expect(audioNoteField.safeParse("x".repeat(801)).success).toBe(false);
    // The shared fields carry no note of their own - that is the point.
    expect(Object.keys(audioItemFields)).toEqual(["audioRef", "durationSeconds", "category", "imagePosition"]);
  });
});

describe("audioNote reads either product's key", () => {
  it("prefers Flow's `note`, falls back to Teach's `teacherNote`", () => {
    expect(audioNote({ teacherNote: "from the teacher" })).toBe("from the teacher");
    expect(audioNote({ note: "about the track" })).toBe("about the track");
    expect(audioNote({ note: "wins", teacherNote: "loses" })).toBe("wins");
    expect(audioNote({})).toBeNull();
    expect(audioNote({ note: null, teacherNote: null })).toBeNull();
  });
});

describe("readingMinutes", () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

  it("says nothing about a piece too short to estimate", () => {
    expect(readingMinutes(null)).toBeNull();
    expect(readingMinutes("")).toBeNull();
    expect(readingMinutes("   ")).toBeNull();
    expect(readingMinutes(words(40))).toBeNull();
  });

  it("rounds to at least one minute once the piece is long enough", () => {
    expect(readingMinutes(words(41))).toBe(1);
    expect(readingMinutes(words(200))).toBe(1);
    expect(readingMinutes(words(500))).toBe(3);
    expect(readingMinutes(words(1000))).toBe(5);
  });

  it("counts words, not whitespace", () => {
    expect(readingMinutes(`  ${words(600)}\n\n  `)).toBe(3);
  });

  it("matches the Teach implementation it replaced", () => {
    const before = (body: string | null | undefined) => {
      const n = (body ?? "").trim().split(/\s+/).filter(Boolean).length;
      return n > 40 ? Math.max(1, Math.round(n / 200)) : null;
    };
    for (const n of [0, 1, 40, 41, 99, 100, 101, 300, 1234]) {
      expect(readingMinutes(words(n))).toBe(before(words(n)));
    }
  });
});

describe("itemCategories", () => {
  const item = (category: string | null) => ({ metadata: { category } });

  it("is distinct, in first-appearance order, and drops the empties", () => {
    expect(itemCategories([item("B"), item(null), item("A"), item("B")])).toEqual(["B", "A"]);
    expect(itemCategories([])).toEqual([]);
    expect(itemCategories([item(null), item(null)])).toEqual([]);
  });
});

describe("sortByDateDesc", () => {
  const item = (date: string | null) => ({ metadata: { date } });

  it("puts the newest first and the undated last", () => {
    const out = sortByDateDesc([item("2026-01-01"), item(null), item("2026-05-05"), item("2025-12-31")]);
    expect(out.map((i) => i.metadata.date)).toEqual(["2026-05-05", "2026-01-01", "2025-12-31", null]);
  });

  it("does not mutate the array it was given", () => {
    const input = [item("2026-01-01"), item("2026-05-05")];
    const snapshot = [...input];
    sortByDateDesc(input);
    expect(input).toEqual(snapshot);
  });
});

describe("formatDuration still behaves as it did inside lib/teach/schedule", () => {
  it("formats m:ss and h:mm:ss, and nothing at all for an unknown length", () => {
    expect(formatDuration(1448)).toBe("24:08");
    expect(formatDuration(3700)).toBe("1:01:40");
    expect(formatDuration(59.4)).toBe("0:59");
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(-5)).toBeNull();
    expect(formatDuration(Number.NaN)).toBeNull();
  });
});

describe("audioFileProblem", () => {
  it("refuses an unsupported mimetype before it refuses a size", () => {
    expect(audioFileProblem({ type: "video/mp4", size: 1 })).toBe("unsupportedType");
    expect(audioFileProblem({ type: "video/mp4", size: MAX_AUDIO_BYTES + 1 })).toBe("unsupportedType");
  });

  it("accepts a supported type at or below the cap", () => {
    expect(audioFileProblem({ type: "audio/mpeg", size: 1 })).toBeNull();
    expect(audioFileProblem({ type: "audio/mpeg", size: MAX_AUDIO_BYTES })).toBeNull();
    expect(audioFileProblem({ type: "audio/mpeg", size: MAX_AUDIO_BYTES + 1 })).toBe("tooLarge");
  });

  it("keeps the pre-extraction quirks: a raw type lookup and a bare upper bound", () => {
    // Browsers that report a codecs parameter were rejected before this
    // change and still are - normalizing here would be a behaviour change,
    // not an extraction.
    expect(audioFileProblem({ type: "audio/mpeg; codecs=mp3", size: 1 })).toBe("unsupportedType");
    // A zero-byte file still reaches the server that rejects it.
    expect(audioFileProblem({ type: "audio/mpeg", size: 0 })).toBeNull();
  });
});
