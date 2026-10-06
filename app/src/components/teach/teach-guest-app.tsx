"use client";

import { cardImage } from "@/lib/teach/cardImage";
import { createTranslator, translate, type Locale } from "@/lib/i18n";
import { formatShortDateLocalized, shortWeekdayName } from "@/lib/i18n/datetime";
import { useCallback, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from "react";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import { getDailyQuoteFrom } from "@/lib/content/dailyQuotes";
import type { FocalPoint } from "@/lib/media/focalPoint";
import type { TeachGuestData } from "@/lib/teach/guestData";
import type { TeachExploreModule, TeachItem } from "@/lib/teach/schemas";
import { exploreModuleStatus } from "@/lib/teach/moduleVisibility";
import { teachStyleVars, textureBackground } from "@/lib/teach/style";
import { TEACH_FONT_VARIABLES } from "@/lib/teach/fonts";
import { safeHttpUrl, whatsappUrl, mailtoUrl, contactEntries } from "@/lib/teach/links";
import {
  availabilityOn,
  buildScheduleDays,
  classesOn,
  describeAvailability,
  isClassPast,
  nextUpcomingClass,
  teachingSinceLabel,
} from "@/lib/teach/schedule";
import { TeachIcon, type TeachIconName } from "./teach-icons";
import { TeachImage } from "./teach-image";
import { TEACH_SIZES } from "./teach-media-sizes";
import { MediaPrefetch } from "@/components/shared/media-prefetch";
import type { MediaPrefetchItem } from "@/lib/media/prefetch";
import { TeachClassCard, TeachAvailabilityCard } from "./teach-class-card";
import {
  AudioListScreen,
  AudioPlayerScreen,
  ContactScreen,
  CustomPageScreen,
  ReadingDetailScreen,
  ReadingsScreen,
} from "./teach-library";
import { Chip, DailyQuoteBlock, DisplayHeading, EmptyState, Eyebrow, OrganicShapes, PillButton, PillLink, SectionHeader } from "./teach-ui";

type Tab = "home" | "schedule" | "about" | "explore";
type Page =
  | { kind: "readings" }
  | { kind: "reading"; id: string }
  | { kind: "audio" }
  | { kind: "track"; id: string }
  | { kind: "contact" }
  | { kind: "page"; id: string };

/** `labelKey` resolves through the Space locale at render time. */
const TABS: { key: Tab; labelKey: "navHome" | "navSchedule" | "navAbout" | "navExplore"; icon: TeachIconName }[] = [
  { key: "home", labelKey: "navHome", icon: "home" },
  { key: "schedule", labelKey: "navSchedule", icon: "calendar" },
  { key: "about", labelKey: "navAbout", icon: "user" },
  { key: "explore", labelKey: "navExplore", icon: "compass" },
];

const SOCIAL_ICON: Record<string, TeachIconName> = {
  instagram: "instagram",
  facebook: "facebook",
  youtube: "youtube",
  tiktok: "tiktok",
  linkedin: "linkedin",
  website: "globe",
};

/** Scoped motion + range styling; everything is disabled under reduced motion. */
const TEACH_CSS = `
.tt-root .no-scrollbar::-webkit-scrollbar{display:none}.tt-root .no-scrollbar{scrollbar-width:none}
@keyframes tt-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes tt-fade{from{opacity:0}to{opacity:1}}
.tt-root .tt-reveal{animation:tt-rise .32s ease-out both}
.tt-root .tt-expand{animation:tt-rise .22s ease-out both}
.tt-root .tt-fade-in{animation:tt-fade .45s ease-out both}
.tt-root .tt-range{accent-color:var(--rbr-primary);height:24px}
@media (prefers-reduced-motion: reduce){.tt-root .tt-reveal,.tt-root .tt-expand,.tt-root .tt-fade-in{animation:none}}
`;

/** "Next: Morning Flow · Wed 14 Oct 09:00" - one place, so the empty
 * states on three screens cannot drift apart or half-translate. */
function nextClassLine(next: TeachItem<"teachClasses">, locale: Locale): string {
  return translate(locale, "teach", "nextClassLine", {
    title: next.title,
    date: formatShortDateLocalized(next.metadata.startDate, locale),
    time: next.metadata.startTime,
  });
}

/** "Wed 14 Oct, 2 classes" - the count is pluralized per language
 * rather than by appending an "s" that only English has. */
function dayOptionLabel(dateIso: string, count: number, mode: "classes" | "private", locale: Locale): string {
  const date = formatShortDateLocalized(dateIso, locale);
  if (!count) return date;
  const key = mode === "classes" ? (count === 1 ? "classOne" : "classesN") : count === 1 ? "windowOne" : "windowsN";
  return `${date}, ${translate(locale, "teach", key, { count })}`;
}

function exploreTitle(data: TeachGuestData, key: "teachReadings" | "teachAudio" | "teachContact", fallback: string) {
  return data.settings.teachExplore.cards[key]?.title ?? fallback;
}

/**
 * The media on the tabs the visitor is NOT looking at, in bottom-nav
 * order, so the most likely next press is warmed first.
 *
 * Each entry carries the `sizes` its own screen will use, imported from
 * that screen rather than retyped, so the warmed render is the one the
 * <img> later asks for. Teach's Explore covers only became predictable
 * enough for this when they stopped being CSS background-images - see
 * ExploreCard.
 *
 * Deliberately omitted: the About gallery and certificate thumbnails,
 * and the Readings/Audio libraries behind the Explore cards. They are
 * below the fold of a tab nobody has opened, or a second press deep;
 * spending a phone's data on them is what "do not preload the entire
 * media library at startup" rules out.
 */
export function teachPrefetchItems(
  data: TeachGuestData,
  tab: Tab,
  url: (ref: string | null | undefined) => string | null
): MediaPrefetchItem[] {
  const items: MediaPrefetchItem[] = [];

  if (tab !== "about" && data.settings.teachAbout.showTab) {
    const about = data.settings.teachAbout;
    items.push({
      src: url(about.profile.imageRef) ?? url(data.heroImageRef),
      sizes: ABOUT_PORTRAIT_SIZES,
    });
  }

  if (tab !== "explore") {
    const cards = data.settings.teachExplore.cards;
    for (const key of ["teachReadings", "teachAudio", "teachContact"] as const) {
      if (exploreModuleStatus(data, key) !== "visible") continue;
      // Readings is the `feature` tile (see ExploreScreen), so it has a
      // box of its own and must be warmed at that box's candidate set.
      const sizes = key === "teachReadings" ? EXPLORE_FEATURE_CARD_SIZES : EXPLORE_CARD_SIZES;
      items.push({ src: url(cards[key]?.imageRef ?? null), sizes });
    }
    if (exploreModuleStatus(data, "customPages") === "visible") {
      for (const page of data.customPages) {
        items.push({ src: url(page.imageRef), sizes: EXPLORE_CARD_SIZES });
      }
    }
  }

  return items;
}

export function TeachGuestApp({
  data,
  embedded = false,
  initialTab = "home",
}: {
  data: TeachGuestData;
  /** Studio preview: fixed-height frame with its own scroll container. */
  embedded?: boolean;
  initialTab?: Tab;
}) {
  const [selectedTab, setTab] = useState<Tab>(initialTab);
  const [stack, setStack] = useState<Page[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const desktop = useIsDesktopContainer(rootRef);
  const page = stack[stack.length - 1] ?? null;
  const style = data.settings.teachStyle;

  const scrollTop = useCallback(() => {
    if (embedded) scrollRef.current?.scrollTo({ top: 0 });
    else window.scrollTo({ top: 0 });
  }, [embedded]);

  const goTab = (t: Tab) => {
    setTab(t);
    setStack([]);
    scrollTop();
  };
  const open = (p: Page) => {
    setStack((s) => [...s, p]);
    scrollTop();
  };
  const back = () => {
    setStack((s) => s.slice(0, -1));
    scrollTop();
  };

  const vars = useMemo(
    () => ({ ...deriveThemeVars(data.brand), ...teachStyleVars(style) }) as CSSProperties,
    [data.brand, style]
  );

  const { t, dir } = createTranslator(data.locale);
  const tabs = visibleTabs(data);
  // A hidden About tab can't stay selected (e.g. the Studio preview was on it when the teacher turned it off).
  const tab = tabs.some((item) => item.key === selectedTab) ? selectedTab : "home";

  const url = (ref: string | null | undefined) => (ref ? (data.mediaUrls[ref] ?? null) : null);

  let body: ReactNode;
  if (page?.kind === "readings") body = <ReadingsScreen data={data} onBack={back} onOpen={(id) => open({ kind: "reading", id })} title={exploreTitle(data, "teachReadings", t("teach", "exploreReadings"))} />;
  else if (page?.kind === "reading") {
    const item = data.readings.find((r) => r.id === page.id);
    body = item ? <ReadingDetailScreen data={data} item={item} onBack={back} /> : null;
  } else if (page?.kind === "audio") body = <AudioListScreen data={data} onBack={back} onOpen={(id) => open({ kind: "track", id })} title={exploreTitle(data, "teachAudio", t("teach", "exploreAudio"))} />;
  else if (page?.kind === "track") {
    const item = data.audio.find((a) => a.id === page.id);
    body = item ? <AudioPlayerScreen key={item.id} data={data} item={item} onBack={back} /> : null;
  } else if (page?.kind === "contact") body = <ContactScreen data={data} onBack={back} backLabel={tab === "home" ? t("teach", "navHome") : t("teach", "navExplore")} />;
  else if (page?.kind === "page") {
    const item = data.customPages.find((p) => p.id === page.id);
    body = item ? <CustomPageScreen data={data} page={item} onBack={back} /> : null;
  } else if (tab === "schedule") body = <ScheduleScreen data={data} desktop={desktop} />;
  else if (tab === "about") body = <AboutScreen data={data} url={url} />;
  else if (tab === "explore") body = <ExploreScreen data={data} url={url} open={open} />;
  else body = <HomeScreen data={data} url={url} open={open} goTab={goTab} />;

  return (
    <div
      ref={rootRef}
      lang={data.locale}
      dir={dir}
      className={`tt-root guest-viewport ${TEACH_FONT_VARIABLES} @container relative flex flex-col ${embedded ? "h-full" : "min-h-dvh"}`}
      style={{
        ...vars,
        background: "var(--tt-bg)",
        backgroundImage: textureBackground(style.texture),
        color: "var(--rbr-text)",
        fontFamily: "var(--tt-font-body)",
        // The page now extends under the notch (viewport-fit=cover), so
        // the top inset has to come back as padding or the hero and the
        // desktop nav would sit beneath it. Zero on every screen without
        // one, and zero inside the Studio's preview frame.
        ...(embedded ? null : { paddingTop: "env(safe-area-inset-top)" }),
      }}
      data-testid="teach-guest-app"
    >
      <style>{TEACH_CSS}</style>
      {/* Step 4 of the loading ladder - renders nothing, and waits for
          this screen's own load and an idle main thread first, so it can
          never push the hero back. */}
      <MediaPrefetch items={teachPrefetchItems(data, tab, url)} />
      <DesktopTopNav data={data} tabs={tabs} tab={tab} onTab={goTab} url={url} />
      <div ref={scrollRef} className={`relative flex-1 overflow-x-clip ${embedded ? "overflow-y-auto" : ""}`}>
        {style.organicShapes && !page ? <OrganicShapes /> : null}
        <main className="relative w-full mx-auto @4xl:max-w-[1180px] pt-2 @min-[40rem]:pt-6 @4xl:pt-10 pb-6 @min-[40rem]:pb-16">{body}</main>
      </div>
      <nav
        aria-label={t("common", "mainContent")}
        className="@min-[40rem]:hidden sticky bottom-0 z-20 flex justify-around px-2 pt-2 pb-[max(env(safe-area-inset-bottom),14px)]"
        style={{ background: "rgb(253 250 244 / 0.96)", borderTop: "1px solid var(--tt-line)", backdropFilter: "blur(10px)" }}
      >
        {tabs.map((item) => {
          const active = item.key === tab;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => goTab(item.key)}
              aria-current={active ? "page" : undefined}
              className="flex flex-col items-center gap-1 min-w-[64px] min-h-11 pt-1"
              style={{ color: active ? "var(--rbr-navigation)" : "var(--rbr-mist)" }}
            >
              <TeachIcon name={item.icon} size={22} strokeWidth={active ? 1.9 : 1.5} />
              <span className="text-[10.5px]" style={{ fontWeight: active ? 600 : 500 }}>
                {t("teach", item.labelKey)}
              </span>
              <span aria-hidden="true" className="w-4 h-0.5 rounded-full" style={{ background: active ? "var(--rbr-navigation)" : "transparent" }} />
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/** Same threshold as Tailwind's @4xl container query (56rem = 896px). */
const DESKTOP_MIN_WIDTH = 896;

/**
 * Whether the Guest App's own container is desktop-wide. Only used where a
 * layout needs different CONTENT (the Schedule agenda), not just different
 * CSS. Server render and hydration always see the phone layout.
 */
function useIsDesktopContainer(ref: RefObject<HTMLDivElement | null>) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const el = ref.current;
      if (!el || typeof ResizeObserver === "undefined") return () => {};
      const ro = new ResizeObserver(onChange);
      ro.observe(el);
      return () => ro.disconnect();
    },
    [ref]
  );
  return useSyncExternalStore(
    subscribe,
    () => (ref.current?.clientWidth ?? 0) >= DESKTOP_MIN_WIDTH,
    () => false
  );
}

/** Tabs guests can navigate to. About Me is shown unless the teacher explicitly hid it. */
export function visibleTabs(data: TeachGuestData) {
  return TABS.filter((t) => t.key !== "about" || data.settings.teachAbout.showTab);
}

function DesktopTopNav({ data, tabs, tab, onTab, url }: { data: TeachGuestData; tabs: typeof TABS; tab: Tab; onTab: (t: Tab) => void; url: (r: string | null) => string | null }) {
  const { t } = createTranslator(data.locale);
  const contact = contactEntries(data.settings.teachContact);
  const primary = contact.find((e) => e.method === data.settings.teachContact.primary) ?? contact[0] ?? null;
  return (
    <header className="hidden @min-[40rem]:flex sticky top-0 z-20 items-center justify-between gap-4 px-6 @4xl:px-12 py-3 @4xl:py-4" style={{ background: "rgb(253 250 244 / 0.95)", borderBottom: "1px solid var(--tt-line)", backdropFilter: "blur(10px)" }}>
      <button type="button" onClick={() => onTab("home")} className="flex items-center gap-3">
        <TeachImage src={url(data.settings.teachAbout.profile.imageRef) ?? url(data.heroImageRef)} focal={data.settings.teachAbout.profile.imagePosition ?? data.settings.teachProfile.heroImagePosition} alt="" fallbackLabel={data.teacherName} sizes={TEACH_SIZES.navAvatar} className="w-9 h-9 rounded-full" />
        <span className="text-[19px] @4xl:text-[22px] truncate" style={{ fontFamily: "var(--tt-font-display)" }}>
          {data.teacherName}
        </span>
      </button>
      <nav aria-label={t("common", "mainContent")} className="flex items-center gap-5 @4xl:gap-7 shrink-0">
        {tabs.map((item) => (
          <button key={item.key} type="button" onClick={() => onTab(item.key)} aria-current={item.key === tab ? "page" : undefined} className="flex flex-col items-center gap-1 text-[14px] min-h-11 justify-center" style={{ color: item.key === tab ? "var(--rbr-navigation)" : "var(--rbr-text-muted)", fontWeight: item.key === tab ? 600 : 500 }}>
            {t("teach", item.labelKey)}
            <span className="w-4 h-0.5 rounded-full" style={{ background: item.key === tab ? "var(--rbr-navigation)" : "transparent" }} />
          </button>
        ))}
        {primary ? (
          <PillLink href={primary.href} className="!min-h-10 !px-4">
            {t("common", "contact")}
          </PillLink>
        ) : null}
      </nav>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

/**
 * Responsive sizes use container queries so the Studio preview frame and a
 * real device agree: base = phone (< 640px, unchanged from the mobile
 * design), @min-[40rem] = tablet, @4xl (896px) = desktop.
 */
function Hero({
  data,
  url,
  onSchedule,
  onContact,
}: {
  data: TeachGuestData;
  url: (r: string | null) => string | null;
  onSchedule: () => void;
  onContact: (() => void) | null;
}) {
  const p = data.settings.teachProfile;
  const { t } = createTranslator(data.locale);
  const layout = data.settings.teachStyle.heroLayout;
  const src = url(data.heroImageRef);
  const fullbleed = layout === "fullbleed";
  const identity = (light: boolean) => (
    <div className={`flex flex-col gap-1.5 @min-[40rem]:gap-2 ${fullbleed ? "" : "items-center text-center @min-[40rem]:items-start @min-[40rem]:text-start"}`}>
      {p.greeting ? (
        <p dir="auto" className="text-[13px] @min-[40rem]:text-[15px] italic" style={{ color: light ? "rgba(255,255,255,.9)" : "var(--rbr-text-muted)", fontFamily: "var(--tt-font-display)" }}>
          {p.greeting}
        </p>
      ) : null}
      {p.teacherType ? <Eyebrow userContent tone={light ? "light" : "primary"}>{p.teacherType}</Eyebrow> : null}
      <DisplayHeading
        userContent
        as="h1"
        className="[--tt-hero-name:38px] @min-[40rem]:[--tt-hero-name:52px] @4xl:[--tt-hero-name:66px] @4xl:leading-[1.05]"
        style={{ fontSize: "calc(var(--tt-hero-name) * var(--tt-display-scale, 1))", ...(light ? { color: "#fff" } : null) }}
      >
        {data.teacherName}
      </DisplayHeading>
      {p.locationLine ? (
        <p dir="auto" className="text-[12.5px] @min-[40rem]:text-[14px]" style={{ color: light ? "rgba(255,255,255,.85)" : "var(--rbr-text-muted)" }}>
          {p.locationLine}
        </p>
      ) : null}
      {/* Tablet/desktop only: the hero carries the two main actions. On a
          phone they stay where they were (bottom nav + "Get in touch"). */}
      <div className="hidden @min-[40rem]:flex flex-wrap gap-3 mt-4">
        <PillButton onClick={onSchedule} icon="calendar" className="!w-auto !px-6">
          {t("teach", "seeTheSchedule")}
        </PillButton>
        {onContact ? (
          <PillButton onClick={onContact} kind={light ? "light" : "soft"} icon="chat" className="!w-auto !px-6">
            {t("teach", "getInTouch")}
          </PillButton>
        ) : null}
      </div>
    </div>
  );
  if (fullbleed) {
    return (
      <div className="relative h-[360px] @min-[40rem]:h-[460px] @4xl:h-[560px] overflow-hidden -mt-2 @min-[40rem]:mt-0 @min-[40rem]:mx-6 @4xl:mx-10 @min-[40rem]:rounded-[var(--tt-radius-card)]">
        <TeachImage priority sizes="100vw" src={src} focal={p.heroImagePosition} alt={`${data.teacherName}`} fallbackLabel={data.teacherName} className="absolute inset-0 w-full h-full" />
        <div aria-hidden="true" className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgb(20 30 25 / calc(var(--tt-overlay) * .4)) 0%, rgb(20 30 25 / calc(var(--tt-overlay) + .3)) 100%)" }} />
        <div className="absolute start-6 end-6 bottom-6 @min-[40rem]:start-10 @min-[40rem]:end-10 @min-[40rem]:bottom-10 @4xl:start-14 @4xl:bottom-14 @4xl:max-w-[640px]">{identity(true)}</div>
      </div>
    );
  }
  // Arch / circle portrait. The size lives in a CSS variable so the arch's
  // top radius always stays exactly half its width at every breakpoint.
  const imgClass =
    layout === "circle"
      ? "[--tt-portrait:168px] @min-[40rem]:[--tt-portrait:230px] @4xl:[--tt-portrait:320px]"
      : "[--tt-portrait:230px] @min-[40rem]:[--tt-portrait:250px] @4xl:[--tt-portrait:340px]";
  const imgStyle: CSSProperties =
    layout === "circle"
      ? { width: "var(--tt-portrait)", height: "var(--tt-portrait)", borderRadius: "999px", border: "5px solid var(--tt-surface)", boxShadow: "0 18px 40px -22px rgba(36,59,50,.5)" }
      : {
          width: "var(--tt-portrait)",
          height: "calc(var(--tt-portrait) * 290 / 230)",
          borderRadius: "calc(var(--tt-portrait) / 2) calc(var(--tt-portrait) / 2) var(--tt-radius-card) var(--tt-radius-card)",
        };
  return (
    <div className="flex flex-col items-center gap-5 px-6 pt-3 @min-[40rem]:flex-row @min-[40rem]:justify-between @min-[40rem]:gap-10 @min-[40rem]:mx-6 @min-[40rem]:p-10 @min-[40rem]:bg-[var(--tt-surface)] @min-[40rem]:border @min-[40rem]:border-[var(--tt-line)] @min-[40rem]:rounded-[calc(var(--tt-radius-card)+8px)] @4xl:mx-10 @4xl:gap-16 @4xl:px-16 @4xl:py-14">
      <TeachImage priority sizes="(min-width: 896px) 340px, (min-width: 640px) 250px, 230px" src={src} focal={p.heroImagePosition} alt={`${data.teacherName}`} fallbackLabel={data.teacherName} className={`shrink-0 @min-[40rem]:order-last ${imgClass}`} style={imgStyle} />
      <div className="@min-[40rem]:flex-1 @min-[40rem]:min-w-0">{identity(false)}</div>
    </div>
  );
}

function HomeScreen({
  data,
  url,
  open,
  goTab,
}: {
  data: TeachGuestData;
  url: (r: string | null) => string | null;
  open: (p: Page) => void;
  goTab: (t: Tab) => void;
}) {
  const s = data.settings;
  const { t } = createTranslator(data.locale);
  const sections = s.teachProfile.homeSections;
  const quote = sections.quote ? getDailyQuoteFrom(data.todayIso, s.dailyInspiration.quotes, s.dailyInspiration.useFallback, s.dailyInspiration.quotes.length ? "" : null) : null;
  const today = classesOn(data.classes, data.todayIso, data.timezone);
  const next = today.length === 0 ? nextUpcomingClass(data.classes, data.todayIso, data.timezone) : null;
  const [expanded, setExpanded] = useState<string | null>(null);

  const weekWindows = useMemo(() => {
    const seen = new Set<string>();
    const out: TeachItem<"teachAvailability">[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(`${data.todayIso}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      for (const w of availabilityOn(data.availability, d.toISOString().slice(0, 10))) {
        if (!seen.has(w.id)) {
          seen.add(w.id);
          out.push(w);
        }
      }
    }
    return out;
  }, [data.availability, data.todayIso]);

  const latestReading = data.enabledExplore.includes("teachReadings")
    ? [...data.readings].sort((a, b) => (b.metadata.date ?? "").localeCompare(a.metadata.date ?? ""))[0]
    : undefined;
  const latestAudio = data.enabledExplore.includes("teachAudio") ? data.audio.find((a) => a.metadata.audioRef) : undefined;
  const contactOn = data.enabledExplore.includes("teachContact") && contactEntries(s.teachContact).length > 0;
  const firstName = data.teacherName.split(" ")[0] || data.teacherName;
  const showPrivate = sections.private && weekWindows.length > 0;
  const showLibrary = sections.library && (latestReading || latestAudio);
  const pad = "px-4 @min-[40rem]:px-6 @4xl:px-10";

  return (
    <div className="flex flex-col gap-[var(--tt-section-gap)] @min-[40rem]:gap-12 @4xl:gap-16">
      <Hero data={data} url={url} onSchedule={() => goTab("schedule")} onContact={sections.contact && contactOn ? () => open({ kind: "contact" }) : null} />
      {quote ? (
        <div className="px-8 @min-[40rem]:px-10 w-full @min-[40rem]:max-w-[640px] @4xl:max-w-[760px] mx-auto">
          <DailyQuoteBlock quote={quote} style={s.teachStyle} attribution={t("teach", "inspirationFrom", { name: firstName })} />
        </div>
      ) : null}
      {sections.contact && contactOn ? (
        <div className="px-4 @min-[40rem]:hidden">
          <PillButton onClick={() => open({ kind: "contact" })} icon="chat" className="w-full">
            {t("teach", "getInTouch")}
          </PillButton>
        </div>
      ) : null}

      {sections.today ? (
        <section aria-labelledby="tt-today" className={`flex flex-col gap-3 @min-[40rem]:gap-4 ${pad}`}>
          <div id="tt-today">
            <SectionHeader title={t("teach", "todaysClasses")} action={formatShortDateLocalized(data.todayIso, data.locale)} />
          </div>
          {today.length > 0 ? (
            <div className="grid gap-3 @min-[40rem]:grid-cols-2 @4xl:grid-cols-3 @min-[40rem]:gap-4 items-start" data-testid="home-today-grid">
              {today.map((c) => (
                <TeachClassCard
                  key={c.id}
                  item={c}
                  imageUrl={url(c.imageRef)}
                  teacherName={data.teacherName}
                  expanded={expanded === c.id}
                  onToggle={() => setExpanded((e) => (e === c.id ? null : c.id))}
                  past={isClassPast(c.metadata, data.todayIso, data.nowTime, data.nowInstant)}
                  timezoneLabel={c.metadata.timezone && c.metadata.timezone !== data.timezone ? c.metadata.timezone : null}
                  locale={data.locale}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title={t("teach", "noClassesToday")}
              body={next ? nextClassLine(next, data.locale) : t("teach", "exploreEmpty")}
              action={
                <PillButton kind="soft" icon="calendar" onClick={() => goTab("schedule")}>
                  {t("teach", "seeFullSchedule")}
                </PillButton>
              }
            />
          )}
        </section>
      ) : null}

      {showPrivate || showLibrary ? (
        <div className={`flex flex-col gap-[var(--tt-section-gap)] @min-[40rem]:gap-12 @4xl:grid @4xl:gap-10 @4xl:items-start ${showPrivate && showLibrary ? "@4xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : ""}`}>
          {showPrivate ? (
            <section className={`${pad} @4xl:pe-0 @4xl:flex @4xl:flex-col @4xl:gap-4`}>
              <div className="hidden @4xl:block">
                <SectionHeader title={t("teach", "oneToOne")} />
              </div>
              <button type="button" onClick={() => goTab("schedule")} className="tt-reveal w-full text-start flex items-center gap-3.5 p-4 @min-[40rem]:p-6" style={{ background: "var(--rbr-primary-soft)", borderRadius: "var(--tt-radius-card)" }}>
                <span className="flex-1 flex flex-col gap-1">
                  <Eyebrow tone="primary">{t("teach", "oneToOne")}</Eyebrow>
                  <DisplayHeading as="h2" size={18}>
                    {t("teach", "privateThisWeek")}
                  </DisplayHeading>
                  <span className="text-[12.5px]" style={{ color: "var(--rbr-text-muted)" }}>
                    {weekWindows
                      .slice(0, 3)
                      .map((w) => describeAvailability(w.metadata, { locale: data.locale, withWhen: false }))
                      .join(" · ")}
                  </span>
                </span>
                <span style={{ color: "var(--rbr-primary)" }}>
                  <TeachIcon name="chevronRight" size={20} strokeWidth={2} />
                </span>
              </button>
            </section>
          ) : null}

          {showLibrary ? (
            <section className={`flex flex-col gap-3 @min-[40rem]:gap-4 ${pad} ${showPrivate ? "@4xl:ps-0" : ""}`}>
              <SectionHeader title={t("teach", "moreFrom", { name: firstName })} />
              <div className="grid grid-cols-2 gap-2.5 @min-[40rem]:gap-4">
                {latestReading ? (
                  <button type="button" onClick={() => open({ kind: "reading", id: latestReading.id })} className="tt-reveal text-start overflow-hidden flex flex-col" style={{ background: "var(--tt-surface)", border: "1px solid var(--tt-line)", borderRadius: "var(--tt-radius-card)" }}>
                    <TeachImage {...cardImage(data, "teachReadings", latestReading)} alt="" fallbackLabel={latestReading.title} sizes={TEACH_SIZES.homeMoreCard} className="w-full h-[110px] @min-[40rem]:h-[170px]" />
                    <span className="p-3 @min-[40rem]:p-4 flex flex-col gap-1">
                      <Eyebrow tone="primary">{t("teach", "reading")}</Eyebrow>
                      <span dir="auto" className="text-[15px] @min-[40rem]:text-[18px] leading-tight line-clamp-2" style={{ fontFamily: "var(--tt-font-display)" }}>
                        {latestReading.title}
                      </span>
                    </span>
                  </button>
                ) : null}
                {latestAudio ? (
                  <button type="button" onClick={() => open({ kind: "track", id: latestAudio.id })} className="tt-reveal text-start overflow-hidden flex flex-col" style={{ background: "var(--tt-surface)", border: "1px solid var(--tt-line)", borderRadius: "var(--tt-radius-card)" }}>
                    <TeachImage {...cardImage(data, "teachAudio", latestAudio)} alt="" fallbackLabel={latestAudio.title} sizes={TEACH_SIZES.homeMoreCard} className="w-full h-[110px] @min-[40rem]:h-[170px]" />
                    <span className="p-3 @min-[40rem]:p-4 flex flex-col gap-1">
                      <Eyebrow tone="primary">{t("teach", "exploreAudio")}</Eyebrow>
                      <span dir="auto" className="text-[15px] @min-[40rem]:text-[18px] leading-tight line-clamp-2" style={{ fontFamily: "var(--tt-font-display)" }}>
                        {latestAudio.title}
                      </span>
                    </span>
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ScheduleModeTabs({
  mode,
  onMode,
  locale,
  className = "",
}: {
  mode: "classes" | "private";
  onMode: (m: "classes" | "private") => void;
  locale: Locale;
  className?: string;
}) {
  const { t } = createTranslator(locale);
  return (
    <div role="tablist" aria-label={t("teach", "scheduleType")} className={`grid grid-cols-2 p-1 ${className}`} style={{ background: "rgb(0 0 0 / 0.05)", borderRadius: "var(--tt-radius-pill)" }}>
      {(
        [
          ["classes", t("teach", "groupClasses")],
          ["private", t("teach", "privateSessions")],
        ] as const
      ).map(([k, label]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={mode === k}
          onClick={() => onMode(k)}
          className="min-h-10 text-[13px]"
          style={{
            borderRadius: "var(--tt-radius-pill)",
            background: mode === k ? "var(--tt-surface)" : "transparent",
            fontWeight: mode === k ? 600 : 500,
            color: mode === k ? "var(--rbr-text)" : "var(--rbr-text-muted)",
            boxShadow: mode === k ? "0 2px 8px rgba(0,0,0,.06)" : "none",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ScheduleScreen({ data, desktop }: { data: TeachGuestData; desktop: boolean }) {
  const [mode, setMode] = useState<"classes" | "private">("classes");
  const days = useMemo(() => buildScheduleDays(data.classes, data.availability, data.todayIso, 14, data.timezone), [data.classes, data.availability, data.todayIso, data.timezone]);
  const firstWithClass = days.find((d) => d.classCount > 0)?.date ?? data.todayIso;
  const firstWithPrivate = days.find((d) => d.availabilityCount > 0)?.date ?? data.todayIso;
  const [selected, setSelected] = useState<string | null>(null);
  const date = selected ?? (mode === "classes" ? firstWithClass : firstWithPrivate);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const hasPrivate = data.availability.length > 0;
  const { t } = createTranslator(data.locale);
  const onMode = (k: "classes" | "private") => {
    setMode(k);
    setSelected(null);
  };
  const classCard = (c: TeachItem<"teachClasses">) => (
    <TeachClassCard
      key={c.id}
      item={c}
      imageUrl={c.imageRef ? (data.mediaUrls[c.imageRef] ?? null) : null}
      teacherName={data.teacherName}
      expanded={expanded.has(c.id)}
      onToggle={() => toggle(c.id)}
      past={isClassPast(c.metadata, data.todayIso, data.nowTime, data.nowInstant)}
      timezoneLabel={c.metadata.timezone && c.metadata.timezone !== data.timezone ? c.metadata.timezone : null}
      locale={data.locale}
    />
  );
  const firstName = data.teacherName.split(" ")[0] || data.teacherName;

  if (desktop) return <ScheduleAgenda data={data} days={days} mode={mode} onMode={hasPrivate ? onMode : null} classCard={classCard} firstName={firstName} />;

  const classes = classesOn(data.classes, date, data.timezone);
  const windows = availabilityOn(data.availability, date);
  const next = nextUpcomingClass(data.classes, date, data.timezone);

  return (
    <div className="flex flex-col gap-4 @min-[40rem]:gap-6">
      <header className="px-5 @min-[40rem]:px-6 flex flex-col gap-3 @min-[40rem]:flex-row @min-[40rem]:items-end @min-[40rem]:justify-between @min-[40rem]:gap-6">
        <div className="flex flex-col gap-1">
          <Eyebrow>{t("teach", "thisWeekWith", { name: firstName })}</Eyebrow>
          <DisplayHeading as="h1" className="[--tt-h1:32px] @min-[40rem]:[--tt-h1:42px]" style={{ fontSize: "calc(var(--tt-h1) * var(--tt-display-scale, 1))" }}>
            {t("teach", "navSchedule")}
          </DisplayHeading>
        </div>
        {hasPrivate ? <ScheduleModeTabs mode={mode} onMode={onMode} locale={data.locale} className="@min-[40rem]:w-[360px] @min-[40rem]:shrink-0" /> : null}
      </header>
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-5 @min-[40rem]:px-6" role="listbox" aria-label={t("teach", "chooseDay")}>
        {days.map((d) => {
          const active = d.date === date;
          const count = mode === "classes" ? d.classCount : d.availabilityCount;
          const wd = shortWeekdayName(new Date(`${d.date}T12:00:00Z`).getUTCDay(), data.locale).toUpperCase();
          return (
            <button
              key={d.date}
              type="button"
              role="option"
              aria-selected={active}
              aria-label={dayOptionLabel(d.date, count, mode, data.locale)}
              onClick={() => setSelected(d.date)}
              className="shrink-0 w-[52px] @min-[40rem]:w-[56px] py-2 @min-[40rem]:py-2.5 flex flex-col items-center gap-0.5"
              style={{
                borderRadius: "calc(var(--tt-radius-card) - 4px)",
                background: active ? "var(--rbr-navigation)" : "var(--tt-surface)",
                border: active ? "1px solid transparent" : "1px solid var(--tt-line)",
                color: active ? "var(--rbr-on-navigation)" : "var(--rbr-text)",
              }}
            >
              <span className="text-[10px] font-semibold tracking-wider" style={{ opacity: active ? 0.9 : 0.6 }}>
                {wd}
              </span>
              <span className="text-[19px] @min-[40rem]:text-[21px]" style={{ fontFamily: "var(--tt-font-display)" }}>
                {Number(d.date.slice(8, 10))}
              </span>
              <span aria-hidden="true" className="w-1 h-1 rounded-full" style={{ background: count ? (active ? "currentColor" : "var(--rbr-primary)") : "transparent" }} />
            </button>
          );
        })}
      </div>
      <section className="flex flex-col gap-3 px-4 @min-[40rem]:px-6">
        <p className="px-1 text-[12px] @min-[40rem]:text-[13px] font-semibold" style={{ color: "var(--rbr-text-muted)" }}>
          {formatShortDateLocalized(date, data.locale)}
          {mode === "classes"
            ? ` · ${classes.length === 1 ? t("teach", "classOne") : t("teach", "classesN", { count: classes.length })}`
            : ""}
        </p>
        {mode === "classes" ? (
          classes.length > 0 ? (
            <div className="grid gap-3 @min-[40rem]:grid-cols-2 @min-[40rem]:gap-4 items-start">{classes.map(classCard)}</div>
          ) : (
            <EmptyState
              icon="calendar"
              title={data.classes.length ? t("teach", "noClassesOnDay") : t("teach", "newClassesSoon")}
              body={next ? nextClassLine(next, data.locale) : undefined}
              action={next ? <PillButton kind="soft" onClick={() => setSelected(next.metadata.startDate)}>{t("teach", "goToDate", { date: formatShortDateLocalized(next.metadata.startDate, data.locale) })}</PillButton> : undefined}
            />
          )
        ) : windows.length > 0 ? (
          <div className="grid gap-3 @min-[40rem]:grid-cols-2 @min-[40rem]:gap-4 items-start">
            {windows.map((w) => (
              <TeachAvailabilityCard key={w.id} item={w} dateIso={date} teacherName={data.teacherName} contact={data.settings.teachContact} locale={data.locale} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="user"
            title={t("teach", "noPrivateThisDay")}
            body={data.availability.map((w) => describeAvailability(w.metadata, { locale: data.locale })).slice(0, 3).join(" · ")}
          />
        )}
      </section>
    </div>
  );
}

/**
 * Desktop agenda: every day of the next two weeks that has something on it,
 * in order, with a sticky day index on the left - instead of the phone's
 * one-day-at-a-time strip.
 */
function ScheduleAgenda({
  data,
  days,
  mode,
  onMode,
  classCard,
  firstName,
}: {
  data: TeachGuestData;
  days: ReturnType<typeof buildScheduleDays>;
  mode: "classes" | "private";
  onMode: ((m: "classes" | "private") => void) | null;
  classCard: (c: TeachItem<"teachClasses">) => ReactNode;
  firstName: string;
}) {
  const agenda = days
    .map((d) =>
      mode === "classes"
        ? { date: d.date, classes: classesOn(data.classes, d.date, data.timezone), windows: [] as TeachItem<"teachAvailability">[] }
        : { date: d.date, classes: [] as TeachItem<"teachClasses">[], windows: availabilityOn(data.availability, d.date) }
    )
    .filter((d) => d.classes.length + d.windows.length > 0);
  const lastDay = days[days.length - 1]?.date ?? data.todayIso;
  const next = mode === "classes" && agenda.length === 0 ? nextUpcomingClass(data.classes, lastDay, data.timezone) : null;
  const { t } = createTranslator(data.locale);
  const anchor = (date: string) => `tt-day-${date}`;
  const jump = (date: string) => document.getElementById(anchor(date))?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="grid grid-cols-[280px_minmax(0,1fr)] gap-14 px-10" data-testid="schedule-agenda">
      <aside className="sticky top-24 self-start flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <Eyebrow>{t("teach", "nextTwoWeeksWith", { name: firstName })}</Eyebrow>
          <DisplayHeading as="h1" size={46}>
            {t("teach", "navSchedule")}
          </DisplayHeading>
        </div>
        {onMode ? <ScheduleModeTabs mode={mode} onMode={onMode} locale={data.locale} /> : null}
        {agenda.length > 0 ? (
          <nav aria-label={t("teach", "daysWithSessions")} className="flex flex-col">
            {agenda.map((d) => {
              const n = mode === "classes" ? d.classes.length : d.windows.length;
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => jump(d.date)}
                  className="flex items-center justify-between gap-3 min-h-11 px-3 text-[13.5px] text-start"
                  style={{ borderBottom: "1px solid var(--tt-line)", color: "var(--rbr-text)" }}
                >
                  <span className="font-medium">
                    {d.date === data.todayIso ? `${t("common", "today")} · ` : ""}
                    {formatShortDateLocalized(d.date, data.locale)}
                  </span>
                  <span className="text-[12px]" style={{ color: "var(--rbr-text-muted)" }}>
                    {n} {mode === "classes" ? (n === 1 ? "class" : "classes") : n === 1 ? "window" : "windows"}
                  </span>
                </button>
              );
            })}
          </nav>
        ) : null}
        <p className="text-[12px]" style={{ color: "var(--rbr-text-muted)" }}>
          {t("teach", "timesShownIn", { timezone: data.timezone })}
        </p>
      </aside>
      <div className="flex flex-col gap-12 min-w-0">
        {agenda.length === 0 ? (
          mode === "classes" ? (
            <EmptyState
              icon="calendar"
              title={data.classes.length ? t("teach", "noClassesTwoWeeks") : t("teach", "newClassesSoon")}
              body={next ? nextClassLine(next, data.locale) : undefined}
            />
          ) : (
            <EmptyState
              icon="user"
              title={t("teach", "noPrivateTwoWeeks")}
              body={data.availability.map((w) => describeAvailability(w.metadata, { locale: data.locale })).slice(0, 3).join(" · ")}
            />
          )
        ) : (
          agenda.map((d) => {
            const day = new Date(`${d.date}T12:00:00Z`);
            return (
              <section key={d.date} id={anchor(d.date)} aria-label={formatShortDateLocalized(d.date, data.locale)} className="grid grid-cols-[96px_minmax(0,1fr)] gap-8 scroll-mt-28">
                <div className="sticky top-24 self-start flex flex-col items-center py-3" style={{ background: d.date === data.todayIso ? "var(--rbr-primary-soft)" : "var(--tt-surface)", border: "1px solid var(--tt-line)", borderRadius: "var(--tt-radius-card)" }}>
                  <span className="text-[11px] font-semibold tracking-wider" style={{ color: "var(--rbr-text-muted)" }}>
                    {d.date === data.todayIso ? t("teach", "today") : shortWeekdayName(day.getUTCDay(), data.locale).toUpperCase()}
                  </span>
                  <span className="text-[34px] leading-none my-1" style={{ fontFamily: "var(--tt-font-display)" }}>
                    {day.getUTCDate()}
                  </span>
                  <span className="text-[11px] font-semibold tracking-wider" style={{ color: "var(--rbr-text-muted)" }}>
                    {MONTHS_SHORT[day.getUTCMonth()].toUpperCase()}
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  {mode === "classes"
                    ? d.classes.map(classCard)
                    : d.windows.map((w) => <TeachAvailabilityCard key={w.id} item={w} dateIso={d.date} teacherName={data.teacherName} contact={data.settings.teachContact} locale={data.locale} />)}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// About Me
// ---------------------------------------------------------------------------

/**
 * The About portrait's box, named so the prefetcher asks for the same
 * render this screen will (see EXPLORE_CARD_SIZES for why that matters).
 */
export const ABOUT_PORTRAIT_SIZES = "(min-width: 896px) 210px, 150px";

function AboutScreen({ data, url }: { data: TeachGuestData; url: (r: string | null) => string | null }) {
  const a = data.settings.teachAbout;
  const { t } = createTranslator(data.locale);
  const since = teachingSinceLabel(a.teachingSince, data.todayIso, data.locale);
  const photo = url(a.profile.imageRef) ?? url(data.heroImageRef);
  const focal = a.profile.imageRef ? a.profile.imagePosition : data.settings.teachProfile.heroImagePosition;
  const socials: { key: string; href: string; icon: TeachIconName; label: string }[] = [];
  for (const l of a.socialLinks) {
    const href = safeHttpUrl(l.url);
    if (href) socials.push({ key: l.platform, href, icon: SOCIAL_ICON[l.platform] ?? "globe", label: l.platform });
  }
  const wa = whatsappUrl(a.whatsapp);
  if (wa) socials.push({ key: "whatsapp", href: wa, icon: "chat", label: "WhatsApp" });
  const mail = mailtoUrl(a.email);
  if (mail) socials.push({ key: "email", href: mail, icon: "mail", label: t("common", "email") });

  return (
    <div className="flex flex-col gap-[var(--tt-section-gap)] w-full @min-[40rem]:max-w-[680px] @min-[40rem]:mx-auto @4xl:max-w-none @4xl:grid @4xl:grid-cols-[320px_minmax(0,1fr)] @4xl:gap-16 @4xl:px-10 @4xl:items-start">
      <header
        className="flex flex-col items-center text-center gap-3.5 px-6 pt-3 @4xl:sticky @4xl:top-24 @4xl:px-6 @4xl:py-8"
      >
        <TeachImage priority sizes={ABOUT_PORTRAIT_SIZES} src={photo} focal={focal} alt={data.teacherName} fallbackLabel={data.teacherName} className="w-[150px] h-[150px] @4xl:w-[210px] @4xl:h-[210px] rounded-full" style={{ border: "5px solid var(--tt-surface)", boxShadow: "0 18px 40px -22px rgba(36,59,50,.5)" }} />
        <div className="flex flex-col gap-1">
          <DisplayHeading as="h1" size={32}>
            {data.teacherName}
          </DisplayHeading>
          {data.settings.teachProfile.teacherType ? (
            <p className="text-[13.5px] font-medium" style={{ color: "var(--rbr-primary)" }}>
              {data.settings.teachProfile.teacherType}
            </p>
          ) : null}
          {since ? (
            <p className="text-[12.5px]" style={{ color: "var(--rbr-text-muted)" }}>
              {since}
            </p>
          ) : null}
        </div>
        {socials.length > 0 ? (
          <ul className="flex flex-wrap justify-center gap-2">
            {socials.map((s) => (
              <li key={s.key}>
                <a href={s.href} target={s.href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer" aria-label={s.label} className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "var(--tt-surface)", border: "1px solid var(--tt-line)", color: "var(--rbr-primary)" }}>
                  <TeachIcon name={s.icon} size={18} />
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </header>
      <div className="flex flex-col gap-[var(--tt-section-gap)] @4xl:gap-12 min-w-0">
        {a.philosophy ? (
          <div className="px-4 @4xl:px-0">
            <figure className="p-5 @4xl:p-8 flex flex-col gap-2" style={{ background: "var(--rbr-primary-soft)", borderRadius: "calc(var(--tt-radius-card) + 4px)" }}>
              <Eyebrow tone="primary">{t("teach", "teachingPhilosophy")}</Eyebrow>
              <blockquote dir="auto" className="text-[19px] @4xl:text-[26px] leading-[1.35] italic" style={{ fontFamily: "var(--tt-font-display)" }}>
                “{a.philosophy}”
              </blockquote>
            </figure>
          </div>
        ) : null}
        {a.about ? (
          <section className="px-6 @4xl:px-0 flex flex-col gap-2.5">
            <SectionHeader title={t("teach", "aboutMe")} />
            <p dir="auto" className="text-[14.5px] @4xl:text-[16px] leading-[1.65] @4xl:leading-[1.75] whitespace-pre-line @4xl:max-w-[68ch]" style={{ color: "var(--rbr-text-muted)" }}>
              {a.about}
            </p>
          </section>
        ) : null}
        {a.styles.length > 0 ? (
          <section className="px-6 @4xl:px-0 flex flex-col gap-2.5">
            <SectionHeader title={t("teach", "stylesITeach")} />
            <div className="flex flex-wrap gap-2">
              {a.styles.map((st) => (
                <Chip key={st}>{st}</Chip>
              ))}
            </div>
          </section>
        ) : null}
        {data.gallery.length > 0 ? (
          <section className="px-4 @4xl:px-0 flex flex-col gap-2.5">
            <div className="px-2 @4xl:px-0">
              <SectionHeader title={t("common", "gallery")} />
            </div>
            <div className="grid grid-cols-2 @xl:grid-cols-3 gap-2 @4xl:gap-3">
              {data.gallery.map((g, i) => (
                <TeachImage
                  key={g.id}
                  src={url(g.imageRef)}
                  focal={g.metadata.imagePosition}
                  alt={g.title || t("teach", "galleryPhoto", { index: i + 1 })}
                  sizes={TEACH_SIZES.gallery}
                  className={`w-full ${i % 3 === 0 ? "h-[220px] @4xl:h-[300px]" : "h-[140px] @4xl:h-[200px]"}`}
                  style={{ borderRadius: "var(--tt-radius-image)" }}
                />
              ))}
            </div>
          </section>
        ) : null}
        {data.certificates.length > 0 ? (
          <section className="px-4 @4xl:px-0 flex flex-col gap-2.5">
            <div className="px-2 @4xl:px-0">
              <SectionHeader title={t("teach", "trainingCerts")} />
            </div>
            <ul className="flex flex-col gap-2.5 @4xl:grid @4xl:grid-cols-2 @4xl:gap-3">
              {data.certificates.map((c) => (
                <li key={c.id} className="flex items-center gap-3 p-3.5" style={{ background: "var(--tt-surface)", border: "1px solid var(--tt-line)", borderRadius: "var(--tt-radius-card)" }}>
                  {c.imageRef && url(c.imageRef) ? (
                    <TeachImage src={url(c.imageRef)} focal={c.metadata.imagePosition} alt="" sizes={TEACH_SIZES.certificate} className="w-12 h-12 shrink-0" style={{ borderRadius: "calc(var(--tt-radius-image) - 4px)" }} />
                  ) : (
                    <span className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--rbr-secondary-soft)", color: "var(--rbr-secondary-foreground)" }}>
                      <TeachIcon name="award" size={19} />
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span dir="auto" className="block text-[13.5px] font-semibold" style={{ color: "var(--rbr-text)" }}>
                      {c.title}
                    </span>
                    {c.subtitle || c.description ? (
                      <span className="block text-[12px]" style={{ color: "var(--rbr-text-muted)" }}>
                        {[c.subtitle, c.description].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
                  </span>
                  {c.metadata.year ? (
                    <span className="text-[12px] font-semibold" style={{ color: "var(--rbr-text-muted)" }}>
                      {c.metadata.year}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Explore
// ---------------------------------------------------------------------------

/**
 * The Explore tiles' boxes, as `sizes` the prefetcher can also read.
 *
 * Exported for exactly one reason: lib/media/prefetch.ts warms these
 * covers before the Explore tab is pressed, and it has to select from
 * the same candidate set this card will, or the warmed render is the
 * wrong one and the visitor pays twice. One constant, both readers.
 *
 * TWO constants, because the Readings card is `feature` and spans two of
 * the three desktop columns. CP4's browser matrix caught a single
 * `sizes` under-claiming it by half at 1440px - a 727px box asking for a
 * 960px render where it needed 1600 - which is the one failure mode that
 * is actually VISIBLE, as a soft image, rather than merely wasteful.
 *
 * Expressed in px above @4xl rather than vw because the main column is
 * capped at 1180px there, so a vw fraction would keep growing after the
 * box has stopped. Below that the grid is sized by CONTAINER queries,
 * which `sizes` - a viewport media query - cannot express exactly, so
 * these are the viewport widths those container widths correspond to in
 * the published layout, rounded UP. Over-claiming costs a slightly
 * larger render; under-claiming costs sharpness, so the rounding only
 * ever goes one way.
 */
export const EXPLORE_CARD_SIZES = "(min-width: 896px) 360px, (min-width: 576px) 50vw, 100vw";

/** The lead tile: two of three columns, plus the gap between them. */
export const EXPLORE_FEATURE_CARD_SIZES = "(min-width: 896px) 740px, (min-width: 576px) 50vw, 100vw";

function ExploreCard({
  title,
  subtitle,
  icon,
  image,
  focal,
  fallback,
  onClick,
  tall = false,
  feature = false,
}: {
  title: string;
  subtitle: string | null;
  icon: TeachIconName;
  image: string | null;
  focal: FocalPoint | null;
  fallback: string;
  onClick: () => void;
  tall?: boolean;
  /** Desktop only: spans two columns as the lead tile. */
  feature?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tt-reveal relative overflow-hidden text-start w-full ${tall ? "h-[200px]" : "h-[170px]"} @min-[40rem]:h-[220px] @4xl:h-[300px] ${feature ? "@4xl:col-span-2" : ""}`}
      style={{ borderRadius: "calc(var(--tt-radius-card) + 4px)" }}
    >
      {/* 028D: these four cards were the last Guest media still painted
          as a CSS background-image. A background cannot carry a srcset,
          so each card was pulling the organizer's full-resolution
          original - on a phone, a ~1600px file into a ~180px tile. Now
          they go through the same primitive as everything else, which
          also makes them predictable enough to warm ahead of a tab
          press (see EXPLORE_CARD_SIZES). The wrapping span owns the
          positioning so the fallback surface and the image land
          identically. */}
      <span aria-hidden="true" className="absolute inset-0">
        <TeachImage
          src={image}
          focal={focal}
          alt=""
          sizes={feature ? EXPLORE_FEATURE_CARD_SIZES : EXPLORE_CARD_SIZES}
          fallback={fallback}
          className="w-full h-full"
        />
      </span>
      <span aria-hidden="true" className="absolute inset-0" style={{ background: image ? "linear-gradient(180deg, transparent 35%, rgb(20 30 25 / calc(var(--tt-overlay) + 0.3)))" : "transparent" }} />
      <span className="absolute top-4 end-4 w-9 h-9 rounded-full flex items-center justify-center text-white" style={{ background: "rgb(255 255 255 / 0.22)" }}>
        <TeachIcon name={icon} size={17} />
      </span>
      <span className="absolute start-5 end-5 bottom-4 @4xl:start-7 @4xl:end-7 @4xl:bottom-6 flex flex-col gap-1 [--tt-tile-title:24px] @4xl:[--tt-tile-title:30px]">
        {/* Mixed content: both of these are the organizer's own words
            when they have filled the card in, and a system fallback when
            they have not - so each reads its own direction instead of
            inheriting the Space's. */}
        {subtitle ? <Eyebrow userContent tone="light">{subtitle}</Eyebrow> : null}
        <span dir="auto" className="text-white leading-tight" style={{ fontFamily: "var(--tt-font-display)", fontSize: "calc(var(--tt-tile-title) * var(--tt-display-scale, 1))" }}>
          {title}
        </span>
      </span>
    </button>
  );
}

function ExploreScreen({ data, url, open }: { data: TeachGuestData; url: (r: string | null) => string | null; open: (p: Page) => void }) {
  // A card title the teacher typed is user content and is never
  // translated; only the FALLBACK label is.
  const { t } = createTranslator(data.locale);
  const cards = data.settings.teachExplore.cards;
  const on = (k: TeachExploreModule) => exploreModuleStatus(data, k) === "visible";
  const tiles: ReactNode[] = [];
  const fb = (c: string | null | undefined, v: string) => c ?? v;
  if (on("teachReadings")) {
    const c = cards.teachReadings;
    tiles.push(<ExploreCard key="r" tall feature title={c?.title ?? t("teach", "exploreReadings")} subtitle={c?.subtitle ?? t("teach", "readingsEyebrow")} icon="book" image={url(c?.imageRef ?? null)} focal={c?.imagePosition ?? null} fallback={fb(c?.fallbackColor, "var(--rbr-primary)")} onClick={() => open({ kind: "readings" })} />);
  }
  if (on("teachAudio")) {
    const c = cards.teachAudio;
    tiles.push(<ExploreCard key="a" tall title={c?.title ?? t("teach", "exploreAudio")} subtitle={c?.subtitle ?? t("teach", "audioEyebrow")} icon="headphones" image={url(c?.imageRef ?? null)} focal={c?.imagePosition ?? null} fallback={fb(c?.fallbackColor, "var(--rbr-primary-dark)")} onClick={() => open({ kind: "audio" })} />);
  }
  if (on("teachContact")) {
    const c = cards.teachContact;
    tiles.push(<ExploreCard key="c" title={c?.title ?? t("teach", "contactCardTitle")} subtitle={c?.subtitle ?? t("teach", "contactCardSubtitle")} icon="chat" image={url(c?.imageRef ?? null)} focal={c?.imagePosition ?? null} fallback={fb(c?.fallbackColor, "var(--rbr-secondary-dark)")} onClick={() => open({ kind: "contact" })} />);
  }
  if (on("customPages")) {
    for (const p of data.customPages) {
      tiles.push(<ExploreCard key={p.id} title={p.title} subtitle={p.subtitle} icon="page" image={url(p.imageRef)} focal={p.metadata.imagePosition} fallback={fb(p.metadata.fallbackColor, "var(--rbr-secondary-dark)")} onClick={() => open({ kind: "page", id: p.id })} />);
    }
  }
  return (
    <div className="flex flex-col gap-4 @min-[40rem]:gap-6 px-4 @min-[40rem]:px-6 @4xl:px-10">
      <header className="px-2 @min-[40rem]:px-0 flex flex-col gap-1">
        <Eyebrow>{t("teach", "moreFrom", { name: data.teacherName.split(" ")[0] || data.teacherName })}</Eyebrow>
        <DisplayHeading as="h1" className="[--tt-h1:32px] @min-[40rem]:[--tt-h1:42px] @4xl:[--tt-h1:46px]" style={{ fontSize: "calc(var(--tt-h1) * var(--tt-display-scale, 1))" }}>
          {t("teach", "exploreHeading")}
        </DisplayHeading>
      </header>
      {tiles.length > 0 ? <div className="grid gap-3 @xl:grid-cols-2 @min-[40rem]:gap-4 @4xl:grid-cols-3 @4xl:gap-5">{tiles}</div> : <EmptyState icon="compass" title={t("teach", "exploreEmpty")} body={t("teach", "exploreEmptyBody")} />}
    </div>
  );
}
