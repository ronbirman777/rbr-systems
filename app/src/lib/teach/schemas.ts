import { z } from "zod";
import { optionalFocalPointSchema } from "@/lib/media/focalPoint";
import { isoDateString as isoDate, calendarDateString, optText } from "@/lib/modules/fields";
import { audioItemFields, audioNoteField, libraryItemFieldsSchema, parseLibraryItem, readingMetadataSchema } from "@/lib/modules/library";
import { socialLinksSchema } from "@/lib/modules/socialLinks";
import { BRAND_PRESET_KEYS } from "@/lib/brand/presets";

/**
 * Time to Teach content model.
 *
 * Teach reuses the platform's generic tables instead of adding new ones:
 *  - module_items   (repeating content)  - TEACH_ITEM_KEYS + shared "customPages"
 *  - module_settings (singletons)         - TEACH_SETTINGS_KEYS
 *  - module_configs  (which Explore modules are on) - TEACH_EXPLORE_MODULES
 *  - tenants / brand_configs (name, slug, timezone, colours, hero image) as-is
 *
 * Every shape below is validated on write (Studio server actions) AND on read
 * (published snapshot + Studio load) - module_key and the jsonb columns are
 * deliberately free-form at the database level (see migration 0005), so this
 * file is the single source of truth for what they may contain.
 *
 * Everything under these keys is guest-facing by design: build_teach_payload()
 * (migration 0028) publishes it. Do not store private data here.
 */

export const TEACH_PRODUCT_TYPE = "teach" as const;

export const TEACH_ITEM_KEYS = [
  "teachClasses",
  "teachAvailability",
  "teachReadings",
  "teachAudio",
  "teachGallery",
  "teachCertificates",
  /** TASK 031: the retreats a teacher offers (presentation + registration link, no booking). */
  "teachRetreats",
] as const;
export type TeachItemKey = (typeof TEACH_ITEM_KEYS)[number];
/** Item keys the Teach Studio edits - its own plus the shared Custom Pages module. */
export type TeachEditableItemKey = TeachItemKey | "customPages";
export const TEACH_EDITABLE_ITEM_KEYS: readonly TeachEditableItemKey[] = [...TEACH_ITEM_KEYS, "customPages"];

export const TEACH_SETTINGS_KEYS = [
  "teachProfile",
  "teachStyle",
  "dailyInspiration",
  "teachAbout",
  "teachContact",
  "teachExplore",
] as const;
export type TeachSettingsKey = (typeof TEACH_SETTINGS_KEYS)[number];

/**
 * Private (never published) module_settings singleton: the teacher's explicit
 * opt-in to be listed on InnerDweS (future Teachers directory / homepage
 * promotion). Deliberately NOT in TEACH_SETTINGS_KEYS - build_teach_payload
 * never copies it into the public snapshot, and the default is always OFF.
 */
export const TEACH_DIRECTORY_KEY = "teachDirectory" as const;
export const teachDirectorySchema = z.object({
  listed: z.boolean().catch(false).default(false),
});
export type TeachDirectory = z.infer<typeof teachDirectorySchema>;

/** Explore modules a teacher can switch on (module_configs rows). */
export const TEACH_EXPLORE_MODULES = ["teachReadings", "teachAudio", "teachContact", "customPages", "teachRetreats"] as const;
export type TeachExploreModule = (typeof TEACH_EXPLORE_MODULES)[number];

/** Items whose storage folder may hold media (image_ref and/or audio). */
export const TEACH_MEDIA_ITEM_KEYS: readonly TeachEditableItemKey[] = [
  "teachClasses",
  "teachReadings",
  "teachAudio",
  "teachGallery",
  "teachCertificates",
  "teachRetreats",
  "customPages",
];

/** Audio files live in their own folder so the cover image's draft/published
 * sibling cleanup (copyDraftToPublished) can never touch them. */
export const TEACH_AUDIO_FOLDER_KEY = "teachAudioFile";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/**
 * `optText` and `isoDate` now live in lib/modules/fields.ts, so that Flow's
 * module schemas can validate a field exactly as Teach does without
 * importing from lib/teach. Re-exported because callers of this file ask
 * for them here.
 */
