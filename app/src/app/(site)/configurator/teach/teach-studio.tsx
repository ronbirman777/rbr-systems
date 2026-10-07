"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};
import { InnerDweSMark } from "@/components/brand/wordmark";
import { TeachGuestApp } from "@/components/teach/teach-guest-app";
import { resolveListUpdate, resolvePatch, type ListUpdate, type Patch } from "./studioStateUpdates";
import { todayInTimezone, currentTimeInTimezone } from "@/lib/timezone";
import type { TeachGuestData } from "@/lib/teach/guestData";
import type { Locale } from "@/lib/i18n";
import { expandClassesForWindow, guestWindow } from "@/lib/teach/recurrence";
import type {
  EditableTeachItem,
  TeachEditableItemKey,
  TeachExploreModule,
  TeachItem,
  TeachSettings,
  TeachSettingsKey,
} from "@/lib/teach/schemas";
import { uploadModuleItemPhoto, removeModuleItemPhoto, uploadBrandImage, removeBrandImage } from "@/app/(site)/configurator/retreat/actions";
import { useSpaceLocale } from "@/lib/studio/useSpaceLocale";
import { createTranslator, type TranslationKey } from "@/lib/i18n";
import {
  saveTeachBrandColors,
  saveTeachIdentity,
  saveTeachItems,
  saveTeachModules,
  saveTeachSettings,
  uploadTeachSettingsImage,
  deleteTeachItem,
  prepareTeachAudioUpload,
  attachTeachAudio,
  detachTeachAudio,
} from "./actions";
import {
  AboutSection,
  AudioSection,
  BrandSection,
  ContactSection,
  CustomPagesSection,
  HomeSection,
  IdentitySection,
  ModulesSection,
  PublishSection,
  ReadingsSection,
  ScheduleSection,
} from "./teach-studio-sections";

export type TeachStudioInitial = {
  tenantId: string;
  name: string;
  slug: string | null;
  timezone: string;
  colors: { primary: string; accent: string; navigation: string | null; text: string | null };
  heroImageRef: string | null;
  settings: TeachSettings;
  items: { [K in TeachEditableItemKey]: TeachItem<K>[] };
  enabledExplore: TeachExploreModule[];
  publishedAt: string | null;
  directoryListed: boolean;
  locale: Locale;
  canPublish: boolean;
  accessLabel: string;
  customPagesLimit: number;
  mediaUrls: Record<string, string>;
  initialSection: string | null;
};

export type SectionKey =
  | "identity"
  | "brand"
  | "home"
  | "schedule"
  | "about"
  | "modules"
  | "readings"
  | "audio"
  | "contact"
  | "pages"
  | "publish";

/** Translation keys, resolved per render in the Space language. */
type TeachKey = TranslationKey<"teach">;
const NAV: { groupKey: TeachKey; items: { key: SectionKey; labelKey: TeachKey }[] }[] = [
  {
    groupKey: "identityEyebrow",
    items: [
      { key: "identity", labelKey: "sectionIdentity" },
      { key: "brand", labelKey: "sectionBrand" },
      { key: "home", labelKey: "sectionHome" },
    ],
  },
  {
    groupKey: "teaching",
    items: [
      { key: "schedule", labelKey: "sectionSchedule" },
      { key: "about", labelKey: "sectionAboutMe" },
    ],
  },
  {
    groupKey: "exploreLibrary",
    items: [
      { key: "modules", labelKey: "sectionModules" },
      { key: "readings", labelKey: "myReadings" },
      { key: "audio", labelKey: "exploreAudio" },
      { key: "contact", labelKey: "howToContactMeTitle" },
      { key: "pages", labelKey: "customPagesTitle" },
    ],
  },
];
const ALL_SECTIONS: SectionKey[] = [...NAV.flatMap((g) => g.items.map((i) => i.key)), "publish"];

const PREVIEW_TAB: Record<SectionKey, "home" | "schedule" | "about" | "explore"> = {
  identity: "home",
  brand: "home",
  home: "home",
  schedule: "schedule",
  about: "about",
  modules: "explore",
  readings: "explore",
  audio: "explore",
  contact: "explore",
  pages: "explore",
  publish: "home",
};

