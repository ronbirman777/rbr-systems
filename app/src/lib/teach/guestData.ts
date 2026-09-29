import type { BrandConfig, PaletteKey, AtmosphereKey } from "@/lib/theme/tokens";
import { publishedThemeSchema, brandMediaSchema, DEFAULT_PUBLISHED_THEME } from "@/lib/modules/publishedTheme";
import { publicMediaUrl } from "@/lib/media/path";
import { todayInTimezone, currentTimeInTimezone, DEFAULT_TIMEZONE } from "@/lib/timezone";
import {
  collectTeachMediaRefs,
  parseTeachItems,
  parseTeachSetting,
  TEACH_EXPLORE_MODULES,
  type TeachExploreModule,
  type TeachItem,
  type TeachSettings,
} from "./schemas";

/**
 * Everything the Time to Teach Guest App renders. Built from the published
 * snapshot for real guests (parsePublishedTeachSpace) and from live Studio
 * state for the draft preview - one renderer, two sources, so the preview
 * can't drift from what guests actually get.
 *
 * Media is resolved through `mediaUrls` (ref -> display URL): /api/media/...
 * for guests, short-lived signed URLs in the Studio. Refs never become URLs
 * anywhere else.
 */
export type TeachGuestData = {
  teacherName: string;
  timezone: string;
  todayIso: string;
  nowTime: string;
  brand: BrandConfig;
  heroImageRef: string | null;
  settings: TeachSettings;
  classes: TeachItem<"teachClasses">[];
  availability: TeachItem<"teachAvailability">[];
  readings: TeachItem<"teachReadings">[];
  audio: TeachItem<"teachAudio">[];
  gallery: TeachItem<"teachGallery">[];
  certificates: TeachItem<"teachCertificates">[];
  customPages: TeachItem<"customPages">[];
  enabledExplore: TeachExploreModule[];
  mediaUrls: Record<string, string>;
};

export type PublishedTeachRow = {
  name: string;
  theme: unknown;
  timezone: string | null;
  enabled_modules: string[] | null;
  modules: unknown;
};

export function brandFromPublishedTheme(name: string, theme: unknown): BrandConfig {
  const parsed = publishedThemeSchema.safeParse(theme);
  const t = parsed.success ? parsed.data : DEFAULT_PUBLISHED_THEME;
  return {
    name: name || "Teacher",
    logoRef: null,
    palette: t.palette as PaletteKey,
    customPrimary: t.customPrimary ?? null,
    customSecondary: t.customSecondary ?? null,
    customNavigation: t.customNavigation ?? null,
    customText: t.customText ?? null,
    atmosphere: t.atmosphere as AtmosphereKey,
    imageStyle: t.imageStyle ?? "rounded",
  };
}

export function enabledExploreFrom(enabled: readonly string[] | null | undefined): TeachExploreModule[] {
  const set = new Set(enabled ?? []);
  return TEACH_EXPLORE_MODULES.filter((k) => set.has(k));
}

export function parsePublishedTeachSpace(space: PublishedTeachRow): TeachGuestData {
  const modules = (space.modules ?? {}) as Record<string, unknown>;
  const teach = (modules.teach ?? {}) as { settings?: Record<string, unknown>; items?: Record<string, unknown> };
  const settingsRaw = teach.settings ?? {};
  const itemsRaw = teach.items ?? {};

  const settings: TeachSettings = {
    teachProfile: parseTeachSetting("teachProfile", settingsRaw.teachProfile),
    teachStyle: parseTeachSetting("teachStyle", settingsRaw.teachStyle),
    dailyInspiration: parseTeachSetting("dailyInspiration", settingsRaw.dailyInspiration),
    teachAbout: parseTeachSetting("teachAbout", settingsRaw.teachAbout),
    teachContact: parseTeachSetting("teachContact", settingsRaw.teachContact),
    teachExplore: parseTeachSetting("teachExplore", settingsRaw.teachExplore),
  };

  const brandMedia = brandMediaSchema.safeParse(modules.brand);
  const heroImageRef = brandMedia.success ? (brandMedia.data.hero?.imageRef ?? null) : null;

  const timezone = space.timezone || DEFAULT_TIMEZONE;

  const data: Omit<TeachGuestData, "mediaUrls"> = {
    teacherName: space.name,
    timezone,
    todayIso: todayInTimezone(timezone),
    nowTime: currentTimeInTimezone(timezone),
    brand: brandFromPublishedTheme(space.name, space.theme),
    heroImageRef,
    settings,
    classes: parseTeachItems("teachClasses", itemsRaw.teachClasses),
    availability: parseTeachItems("teachAvailability", itemsRaw.teachAvailability).filter((a) => a.metadata.enabled),
    readings: parseTeachItems("teachReadings", itemsRaw.teachReadings),
    audio: parseTeachItems("teachAudio", itemsRaw.teachAudio),
    gallery: parseTeachItems("teachGallery", itemsRaw.teachGallery).filter((g) => g.imageRef),
    certificates: parseTeachItems("teachCertificates", itemsRaw.teachCertificates),
    customPages: parseTeachItems("customPages", itemsRaw.customPages).filter((p) => p.metadata.enabled),
    enabledExplore: enabledExploreFrom(space.enabled_modules),
  };

  const mediaUrls: Record<string, string> = {};
  for (const ref of [heroImageRef, ...collectTeachMediaRefs({ settings, items: data })]) {
    if (ref) mediaUrls[ref] = publicMediaUrl(ref);
  }
  return { ...data, mediaUrls };
}