export { optText };
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
/** Temporal Instant string, e.g. "2025-10-14T04:30:00Z". */
const utcInstant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/);
/** UTC offset, e.g. "+03:00" / "-04:00" / "+05:30". */
const utcOffset = z.string().regex(/^[+-]\d{2}:\d{2}$/);
const mediaRef = z.string().max(400).nullable().default(null);

export const imageSlotSchema = z
  .object({
    imageRef: mediaRef,
    imagePosition: optionalFocalPointSchema,
  })
  .default({ imageRef: null, imagePosition: null });
export type ImageSlot = z.infer<typeof imageSlotSchema>;

// ---------------------------------------------------------------------------
// Settings (module_settings.data)
// ---------------------------------------------------------------------------

export const teachProfileSchema = z.object({
  teacherType: optText(80),
  greeting: optText(140),
  locationLine: optText(140),
  heroImagePosition: optionalFocalPointSchema,
  homeSections: z
    .object({
      quote: z.boolean().default(true),
      today: z.boolean().default(true),
      private: z.boolean().default(true),
      library: z.boolean().default(true),
      contact: z.boolean().default(false),
    })
    .default({ quote: true, today: true, private: true, library: true, contact: false }),
});
export type TeachProfile = z.infer<typeof teachProfileSchema>;

/** Pre-canonical preset keys. Kept so Spaces saved before the shared brand registry still parse. */
export const TEACH_LEGACY_PRESET_KEYS = [
  "calm",
  "earth",
  "sage",
  "sunrise",
  "mediterranean",
  "deepForest",
  "light",
  "sacred",
  "minimal",
] as const;
export const TEACH_PRESET_KEYS = [...TEACH_LEGACY_PRESET_KEYS, ...BRAND_PRESET_KEYS] as const;
export type TeachPresetKey = (typeof TEACH_PRESET_KEYS)[number];

export const TEACH_TYPOGRAPHY = ["classic", "editorial", "serene", "modern"] as const;
export const TEACH_CORNERS = ["soft", "rounded", "minimal"] as const;
export const TEACH_HERO_LAYOUTS = ["arch", "circle", "fullbleed"] as const;
export const TEACH_QUOTE_STYLES = ["editorial", "card", "line"] as const;
export const TEACH_OVERLAYS = ["none", "soft", "rich"] as const;
export const TEACH_SPACING = ["compact", "balanced", "airy"] as const;
export const TEACH_TEXTURES = ["none", "grain", "linen"] as const;
export const TEACH_DIVIDERS = ["none", "breath", "wave", "leaf"] as const;

export const teachStyleSchema = z.object({
  preset: z.enum([...TEACH_PRESET_KEYS, "custom"]).catch("calm").default("calm"),
  background: hexColor.nullable().catch(null).default(null),
  typography: z.enum(TEACH_TYPOGRAPHY).catch("classic").default("classic"),
  corners: z.enum(TEACH_CORNERS).catch("rounded").default("rounded"),
  heroLayout: z.enum(TEACH_HERO_LAYOUTS).catch("arch").default("arch"),
  quoteStyle: z.enum(TEACH_QUOTE_STYLES).catch("editorial").default("editorial"),
  overlay: z.enum(TEACH_OVERLAYS).catch("soft").default("soft"),
  spacing: z.enum(TEACH_SPACING).catch("balanced").default("balanced"),
  texture: z.enum(TEACH_TEXTURES).catch("none").default("none"),
  organicShapes: z.boolean().catch(true).default(true),
  dividers: z.enum(TEACH_DIVIDERS).catch("breath").default("breath"),
});
export type TeachStyle = z.infer<typeof teachStyleSchema>;

export const DAILY_INSPIRATION_MAX_QUOTES = 60;
export const DAILY_INSPIRATION_MAX_LENGTH = 160;

export const dailyInspirationSchema = z.object({
  quotes: z
    .array(z.string().trim().min(1).max(DAILY_INSPIRATION_MAX_LENGTH))
    .max(DAILY_INSPIRATION_MAX_QUOTES)
    .default([]),
  useFallback: z.boolean().default(true),
});
export type DailyInspiration = z.infer<typeof dailyInspirationSchema>;