type ItemsState = { [K in TeachEditableItemKey]: EditableTeachItem<K>[] };

/** Everything a section editor needs - passed as one object. */
export type StudioApi = {
  tenantId: string;
  /** The Space's system language. On the API rather than threaded through
   * every section, because every section renders its own labels. */
  locale: Locale;
  /** Switches it live - the language card calls this (TASK 029). */
  setLocale: (next: Locale) => void;
  todayIso: string;
  name: string;
  setName: (v: string) => void;
  slug: string | null;
  setSlug: (v: string | null) => void;
  timezone: string;
  setTimezone: (v: string) => void;
  colors: TeachStudioInitial["colors"];
  setColors: (c: TeachStudioInitial["colors"]) => void;
  heroImageRef: string | null;
  settings: TeachSettings;
  /** A function patch is computed from the LATEST slice, so async completions never write render-time snapshots. */
  updateSetting: <K extends TeachSettingsKey>(key: K, patch: Patch<TeachSettings[K]>, section: SectionKey) => void;
  items: ItemsState;
  /** A function update receives the LATEST list; use it from anything that runs after an await. */
  setItems: <K extends TeachEditableItemKey>(key: K, next: ListUpdate<EditableTeachItem<K>>, section: SectionKey) => void;
  removeItem: <K extends TeachEditableItemKey>(key: K, id: string) => Promise<string | null>;
  enabledExplore: TeachExploreModule[];
  setEnabledExplore: (v: TeachExploreModule[]) => void;
  mediaUrl: (ref: string | null | undefined) => string | null;
  setMediaUrl: (ref: string, url: string | null) => void;
  uploadHero: (file: File) => Promise<string | null>;
  removeHero: () => Promise<string | null>;
  uploadItemImage: <K extends TeachEditableItemKey>(key: K, item: EditableTeachItem<K>, index: number, file: File) => Promise<{ ref: string | null; error: string | null }>;
  removeItemImage: <K extends TeachEditableItemKey>(key: K, item: EditableTeachItem<K>) => Promise<string | null>;
  uploadSettingsImage: (settingsKey: "teachAbout" | "teachContact" | "teachExplore", slot: string, file: File) => Promise<{ ref: string | null; error: string | null }>;
  prepareAudioUpload: (item: EditableTeachItem<"teachAudio">, index: number, mimeType: string, sizeBytes: number) => Promise<{ error: string | null; path: string | null }>;
  attachAudio: (itemId: string, ref: string, durationSeconds: number | null) => Promise<string | null>;
  detachAudio: (itemId: string) => Promise<string | null>;
  markDirty: (section: SectionKey) => void;
  isDirty: (section: SectionKey) => boolean;
  save: (section: SectionKey) => Promise<string | null>;
  saving: SectionKey | null;
  customPagesLimit: number;
  publishedAt: string | null;
  directoryListed: boolean;
  setPublishedAt: (v: string | null) => void;
  canPublish: boolean;
  accessLabel: string;
  saveAll: () => Promise<string | null>;
  goTo: (s: SectionKey) => void;
};