export const teachAboutSchema = z.object({
  /** About Me navigation tab. Defaults ON (also for rows/snapshots saved before this field); only an explicit false hides it. */
  showTab: z.boolean().default(true),
  about: optText(4000),
  teachingSince: z.number().int().min(1940).max(2100).nullable().catch(null).default(null),
  philosophy: optText(700),
  styles: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  socialLinks: socialLinksSchema.catch([]).default([]),
  whatsapp: optText(40),
  email: optText(160),
  profile: imageSlotSchema,
});
export type TeachAbout = z.infer<typeof teachAboutSchema>;

export const CONTACT_METHODS = [
  "whatsapp",
  "phone",
  "email",
  "instagram",
  "facebook",
  "website",
  "telegram",
  "bookingUrl",
] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

export const teachContactSchema = z.object({
  title: optText(80),
  intro: optText(500),
  primary: z.enum(CONTACT_METHODS).nullable().catch(null).default(null),
  buttonLabel: optText(60),
  methods: z
    .object({
      whatsapp: optText(40),
      phone: optText(40),
      email: optText(160),
      instagram: optText(200),
      facebook: optText(300),
      website: optText(300),
      telegram: optText(200),
      bookingUrl: optText(300),
    })
    .default({
      whatsapp: null,
      phone: null,
      email: null,
      instagram: null,
      facebook: null,
      website: null,
      telegram: null,
      bookingUrl: null,
    }),
  enabled: z.array(z.enum(CONTACT_METHODS)).catch([]).default([]),
  locationName: optText(140),
  address: optText(300),
  mapUrl: optText(500),
  cover: imageSlotSchema,
});
export type TeachContact = z.infer<typeof teachContactSchema>;

export const exploreCardSchema = z.object({
  title: optText(60),
  subtitle: optText(90),
  imageRef: mediaRef,
  imagePosition: optionalFocalPointSchema,
  fallbackColor: hexColor.nullable().catch(null).default(null),
});
export type ExploreCard = z.infer<typeof exploreCardSchema>;

export const teachExploreSchema = z.object({
  cards: z
    .object({
      teachReadings: exploreCardSchema.optional(),
      teachAudio: exploreCardSchema.optional(),
      teachContact: exploreCardSchema.optional(),
    })
    .default({}),
});
export type TeachExplore = z.infer<typeof teachExploreSchema>;

export const TEACH_SETTINGS_SCHEMAS = {
  teachProfile: teachProfileSchema,
  teachStyle: teachStyleSchema,
  dailyInspiration: dailyInspirationSchema,
  teachAbout: teachAboutSchema,
  teachContact: teachContactSchema,
  teachExplore: teachExploreSchema,
} as const;

export type TeachSettings = {
  teachProfile: TeachProfile;
  teachStyle: TeachStyle;
  dailyInspiration: DailyInspiration;
  teachAbout: TeachAbout;
  teachContact: TeachContact;
  teachExplore: TeachExplore;
};

/** Parses one stored settings blob, falling back to that key's defaults. */
export function parseTeachSetting<K extends TeachSettingsKey>(key: K, raw: unknown): TeachSettings[K] {
  const schema = TEACH_SETTINGS_SCHEMAS[key] as unknown as z.ZodType<TeachSettings[K]>;
  const parsed = schema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  return schema.parse({});
}

export function defaultTeachSettings(): TeachSettings {
  return {
    teachProfile: parseTeachSetting("teachProfile", {}),
    teachStyle: parseTeachSetting("teachStyle", {}),
    dailyInspiration: parseTeachSetting("dailyInspiration", {}),
    teachAbout: parseTeachSetting("teachAbout", {}),
    teachContact: parseTeachSetting("teachContact", {}),
    teachExplore: parseTeachSetting("teachExplore", {}),
  };
}

// ---------------------------------------------------------------------------
// Items (module_items: title / subtitle / description / image_ref /
// external_link / metadata)
// ---------------------------------------------------------------------------

export const REGISTRATION_METHODS = [
  "whatsapp",
  "website",
  "instagram",
  "facebook",
  "email",
  "bookingLink",
  "venueLink",
] as const;
export type RegistrationMethod = (typeof REGISTRATION_METHODS)[number];