export function TeachStudio({ initial }: { initial: TeachStudioInitial }) {
  const tenantId = initial.tenantId;
  /**
   * The Space's system language, LIVE - `spaceLocale` is only the
   * starting value. Before this, saving a language left the Studio shell
   * and the Live Draft Preview in the previous one until a reload. See
   * lib/studio/useSpaceLocale.ts for the whole story.
   */
  const { locale: spaceLocale, dir: spaceDir, setLocale: setSpaceLocale } = useSpaceLocale(initial.locale);
  // The Studio renders in the Space's own language, so a teacher edits in
  // the same language their guests read.
  const { t } = createTranslator(spaceLocale);
  const [section, setSection] = useState<SectionKey>(
    ALL_SECTIONS.includes(initial.initialSection as SectionKey) ? (initial.initialSection as SectionKey) : "identity"
  );
  const [name, setNameState] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  const [timezone, setTimezoneState] = useState(initial.timezone);
  const [colors, setColorsState] = useState(initial.colors);
  const [heroImageRef, setHeroImageRef] = useState(initial.heroImageRef);
  const [settings, setSettings] = useState<TeachSettings>(initial.settings);
  const [items, setItemsState] = useState<ItemsState>(() => {
    const out = {} as ItemsState;
    for (const k of Object.keys(initial.items) as TeachEditableItemKey[]) {
      (out as Record<string, unknown>)[k] = (initial.items[k] as TeachItem[]).map((it) => ({
        ...it,
        imageUrl: it.imageRef ? (initial.mediaUrls[it.imageRef] ?? null) : null,
      }));
    }
    return out;
  });
  const [enabledExplore, setEnabledExploreState] = useState(initial.enabledExplore);
  const [mediaUrls, setMediaUrls] = useState(initial.mediaUrls);
  const [dirty, setDirty] = useState<Set<SectionKey>>(new Set());
  const [saving, setSaving] = useState<SectionKey | null>(null);
  const [publishedAt, setPublishedAt] = useState(initial.publishedAt);
  const [toast, setToast] = useState<{ kind: "ok" | "error" | "warn"; text: string } | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);
  // Preview "now" is only computed on the client (never during SSR) so
  // server and client markup agree.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
  const mainRef = useRef<HTMLDivElement>(null);


  const markDirty = useCallback((s: SectionKey) => setDirty((d) => (d.has(s) ? d : new Set(d).add(s))), []);
  const clean = (s: SectionKey) =>
    setDirty((d) => {
      const n = new Set(d);
      n.delete(s);
      return n;
    });

  useEffect(() => {
    if (dirty.size === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty.size]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.kind === "warn" ? 9000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const setMediaUrl = useCallback((ref: string, url: string | null) => {
    setMediaUrls((m) => {
      const n = { ...m };
      if (url) n[ref] = url;
      else delete n[ref];
      return n;
    });
  }, []);
  const mediaUrl = useCallback((ref: string | null | undefined) => (ref ? (mediaUrls[ref] ?? null) : null), [mediaUrls]);

  const updateSetting: StudioApi["updateSetting"] = (key, patch, s) => {
    setSettings((prev) => ({ ...prev, [key]: { ...prev[key], ...resolvePatch(patch, prev[key]) } }));
    markDirty(s);
  };
  const setItems: StudioApi["setItems"] = (key, next, s) => {
    setItemsState((prev) => ({ ...prev, [key]: resolveListUpdate(next, prev[key]) }));
    markDirty(s);
  };

  // ---------------------------------------------------------------------
  // Saving: each section owns exactly the data it edits.
  // ---------------------------------------------------------------------
  const stripItems = <K extends TeachEditableItemKey>(list: EditableTeachItem<K>[]) =>
    list.map((it) => ({
      id: it.id,
      title: it.title,
      subtitle: it.subtitle,
      description: it.description,
      externalLink: it.externalLink,
      metadata: it.metadata,
    }));

  async function saveSection(s: SectionKey, warnings: string[]): Promise<string | null> {
    const run = async (...ops: Promise<{ error: string | null; warnings?: string[] }>[]) => {
      const results = await Promise.all(ops);
      for (const r of results) warnings.push(...(r.warnings ?? []));
      return results.find((r) => r.error)?.error ?? null;
    };
    switch (s) {
      case "identity":
        return run(
          saveTeachIdentity(tenantId, { name, timezone }, spaceLocale),
          saveTeachSettings(tenantId, "teachProfile", settings.teachProfile, spaceLocale),
          saveTeachSettings(tenantId, "dailyInspiration", settings.dailyInspiration, spaceLocale)
        );
      case "brand":
        return run(saveTeachBrandColors(tenantId, colors, spaceLocale), saveTeachSettings(tenantId, "teachStyle", settings.teachStyle, spaceLocale));
      case "home":
        return run(saveTeachSettings(tenantId, "teachProfile", settings.teachProfile, spaceLocale));
      case "schedule":
        return run(saveTeachItems(tenantId, "teachClasses", stripItems(items.teachClasses), spaceLocale), saveTeachItems(tenantId, "teachAvailability", stripItems(items.teachAvailability), spaceLocale));
      case "about":
        return run(
          saveTeachSettings(tenantId, "teachAbout", settings.teachAbout, spaceLocale),
          saveTeachItems(tenantId, "teachGallery", stripItems(items.teachGallery), spaceLocale),
          saveTeachItems(tenantId, "teachCertificates", stripItems(items.teachCertificates), spaceLocale)
        );
      case "modules":
        return run(saveTeachModules(tenantId, enabledExplore, spaceLocale), saveTeachSettings(tenantId, "teachExplore", settings.teachExplore, spaceLocale));
      case "readings":
        return run(saveTeachItems(tenantId, "teachReadings", stripItems(items.teachReadings), spaceLocale));
      case "audio":
        return run(saveTeachItems(tenantId, "teachAudio", stripItems(items.teachAudio), spaceLocale));
      case "contact":
        return run(saveTeachSettings(tenantId, "teachContact", settings.teachContact, spaceLocale));
      case "pages":
        return run(saveTeachItems(tenantId, "customPages", stripItems(items.customPages), spaceLocale));
      case "publish":
        return null;
    }
  }

  const save = async (s: SectionKey): Promise<string | null> => {
    setSaving(s);
    const warnings: string[] = [];
    const err = await saveSection(s, warnings);
    setSaving(null);
    if (err) setToast({ kind: "error", text: err });
    else {
      clean(s);
      setToast(
        warnings.length
          ? { kind: "warn", text: t("studio", "savedWithWarnings", { warnings: warnings.join(" ") }) }
          : { kind: "ok", text: t("common", "saved") }
      );
    }
    return err;
  };

  const saveAll = async (): Promise<string | null> => {
    for (const s of [...dirty]) {
      const err = await save(s);
      if (err) return err;
    }
    return null;
  };

  const goTo = (s: SectionKey) => {
    setSection(s);
    setMobileNav(false);
    mainRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
    const url = new URL(window.location.href);
    url.searchParams.set("section", s);
    window.history.replaceState(null, "", url.toString());
  };

  // ---------------------------------------------------------------------
  // Media (reusing the shared Time to Flow upload actions where they fit)
  // ---------------------------------------------------------------------
  const uploadHero = async (file: File) => {
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    fd.set("kind", "hero");
    fd.set("previousRef", heroImageRef ?? "");
    fd.set("file", file);
    const res = await uploadBrandImage({ error: null, imageRef: null, imageUrl: null }, fd);
    if (res.error || !res.imageRef) return res.error ?? t("studio", "uploadFailed");
    setHeroImageRef(res.imageRef);
    setMediaUrl(res.imageRef, res.imageUrl ? `${res.imageUrl}` : null);
    // A new photo never inherits the old photo's focal point.
    setSettings((p) => ({ ...p, teachProfile: { ...p.teachProfile, heroImagePosition: null } }));
    markDirty("identity");
    return null;
  };
  const removeHero = async () => {
    if (!heroImageRef) return null;
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    fd.set("kind", "hero");
    fd.set("imageRef", heroImageRef);
    const res = await removeBrandImage({ error: null }, fd);
    if (res.error) return res.error;
    setMediaUrl(heroImageRef, null);
    setHeroImageRef(null);
    setSettings((p) => ({ ...p, teachProfile: { ...p.teachProfile, heroImagePosition: null } }));
    markDirty("identity");
    return null;
  };

  const uploadItemImage: StudioApi["uploadItemImage"] = async (key, item, index, file) => {
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    fd.set("moduleKey", key);
    fd.set("itemId", item.id);
    fd.set("previousRef", item.imageRef ?? "");
    fd.set("title", item.title || t("common", "untitled"));
    if (item.subtitle) fd.set("subtitle", item.subtitle);
    if (item.description) fd.set("description", item.description);
    fd.set("sortOrder", String(index));
    fd.set("file", file);
    const res = await uploadModuleItemPhoto({ error: null, imageRef: null, imageUrl: null }, fd);
    if (res.error || !res.imageRef) return { ref: null, error: res.error ?? t("studio", "uploadFailed") };
    // Cache-bust the signed URL so a replaced image (same path) re-renders.
    setMediaUrl(res.imageRef, res.imageUrl);
    return { ref: res.imageRef, error: null };
  };
  const removeItemImage: StudioApi["removeItemImage"] = async (_key, item) => {
    if (!item.imageRef) return null;
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    fd.set("itemId", item.id);
    fd.set("imageRef", item.imageRef);
    const res = await removeModuleItemPhoto({ error: null }, fd);
    if (res.error) return res.error;
    setMediaUrl(item.imageRef, null);
    return null;
  };

  const uploadSettingsImage: StudioApi["uploadSettingsImage"] = async (settingsKey, slot, file) => {
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    fd.set("settingsKey", settingsKey);
    fd.set("slot", slot);
    fd.set("file", file);
    const res = await uploadTeachSettingsImage(fd);
    if (res.error || !res.imageRef) return { ref: null, error: res.error ?? t("studio", "uploadFailed") };
    setMediaUrl(res.imageRef, res.imageUrl);
    return { ref: res.imageRef, error: null };
  };

  const removeItem: StudioApi["removeItem"] = async (key, id) => {
    const res = await deleteTeachItem(tenantId, key, id, spaceLocale);
    if (res.error) return res.error;
    setItemsState((prev) => ({ ...prev, [key]: (prev[key] as EditableTeachItem[]).filter((i) => i.id !== id) }));
    return null;
  };

  const api: StudioApi = {
    tenantId,
    locale: spaceLocale,
    setLocale: setSpaceLocale,
    todayIso: mounted ? todayInTimezone(timezone) : new Date().toISOString().slice(0, 10),
    name,
    setName: (v) => {
      setNameState(v);
      markDirty("identity");
    },
    slug,
    setSlug,
    timezone,
    setTimezone: (v) => {
      setTimezoneState(v);
      markDirty("identity");
    },
    colors,
    setColors: (c) => {
      setColorsState(c);
      markDirty("brand");
    },
    heroImageRef,
    settings,
    updateSetting,
    items,
    setItems,
    removeItem,
    enabledExplore,
    setEnabledExplore: (v) => {
      setEnabledExploreState(v);
      markDirty("modules");
    },
    mediaUrl,
    setMediaUrl,
    uploadHero,
    removeHero,
    uploadItemImage,
    removeItemImage,
    uploadSettingsImage,
    prepareAudioUpload: (item, index, mimeType, sizeBytes) =>
      prepareTeachAudioUpload(
        tenantId,
        { id: item.id, title: item.title, subtitle: item.subtitle, description: item.description, externalLink: item.externalLink, metadata: item.metadata },
        index,
        mimeType,
        sizeBytes,
        spaceLocale
      ),
    attachAudio: async (itemId, ref, durationSeconds) => (await attachTeachAudio(tenantId, itemId, ref, durationSeconds, spaceLocale)).error,
    detachAudio: async (itemId) => (await detachTeachAudio(tenantId, itemId, spaceLocale)).error,
    markDirty,
    isDirty: (s) => dirty.has(s),
    save,
    saving,
    customPagesLimit: initial.customPagesLimit,
    publishedAt,
    directoryListed: initial.directoryListed,
    setPublishedAt,
    canPublish: initial.canPublish,
    accessLabel: initial.accessLabel,
    saveAll,
    goTo,
  };

  // ---------------------------------------------------------------------
  // Live draft preview - the real Guest App, fed from Studio state.
  // ---------------------------------------------------------------------
  const previewData: TeachGuestData | null = useMemo(() => {
    if (!mounted) return null;
    return {
      teacherName: name || t("teach", "yourNameFallback"),
      // Preview renders in the Space's own language, so an organizer sees
      // what their guests will see rather than always English.
      locale: spaceLocale,
      timezone,
      todayIso: todayInTimezone(timezone),
      nowTime: currentTimeInTimezone(timezone),
      nowInstant: new Date().toISOString(),
      brand: {
        name: name || t("teach", "teacherFallback"),
        logoRef: null,
        palette: "forest-sage",
        customPrimary: colors.primary,
        customSecondary: colors.accent,
        customNavigation: colors.navigation,
        customText: colors.text,
        atmosphere: "calm-organic",
        imageStyle: "rounded",
      },
      heroImageRef,
      settings,
      // Same expansion as the published Guest App (series -> occurrences).
      classes: expandClassesForWindow(items.teachClasses, ...guestWindow(todayInTimezone(timezone)), timezone),
      availability: items.teachAvailability.filter((a) => a.metadata.enabled),
      readings: items.teachReadings,
      audio: items.teachAudio,
      gallery: items.teachGallery.filter((g) => g.imageRef),
      certificates: items.teachCertificates,
      customPages: items.customPages.filter((p) => p.metadata.enabled),
      enabledExplore,
      mediaUrls,
    };
      // `t` is derived from spaceLocale, already a dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, name, timezone, colors, heroImageRef, settings, items, enabledExplore, mediaUrls, spaceLocale]);

  const sectionProps = { api };
  let content: React.ReactNode;
  switch (section) {
    case "identity":
      content = <IdentitySection {...sectionProps} />;
      break;
    case "brand":
      content = <BrandSection {...sectionProps} />;
      break;
    case "home":
      content = <HomeSection {...sectionProps} />;
      break;
    case "schedule":
      content = <ScheduleSection {...sectionProps} />;
      break;
    case "about":
      content = <AboutSection {...sectionProps} />;
      break;
    case "modules":
      content = <ModulesSection {...sectionProps} />;
      break;
    case "readings":
      content = <ReadingsSection {...sectionProps} />;
      break;
    case "audio":
      content = <AudioSection {...sectionProps} />;
      break;
    case "contact":
      content = <ContactSection {...sectionProps} />;
      break;
    case "pages":
      content = <CustomPagesSection {...sectionProps} />;
      break;
    case "publish":
      content = <PublishSection {...sectionProps} preview={previewData ? <TeachGuestApp data={previewData} embedded /> : null} />;
      break;
  }

  const navList = (
    <nav aria-label={t("studio", "studioSections")} className="flex flex-col gap-1">
      {NAV.map((g) => (
        <div key={g.groupKey} className="flex flex-col gap-0.5 mb-2">
          <p className="px-3 pt-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#8C8A84]">{t("teach", g.groupKey)}</p>
          {g.items.map((it) => {
            const active = it.key === section;
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => goTo(it.key)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 px-3 min-h-10 rounded-lg text-left text-[13.5px] transition ${active ? "bg-white shadow-sm font-semibold text-[#192B21]" : "text-[#232926] hover:bg-white/60"}`}
              >
                <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${active ? "bg-[#9A7B4F]" : "bg-[#8C8A84]/35"}`} />
                <span className="flex-1">{t("teach", it.labelKey)}</span>
                {dirty.has(it.key) ? <span className="text-[10px] font-semibold text-[#A8643C]" aria-label={t("studio", "unsavedChanges")}>●</span> : null}
              </button>
            );
          })}
        </div>
      ))}
      <button
        type="button"
        onClick={() => goTo("publish")}
        aria-current={section === "publish" ? "page" : undefined}
        className={`mt-2 min-h-11 px-3 rounded-lg text-left text-[13.5px] font-semibold ${section === "publish" ? "bg-[#192B21] text-white" : "bg-white border border-[#E2DACD] text-[#192B21]"}`}
      >
        {t("teach", "previewAndPublish")}
      </button>
    </nav>
  );

  return (
    // lang/dir on the Studio shell: app/layout.tsx serves every route as
    // <html lang="en"> with no dir, and each surface owns its own pair.
    // Without this a Hebrew Studio renders its own chrome left-to-right.
    <div lang={spaceLocale} dir={spaceDir} className="flex-1 flex flex-col bg-[#F3EFE7] min-h-dvh" data-testid="teach-studio">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-[#F3EFE7]/95 backdrop-blur border-b border-[#E2DACD]">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" className="lg:hidden min-h-11 px-2 -ml-2 text-[13px] font-semibold text-[#192B21]" onClick={() => setMobileNav((v) => !v)} aria-expanded={mobileNav}>
            ☰ Menu
          </button>
          <Link href="/space" className="hidden sm:flex items-center gap-2 min-h-11 text-[12.5px] font-medium text-[#192B21]">
            <InnerDweSMark size={20} />
            {t("studio", "mySpaces")}
          </Link>
          <span className="hidden sm:inline text-[#8C8A84]">/</span>
          <span className="truncate text-[16px] italic text-[#192B21]" style={{ fontFamily: "var(--font-fraunces), serif" }}>
            {name || t("teach", "myTeachingSpace")}
          </span>
          <span className="hidden md:inline px-2.5 py-1 rounded-full bg-[#F1E9DC] text-[10px] font-semibold tracking-[0.12em] text-[#9A7B4F]">TIME TO TEACH</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden md:inline text-[12px] text-[#8C8A84]" role="status" aria-live="polite">
            {saving ? t("common", "savingNow") : dirty.size > 0 ? t("studio", "unsavedChangesShort") : t("studio", "allChangesSaved")}
          </span>
          {dirty.size > 0 ? (
            <button type="button" onClick={saveAll} className="min-h-10 px-4 rounded-full text-[12.5px] font-semibold bg-[#9A7B4F] text-white">
              {t("studio", "saveAll")}
            </button>
          ) : null}
          <button type="button" onClick={() => setMobilePreview(true)} className="lg:hidden min-h-10 px-4 rounded-full border border-[#192B21]/20 text-[12.5px] font-semibold text-[#192B21]">
            {t("common", "preview")}
          </button>
          <button type="button" onClick={() => goTo("publish")} className="min-h-10 px-4 rounded-full bg-[#192B21] text-white text-[12.5px] font-semibold">
            {t("studio", "publish")}
          </button>
        </div>
      </header>

      {mobileNav ? <div className="lg:hidden border-b border-[#E2DACD] bg-[#EFE9DE] px-3 pb-3">{navList}</div> : null}

      <div className="flex-1 grid lg:grid-cols-[250px_minmax(0,1fr)_400px]">
        <aside className="hidden lg:block bg-[#EFE9DE] px-3 py-4 border-r border-[#E2DACD]">
          <div className="sticky top-20">{navList}</div>
        </aside>
        <main ref={mainRef} className="min-w-0 px-4 sm:px-8 py-6 sm:py-8 flex flex-col gap-5" data-testid="studio-editor">
          {content}
        </main>
        <aside className="hidden lg:flex flex-col items-center gap-3 bg-[#E9E3D8] px-5 py-6 border-l border-[#E2DACD]">
          <div className="sticky top-20 flex flex-col items-center gap-3 w-full">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#8C8A84]">{t("teach", "liveDraftPreview")}</p>
            <div className="w-full max-w-[360px] h-[720px] rounded-[36px] overflow-hidden border-[6px] border-[#D9D1C3] bg-white shadow-xl" data-testid="studio-preview">
              {previewData ? <TeachGuestApp key={section} data={previewData} embedded initialTab={PREVIEW_TAB[section]} /> : null}
            </div>
            <p className="text-[11px] text-[#8C8A84] text-center">{t("teach", "previewUpdatesNote")}</p>
          </div>
        </aside>
      </div>

      {mobilePreview && previewData ? (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/40 flex flex-col" role="dialog" aria-modal="true" aria-label={t("common", "preview")}>
          <div className="flex justify-between items-center px-4 py-3 bg-[#F3EFE7]">
            <span className="text-[13px] font-semibold text-[#192B21]">{t("teach", "draftPreview")}</span>
            <button type="button" onClick={() => setMobilePreview(false)} className="min-h-11 px-3 text-[13px] font-semibold text-[#192B21]">
              {t("common", "close")}
            </button>
          </div>
          <div className="flex-1 min-h-0 bg-white">
            <TeachGuestApp data={previewData} embedded initialTab={PREVIEW_TAB[section]} />
          </div>
        </div>
      ) : null}

      {toast ? (
        <div role={toast.kind === "error" ? "alert" : "status"} className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full text-[13px] font-semibold shadow-lg ${toast.kind === "ok" ? "bg-[#192B21] text-white" : toast.kind === "warn" ? "bg-[#FBF1DC] text-[#5E3F0E] max-w-[min(92vw,560px)] rounded-2xl" : "bg-[#8F3B3B] text-white"}`}>
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}