export const venueSchema = z
  .object({
    enabled: z.boolean().default(false),
    name: optText(120),
    instagram: optText(200),
    facebook: optText(300),
    website: optText(300),
    email: optText(160),
    bookingUrl: optText(500),
    mapUrl: optText(500),
  })
  .default({
    enabled: false,
    name: null,
    instagram: null,
    facebook: null,
    website: null,
    email: null,
    bookingUrl: null,
    mapUrl: null,
  });
export type Venue = z.infer<typeof venueSchema>;

export const registrationSchema = z
  .object({
    method: z.enum(REGISTRATION_METHODS).nullable().catch(null).default(null),
    value: optText(500),
    buttonLabel: optText(60),
    whatsappTemplate: optText(600),
  })
  .default({ method: null, value: null, buttonLabel: null, whatsappTemplate: null });
export type Registration = z.infer<typeof registrationSchema>;

// ---------------------------------------------------------------------------
// Recurring classes (src/lib/teach/recurrence.ts)
//
// A recurring class is ONE series row: the class's own fields are the
// series definition (its startDate/startTime is the series start, DTSTART),
// plus a structured recurrence rule and per-occurrence exceptions.
// Occurrences are never stored - they are expanded on demand for a date
// window. The rule is an RFC 5545 RRULE-compatible subset (FREQ, INTERVAL,
// BYDAY, UNTIL, COUNT; WKST=MO) kept as JSON so the Studio never edits raw
// RRULE strings; see toRRule() for the exact mapping.
// ---------------------------------------------------------------------------

export const RECURRENCE_FREQS = ["daily", "weekly", "monthly"] as const;
export type RecurrenceFreq = (typeof RECURRENCE_FREQS)[number];
export const RECURRENCE_MAX_INTERVAL = 99;
export const RECURRENCE_MAX_COUNT = 730;
export const RECURRENCE_MAX_EXCEPTIONS = 400;

export const recurrenceEndSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("never") }),
  /** Inclusive local date (in the class's zone). */
  z.object({ type: z.literal("until"), until: isoDate }),
  z.object({ type: z.literal("count"), count: z.number().int().min(1).max(RECURRENCE_MAX_COUNT) }),
]);
export type RecurrenceEnd = z.infer<typeof recurrenceEndSchema>;

// Strict on purpose: a value that is present but wrong makes the WHOLE rule
// invalid (see storedOrInvalid) instead of being quietly "fixed". Only
// missing fields take defaults.
export const recurrenceSchema = z.object({
  freq: z.enum(RECURRENCE_FREQS),
  interval: z.number().int().min(1).max(RECURRENCE_MAX_INTERVAL).default(1),
  /** Weekly only. 0 = Sunday ... 6 = Saturday. Empty = the start date's weekday. */
  byWeekday: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .default([])
    .transform((d) => [...new Set(d)].sort((a, b) => a - b)),
  end: recurrenceEndSchema.default({ type: "never" }),
});
export type Recurrence = z.infer<typeof recurrenceSchema>;

/**
 * One occurrence's exception, keyed by that occurrence's ORIGINAL local
 * start date (iCalendar RECURRENCE-ID semantics), so it survives the
 * occurrence being moved. Unset fields inherit from the series.
 */
export const occurrenceExceptionSchema = z.object({
  cancelled: z.boolean().default(false),
  startDate: isoDate.nullable().default(null),
  startTime: hhmm.nullable().default(null),
  endTime: hhmm.nullable().default(null),
  location: optText(200),
});
export type OccurrenceException = z.infer<typeof occurrenceExceptionSchema>;

/** Present only on generated occurrences (never stored; reset on save). */
export const occurrenceInfoSchema = z.object({
  seriesId: z.string().max(80),
  originalDate: isoDate,
});
export type OccurrenceInfo = z.infer<typeof occurrenceInfoSchema>;

/**
 * Stored recurrence data that is present but malformed. It is never
 * reinterpreted (e.g. as a one-off class): the Guest App does not show the
 * series, the Studio flags it for repair, and saves write `raw` back
 * unchanged until the teacher repairs it explicitly.
 */
export type InvalidStored = { status: "invalid"; raw: unknown };
export function isInvalidStored(v: unknown): v is InvalidStored {
  return Boolean(v) && typeof v === "object" && (v as { status?: unknown }).status === "invalid" && "raw" in (v as object);
}
/** Absent/null -> `empty`; valid -> parsed; anything else -> InvalidStored (raw kept verbatim). */
function storedOrInvalid<S extends z.ZodTypeAny, E>(schema: S, empty: E) {
  return z.unknown().optional().transform((v): z.output<S> | E | InvalidStored => {
    if (v === undefined || v === null) return empty;
    // A marker coming back from the Studio unchanged: re-check its raw value (no nesting).
    const raw = isInvalidStored(v) ? v.raw : v;
    if (raw === undefined || raw === null) return empty;
    const r = schema.safeParse(raw);
    return r.success ? r.data : { status: "invalid", raw };
  });
}
export const exceptionsSchema = z
  .record(isoDate, occurrenceExceptionSchema)
  .refine((e) => Object.keys(e).length <= RECURRENCE_MAX_EXCEPTIONS, "Too many changed dates.");

export const classMetadataSchema = z.object({
  startDate: isoDate,
  startTime: hhmm,
  endDate: isoDate.nullable().catch(null).default(null),
  endTime: hhmm.nullable().catch(null).default(null),
  /** Explicit IANA zone (time model v1 always persists one; null only on
   * rows saved before the model existed, read as the Space's zone). */
  timezone: optText(64),
  location: optText(200),
  price: optText(120),
  maxParticipants: z.number().int().min(1).max(10000).nullable().catch(null).default(null),
  howToRegister: optText(1200),
  howToGetThere: optText(1200),
  registration: registrationSchema,
  venue: venueSchema,
  imagePosition: optionalFocalPointSchema,
  // --- Canonical time (time model v1, src/lib/teach/classTime.ts) ---
  // Derived on the server from the local fields above on every save; never
  // edited directly. Absent (null) on rows saved before the model existed.
  startsAt: utcInstant.nullable().catch(null).default(null),
  endsAt: utcInstant.nullable().catch(null).default(null),
  startOffset: utcOffset.nullable().catch(null).default(null),
  endOffset: utcOffset.nullable().catch(null).default(null),
  /** true = the local start time happened twice (DST fall-back); the earlier one was used. */
  startAmbiguous: z.boolean().catch(false).default(false),
  endAmbiguous: z.boolean().catch(false).default(false),
  timeModelVersion: z.number().int().nullable().catch(null).default(null),
  // --- Recurrence (null = one-off class, exactly as before) ---
  // Absent (every class saved before recurrence existed) -> null, exactly as
  // before. Present but malformed -> InvalidStored, never a silent one-off.
  recurrence: storedOrInvalid(recurrenceSchema, null),
  exceptions: storedOrInvalid(exceptionsSchema, {} as Record<string, OccurrenceException>),
  occurrence: occurrenceInfoSchema.nullable().catch(null).default(null),
});
export type ClassMetadata = z.infer<typeof classMetadataSchema>;

export const AVAILABILITY_METHODS = ["whatsapp", "email", "bookingLink", "website"] as const;
export type AvailabilityMethod = (typeof AVAILABILITY_METHODS)[number];

export const availabilityMetadataSchema = z.object({
  repeat: z.enum(["weekly", "once"]).catch("weekly").default("weekly"),
  /** 0 = Sunday ... 6 = Saturday (weekly only). */
  weekday: z.number().int().min(0).max(6).nullable().catch(null).default(null),
  /** once only */
  date: isoDate.nullable().catch(null).default(null),
  from: hhmm,
  to: hhmm,
  methods: z.array(z.enum(AVAILABILITY_METHODS)).catch([]).default([]),
  bookingUrl: optText(500),
  website: optText(300),
  whatsappTemplate: optText(600),
  enabled: z.boolean().default(true),
});
export type AvailabilityMetadata = z.infer<typeof availabilityMetadataSchema>;

/**
 * Readings are stored identically in both products, so the schema itself
 * is shared (lib/modules/library.ts) and only the module_key differs -
 * Teach writes `teachReadings`, Flow writes `readings`.
 */
export { readingMetadataSchema };
export type ReadingMetadata = z.infer<typeof readingMetadataSchema>;

export { AUDIO_ALLOWED_TYPES, AUDIO_MIME_BY_EXTENSION, MAX_AUDIO_BYTES } from "@/lib/media/audio";

/**
 * Assembled from the shared audio fields rather than re-declaring them,
 * with Teach's own name for the note: `teacherNote` is live data in
 * module_items and in every published snapshot, so it keeps its key.
 * Flow's equivalent will be `note`; both are read by audioNote().
 */
export const audioMetadataSchema = z.object({
  audioRef: audioItemFields.audioRef,
  durationSeconds: audioItemFields.durationSeconds,
  category: audioItemFields.category,
  teacherNote: audioNoteField,
  imagePosition: audioItemFields.imagePosition,
});
export type AudioMetadata = z.infer<typeof audioMetadataSchema>;

export const imageOnlyMetadataSchema = z.object({
  imagePosition: optionalFocalPointSchema,
});

export const certificateMetadataSchema = z.object({
  year: optText(12),
  imagePosition: optionalFocalPointSchema,
});
export type CertificateMetadata = z.infer<typeof certificateMetadataSchema>;

export const customPageMetadataSchema = z.object({
  enabled: z.boolean().default(true),
  imagePosition: optionalFocalPointSchema,
  buttonLabel: optText(60),
  buttonUrl: optText(500),
  fallbackColor: hexColor.nullable().catch(null).default(null),
});
export type CustomPageMetadata = z.infer<typeof customPageMetadataSchema>;

/**
 * TASK 031 - one retreat a teacher offers ("My Retreats").
 *
 * module_items: title = retreat name, description = the short description
 * (required, enforced on save - the shared envelope keeps it optional so a
 * half-written draft still round-trips), image_ref = cover. Everything else
 * is optional on purpose: a retreat may have no dates, no price, and no
 * InnerDweS Flow Space behind it.
 *
 * Dates are plain "YYYY-MM-DD" calendar days, never instants, so no viewer
 * timezone can shift them. The money fields are informational text only:
 * there is no checkout and nothing here is billing.
 *
 * Every field is tolerant on READ (`.catch`), so one bad value drops itself
 * rather than the whole retreat; the strict rules (end >= start, price needs
 * a currency, a Flow link must be public) live in validateRetreatMetadata()
 * and are enforced on SAVE.
 */
export const retreatMetadataSchema = z.object({
  enabled: z.boolean().default(true),
  location: optText(160),
  startDate: calendarDateString.nullable().catch(null).default(null),
  endDate: calendarDateString.nullable().catch(null).default(null),
  /** Free text, e.g. "7 days" - the teacher's own words, never translated. */
  durationLabel: optText(60),
  price: z.number().finite().min(0).max(1_000_000_000).nullable().catch(null).default(null),
  /** ISO 4217 style code, e.g. "THB". Any three capitals: the list of codes is not ours to police. */
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .nullable()
    .catch(null)
    .default(null),
  /** External registration, same shape as a class's (method + value + optional button label). */
  registration: registrationSchema,
  /**
   * Canonical URL of a PUBLIC InnerDweS Flow Guest App for this retreat.
   * Validated on save (lib/teach/flowLink.ts) and re-checked when the guest
   * page renders, so a Space that later goes private is never linked.
   */
  flowGuestUrl: optText(300),
  imagePosition: optionalFocalPointSchema,
});
export type RetreatMetadata = z.infer<typeof retreatMetadataSchema>;

export const TEACH_ITEM_METADATA_SCHEMAS = {
  teachClasses: classMetadataSchema,
  teachAvailability: availabilityMetadataSchema,
  teachReadings: readingMetadataSchema,
  teachAudio: audioMetadataSchema,
  teachGallery: imageOnlyMetadataSchema,
  teachCertificates: certificateMetadataSchema,
  teachRetreats: retreatMetadataSchema,
  customPages: customPageMetadataSchema,
} as const;

export type TeachItemMetadata = {
  teachClasses: ClassMetadata;
  teachAvailability: AvailabilityMetadata;
  teachReadings: ReadingMetadata;
  teachAudio: AudioMetadata;
  teachGallery: z.infer<typeof imageOnlyMetadataSchema>;
  teachCertificates: CertificateMetadata;
  teachRetreats: RetreatMetadata;
  customPages: CustomPageMetadata;
};

/** Title rules differ: gallery captions and availability labels may be empty. */
const TITLE_REQUIRED: Record<TeachEditableItemKey, boolean> = {
  teachClasses: true,
  teachAvailability: false,
  teachReadings: true,
  teachAudio: true,
  teachGallery: false,
  teachCertificates: true,
  teachRetreats: true,
  customPages: true,
};

/** One module_items row as the Teach Studio and Guest App see it. */
export type TeachItem<K extends TeachEditableItemKey = TeachEditableItemKey> = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  imageRef: string | null;
  externalLink: string | null;
  metadata: TeachItemMetadata[K];
};

/** Studio-side: plus a resolved display URL (signed URL, never persisted). */
export type EditableTeachItem<K extends TeachEditableItemKey = TeachEditableItemKey> = TeachItem<K> & {
  imageUrl: string | null;
  /** Studio-only resolved audio URL for teachAudio. */
  audioUrl?: string | null;
};

/**
 * The item envelope validator and its tolerant parse now live in
 * lib/modules/library.ts, so Flow's Readings and Audio read the same
 * stored shape through the same code rather than a second parser that
 * would drift. Only the metadata schema and the title rule vary per key.
 */
export function teachItemFieldsSchema<K extends TeachEditableItemKey>(key: K) {
  return libraryItemFieldsSchema(
    TEACH_ITEM_METADATA_SCHEMAS[key] as unknown as z.ZodType<TeachItemMetadata[K]>,
    TITLE_REQUIRED[key]
  );
}

/** Tolerant parse of one stored/published row; returns null if unusable. */
export function parseTeachItem<K extends TeachEditableItemKey>(key: K, raw: unknown): TeachItem<K> | null {
  return parseLibraryItem(
    raw,
    TEACH_ITEM_METADATA_SCHEMAS[key] as unknown as z.ZodType<TeachItemMetadata[K]>,
    TITLE_REQUIRED[key]
  ) as TeachItem<K> | null;
}

export function parseTeachItems<K extends TeachEditableItemKey>(key: K, raw: unknown): TeachItem<K>[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => parseTeachItem(key, r)).filter((x): x is TeachItem<K> => x !== null);
}

/**
 * Blank metadata for a newly added item (Studio "Add"). New classes get an
 * explicit time zone (the Space's) so the stored model never relies on an
 * implicit default.
 */
export function blankTeachMetadata<K extends TeachEditableItemKey>(key: K, todayIso: string, timezone: string | null = null): TeachItemMetadata[K] {
  const base: Record<TeachEditableItemKey, unknown> = {
    teachClasses: { startDate: todayIso, startTime: "09:00", endTime: "10:00", timezone },
    teachAvailability: { repeat: "weekly", weekday: 2, from: "10:00", to: "13:00", methods: ["whatsapp"] },
    teachReadings: { date: todayIso },
    teachAudio: {},
    teachGallery: {},
    teachCertificates: {},
    teachRetreats: { enabled: true },
    customPages: { enabled: true },
  };
  return (TEACH_ITEM_METADATA_SCHEMAS[key] as unknown as z.ZodType<TeachItemMetadata[K]>).parse(base[key]);
}

/** Every media reference an item or settings object points at. */
export function collectTeachMediaRefs(value: unknown): string[] {
  const refs: string[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if ((k === "imageRef" || k === "audioRef") && typeof v === "string") refs.push(v);
        else walk(v);
      }
    }
  };
  walk(value);
  return refs;
}

/**
 * A stored DRAFT media ref must live under this tenant's own storage prefix.
 * Accepts the versioned shape `{tenant}/{module}/{item}/{uploadId}/draft.<ext>`
 * (TASK 023; the only shape new uploads produce) and the legacy unversioned
 * `{tenant}/{module}/{item}/draft.<ext>`. Never a published object.
 */
export function isTenantMediaRef(tenantId: string, ref: string): boolean {
  return (
    ref.startsWith(`${tenantId}/`) &&
    !ref.includes("..") &&
    /^[0-9a-f-]{36}\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+(\/[0-9a-f-]{36})?\/draft\.[a-z0-9]+$/.test(ref)
  );
}
