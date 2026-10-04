"use client";

import { cardImage } from "@/lib/teach/cardImage";
import { useCallback, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from "react";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import { getDailyQuoteFrom } from "@/lib/content/dailyQuotes";
import type { TeachGuestData } from "@/lib/teach/guestData";
import type { TeachExploreModule, TeachItem } from "@/lib/teach/schemas";
import { exploreModuleStatus } from "@/lib/teach/moduleVisibility";
import { teachStyleVars, textureBackground } from "@/lib/teach/style";
import { TEACH_FONT_VARIABLES } from "@/lib/teach/fonts";
import { safeHttpUrl, whatsappUrl, mailtoUrl, contactEntries, formatShortDate } from "@/lib/teach/links";
import {
  availabilityOn,
  buildScheduleDays,
  classesOn,
  describeAvailability,
  isClassPast,
  nextUpcomingClass,
  teachingSinceLabel,
  WEEKDAY_LABELS,
} from "@/lib/teach/schedule";
import { TeachIcon, type TeachIconName } from "./teach-icons";
import { TeachImage } from "./teach-image";
import { TeachClassCard, TeachAvailabilityCard } from "./teach-class-card";
import {
  AudioListScreen,
  AudioPlayerScreen,
  ContactScreen,
  CustomPageScreen,
  ReadingDetailScreen,
  ReadingsScreen,
  coverStyle,
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

const TABS: { key: Tab; label: string; icon: TeachIconName }[] = [
  { key: "home", label: "Home", icon: "home" },
  { key: "schedule", label: "Schedule", icon: "calendar" },
  { key: "about", label: "About Me", icon: "user" },
  { key: "explore", label: "Explore", icon: "compass" },
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

function exploreTitle(data: TeachGuestData, key: "teachReadings" | "teachAudio" | "teachContact", fallback: string) {
  return data.settings.teachExplore.cards[key]?.title ?? fallback;
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

  const tabs = visibleTabs(data);
  // A hidden About tab can't stay selected (e.g. the Studio preview was on it when the teacher turned it off).
  const tab = tabs.some((t) => t.key === selectedTab) ? selectedTab : "home";

  const url = (ref: string | null | undefined) => (ref ? (data.mediaUrls[ref] ?? null) : null);

  let body: ReactNode;
  if (page?.kind === "readings") body = <ReadingsScreen data={data} onBack={back} onOpen={(id) => open({ kind: "reading", id })} title={exploreTitle(data, "teachReadings", "My Readings")} />;
  else if (page?.kind === "reading") {
    const item = data.readings.find((r) => r.id === page.id);
    body = item ? <ReadingDetailScreen data={data} item={item} onBack={back} /> : null;
  } else if (page?.kind === "audio") body = <AudioListScreen data={data} onBack={back} onOpen={(id) => open({ kind: "track", id })} title={exploreTitle(data, "teachAudio", "My Audio")} />;
  else if (page?.kind === "track") {
    const item = data.audio.find((a) => a.id === page.id);
    body = item ? <AudioPlayerScreen key={item.id} data={data} item={item} onBack={back} /> : null;
  } else if (page?.kind === "contact") body = <ContactScreen data={data} onBack={back} backLabel={tab === "home" ? "Home" : "Explore"} />;
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
      className={`tt-root ${TEACH_FONT_VARIABLES} @container relative flex flex-col ${embedded ? "h-full" : "min-h-dvh"}`}
      style={{
        ...vars,
        background: "var(--tt-bg)",
        backgroundImage: textureBackground(style.texture),
        color: "var(--rbr-text)",
        fontFamily: "var(--tt-font-body)",
      }}
      data-testid="teach-guest-app"
    >
      <style>{TEACH_CSS}</style>
      <DesktopTopNav data={data} tabs={tabs} tab={tab} onTab={goTab} url={url} />
      <div ref={scrollRef} className={`relative flex-1 ${embedded ? "overflow-y-auto overflow-x-hidden" : ""}`}>
        {style.organicShapes && !page ? <OrganicShapes /> : null}
        <main className="relative w-full mx-auto @4xl:max-w-[1180px] pt-2 @min-[40rem]:pt-6 @4xl:pt-10 pb-6 @min-[40rem]:pb-16">{body}</main>
      </div>
      <nav
        aria-label="Main"
        className="@min-[40rem]:hidden sticky bottom-0 z-20 flex justify-around px-2 pt-2 pb-[max(env(safe-area-inset-bottom),14px)]"
        style={{ background: "rgb(253 250 244 / 0.96)", borderTop: "1px solid var(--tt-line)", backdropFilter: "blur(10px)" }}
      >
        {tabs.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => goTab(t.key)}
              aria-current={active ? "page" : undefined}
              className="flex flex-col items-center gap-1 min-w-[64px] min-h-11 pt-1"
              style={{ color: active ? "var(--rbr-navigation)" : "var(--rbr-mist)" }}
            >
              <TeachIcon name={t.icon} size={22} strokeWidth={active ? 1.9 : 1.5} />
              <span className="text-[10.5px]" style={{ fontWeight: active ? 600 : 500 }}>
                {t.label}
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
  const contact = contactEntries(data.settings.teachContact);
  const primary = contact.find((e) => e.method === data.settings.teachContact.primary) ?? contact[0] ?? null;
  return (
    <header className="hidden @min-[40rem]:flex sticky top-0 z-20 items-center justify-between gap-4 px-6 @4xl:px-12 py-3 @4xl:py-4" style={{ background: "rgb(253 250 244 / 0.95)", borderBottom: "1px solid var(--tt-line)", backdropFilter: "blur(10px)" }}>
      <button type="button" onClick={() => onTab("home")} className="flex items-center gap-3">
        <TeachImage src={url(data.settings.teachAbout.profile.imageRef) ?? url(data.heroImageRef)} focal={data.settings.teachAbout.profile.imagePosition ?? data.settings.teachProfile.heroImagePosition} alt="" fallbackLabel={data.teacherName} className="w-9 h-9 rounded-full" />
        <span className="text-[19px] @4xl:text-[22px] truncate" style={{ fontFamily: "var(--tt-font-display)" }}>
          {data.teacherName}
        </span>
      </button>
      <nav aria-label="Main" className="flex items-center gap-5 @4xl:gap-7 shrink-0">
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => onTab(t.key)} aria-current={t.key === tab ? "page" : undefined} className="flex flex-col items-center gap-1 text-[14px] min-h-11 justify-center" style={{ color: t.key === tab ? "var(--rbr-navigation)" : "var(--rbr-text-muted)", fontWeight: t.key === tab ? 600 : 500 }}>
            {t.label}
            <span className="w-4 h-0.5 rounded-full" style={{ background: t.key === tab ? "var(--rbr-navigation)" : "transparent" }} />
          </button>
        ))}
        {primary ? (
          <PillLink href={primary.href} className="!min-h-10 !px-4">
            Contact
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
  const layout = data.settings.teachStyle.heroLayout;
  const src = url(data.heroImageRef);
  const fullbleed = layout === "fullbleed";
  const identity = (light: boolean) => (
    <div className={`flex flex-col gap-1.5 @min-[40rem]:gap-2 ${fullbleed ? "" : "items-center text-center @min-[40rem]:items-start @min-[40rem]:text-left"}`}>
      {p.greeting ? (
        <p className="text-[13px] @min-[40rem]:text-[15px] italic" style={{ color: light ? "rgba(255,255,255,.9)" : "var(--rbr-text-muted)", fontFamily: "var(--tt-font-display)" }}>
          {p.greeting}
        </p>
      ) : null}
      {p.teacherType ? <Eyebrow tone={light ? "light" : "primary"}>{p.teacherType}</Eyebrow> : null}
      <DisplayHeading
        as="h1"
        className="[--tt-hero-name:38px] @min-[40rem]:[--tt-hero-name:52px] @4xl:[--tt-hero-name:66px] @4xl:leading-[1.05]"
        style={{ fontSize: "calc(var(--tt-hero-name) * var(--tt-display-scale, 1))", ...(light ? { color: "#fff" } : null) }}
      >
        {data.teacherName}
      </DisplayHeading>
      {p.locationLine ? (
        <p className="text-[12.5px] @min-[40rem]:text-[14px]" style={{ color: light ? "rgba(255,255,255,.85)" : "var(--rbr-text-muted)" }}>
          {p.locationLine}
        </p>
      ) : null}
      {/* Tablet/desktop only: the hero carries the two main actions. On a
          phone they stay where they were (bottom nav + "Get in touch"). */}
      <div className="hidden @min-[40rem]:flex flex-wrap gap-3 mt-4">
        <PillButton onClick={onSchedule} icon="calendar" className="!w-auto !px-6">
          See the schedule
        </PillButton>
        {onContact ? (
          <PillButton onClick={onContact} kind={light ? "light" : "soft"} icon="chat" className="!w-auto !px-6">
            Get in touch
          </PillButton>
        ) : null}
      </div>
    </div>
  );
  if (fullbleed) {
    return (
      <div className="relative h-[360px] @min-[40rem]:h-[460px] @4xl:h-[560px] overflow-hidden -mt-2 @min-[40rem]:mt-0 @min-[40rem]:mx-6 @4xl:mx-10 @min-[40rem]:rounded-[var(--tt-radius-card)]">
        <TeachImage src={src} focal={p.heroImagePosition} alt={`${data.teacherName}`} fallbackLabel={data.teacherName} className="absolute inset-0 w-full h-full" />
        <div aria-hidden="true" className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgb(20 30 25 / calc(var(--tt-overlay) * .4)) 0%, rgb(20 30 25 / calc(var(--tt-overlay) + .3)) 100%)" }} />
        <div className="absolute left-6 right-6 bottom-6 @min-[40rem]:left-10 @min-[40rem]:right-10 @min-[40rem]:bottom-10 @4xl:left-14 @4xl:bottom-14 @4xl:max-w-[640px]">{identity(true)}</div>
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
      <TeachImage src={src} focal={p.heroImagePosition} alt={`${data.teacherName}`} fallbackLabel={data.teacherName} className={`shrink-0 @min-[40rem]:order-last ${imgClass}`} style={imgStyle} />
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
          <DailyQuoteBlock quote={quote} style={s.teachStyle} attribution={`Today’s inspiration · from ${firstName}`} />
        </div>
      ) : null}
      {sections.contact && contactOn ? (
        <div className="px-4 @min-[40rem]:hidden">
          <PillButton onClick={() => open({ kind: "contact" })} icon="chat" className="w-full">
            Get in touch
          </PillButton>
        </div>
      ) : null}

      {sections.today ? (
        <section aria-labelledby="tt-today" className={`flex flex-col gap-3 @min-[40rem]:gap-4 ${pad}`}>
          <div id="tt-today">
            <SectionHeader title="Today’s classes" action={formatShortDate(data.todayIso)} />
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
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No classes today"
              body={next ? `Next: ${next.title} · ${formatShortDate(next.metadata.startDate)} ${next.metadata.startTime}` : "New classes coming soon."}
              action={
                <PillButton kind="soft" icon="calendar" onClick={() => goTab("schedule")}>
                  See full schedule
                </PillButton>
              }
            />
          )}
        </section>
      ) : null}

      {showPrivate || showLibrary ? (
        <div className={`flex flex-col gap-[var(--tt-section-gap)] @min-[40rem]:gap-12 @4xl:grid @4xl:gap-10 @4xl:items-start ${showPrivate && showLibrary ? "@4xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : ""}`}>
          {showPrivate ? (
            <section className={`${pad} @4xl:pr-0 @4xl:flex @4xl:flex-col @4xl:gap-4`}>
              <div className="hidden @4xl:block">
                <SectionHeader title="One-to-one" />
              </div>
              <button type="button" onClick={() => goTab("schedule")} className="tt-reveal w-full text-left flex items-center gap-3.5 p-4 @min-[40rem]:p-6" style={{ background: "var(--rbr-primary-soft)", borderRadius: "var(--tt-radius-card)" }}>
                <span className="flex-1 flex flex-col gap-1">
                  <Eyebrow tone="primary">One-to-one</Eyebrow>
                  <DisplayHeading as="h2" size={18}>
                    Private sessions this week
                  </DisplayHeading>
                  <span className="text-[12.5px]" style={{ color: "var(--rbr-text-muted)" }}>
                    {weekWindows
                      .slice(0, 3)
                      .map((w) => describeAvailability(w.metadata).replace("Every ", ""))
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
            <section className={`flex flex-col gap-3 @min-[40rem]:gap-4 ${pad} ${showPrivate ? "@4xl:pl-0" : ""}`}>
              <SectionHeader title={`From ${firstName}`} />
              <div className="grid grid-cols-2 gap-2.5 @min-[40rem]:gap-4">
                {latestReading ? (
                  <button type="button" onClick={() => open({ kind: "reading", id: latestReading.id })} className="tt-reveal text-left overflow-hidden flex flex-col" style={{ background: "var(--tt-surface)", border: "1px solid var(--tt-line)", borderRadius: "var(--tt-radius-card)" }}>
                    <TeachImage {...cardImage(data, "teachReadings", latestReading)} alt="" fallbackLabel={latestReading.title} className="w-full h-[110px] @min-[40rem]:h-[170px]" />
                    <span className="p-3 @min-[40rem]:p-4 flex flex-col gap-1">
                      <Eyebrow tone="primary">Reading</Eyebrow>
                      <span className="text-[15px] @min-[40rem]:text-[18px] leading-tight line-clamp-2" style={{ fontFamily: "var(--tt-font-display)" }}>
                        {latestReading.title}
                      </span>
                    </span>
                  </button>
                ) : null}
                {latestAudio ? (
                  <button type="button" onClick={() => open({ kind: "track", id: latestAudio.id })} className="tt-reveal text-left overflow-hidden flex flex-col" style={{ background: "var(--tt-surface)", border: "1px solid var(--tt-line)", borderRadius: "var(--tt-radius-card)" }}>
                    <TeachImage {...cardImage(data, "teachAudio", latestAudio)} alt="" fallbackLabel={latestAudio.title} className="w-full h-[110px] @min-[40rem]:h-[170px]" />
                    <span className="p-3 @min-[40rem]:p-4 flex flex-col gap-1">
                      <Eyebrow tone="primary">Listen</Eyebrow>
                      <span className="text-[15px] @min-[40rem]:text-[18px] leading-tight line-clamp-2" style={{ fontFamily: "var(--tt-font-display)" }}>
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

function ScheduleModeTabs({ mode, onMode, className = "" }: { mode: "classes" | "private"; onMode: (m: "classes" | "private") => void; className?: string }) {
  return (
    <div role="tablist" aria-label="Schedule type" className={`grid grid-cols-2 p-1 ${className}`} style={{ background: "rgb(0 0 0 / 0.05)", borderRadius: "var(--tt-radius-pill)" }}>
      {(
        [
          ["classes", "Group classes"],
          ["private", "Private sessions"],
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
          <Eyebrow>{`This week with ${firstName}`}</Eyebrow>
          <DisplayHeading as="h1" className="[--tt-h1:32px] @min-[40rem]:[--tt-h1:42px]" style={{ fontSize: "calc(var(--tt-h1) * var(--tt-display-scale, 1))" }}>
            Schedule
          </DisplayHeading>
        </div>
        {hasPrivate ? <ScheduleModeTabs mode={mode} onMode={onMode} className="@min-[40rem]:w-[360px] @min-[40rem]:shrink-0" /> : null}
      </header>
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-5 @min-[40rem]:px-6" role="listbox" aria-label="Choose a day">
        {days.map((d) => {
          const active = d.date === date;
          const count = mode === "classes" ? d.classCount : d.availabilityCount;
          const wd = WEEKDAY_LABELS[new Date(`${d.date}T12:00:00Z`).getUTCDay()].slice(0, 3).toUpperCase();
          return (
            <button
              key={d.date}
              type="button"
              role="option"
              aria-selected={active}
              aria-label={`${formatShortDate(d.date)}${count ? `, ${count} ${mode === "classes" ? "classes" : "windows"}` : ""}`}
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
          {formatShortDate(date)}
          {mode === "classes" ? ` · ${classes.length} ${classes.length === 1 ? "class" : "classes"}` : ""}
        </p>
        {mode === "classes" ? (
          classes.length > 0 ? (
            <div className="grid gap-3 @min-[40rem]:grid-cols-2 @min-[40rem]:gap-4 items-start">{classes.map(classCard)}</div>
          ) : (
            <EmptyState
              icon="calendar"
              title={data.classes.length ? "No classes on this day" : "New classes coming soon"}
              body={next ? `Next: ${next.title} · ${formatShortDate(next.metadata.startDate)} ${next.metadata.startTime}` : undefined}
              action={next ? <PillButton kind="soft" onClick={() => setSelected(next.metadata.startDate)}>Go to {formatShortDate(next.metadata.startDate)}</PillButton> : undefined}
            />
          )
        ) : windows.length > 0 ? (
          <div className="grid gap-3 @min-[40rem]:grid-cols-2 @min-[40rem]:gap-4 items-start">
            {windows.map((w) => (
              <TeachAvailabilityCard key={w.id} item={w} dateIso={date} teacherName={data.teacherName} contact={data.settings.teachContact} />
            ))}
          </div>
        ) : (
          <EmptyState icon="user" title="No private windows this day" body={data.availability.map((w) => describeAvailability(w.metadata)).slice(0, 3).join(" · ")} />
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
  const anchor = (date: string) => `tt-day-${date}`;
  const jump = (date: string) => document.getElementById(anchor(date))?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="grid grid-cols-[280px_minmax(0,1fr)] gap-14 px-10" data-testid="schedule-agenda">
      <aside className="sticky top-24 self-start flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <Eyebrow>{`The next two weeks with ${firstName}`}</Eyebrow>
          <DisplayHeading as="h1" size={46}>
            Schedule
          </DisplayHeading>
        </div>
        {onMode ? <ScheduleModeTabs mode={mode} onMode={onMode} /> : null}
        {agenda.length > 0 ? (
          <nav aria-label="Days with sessions" className="flex flex-col">
            {agenda.map((d) => {
              const n = mode === "classes" ? d.classes.length : d.windows.length;
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => jump(d.date)}
                  className="flex items-center justify-between gap-3 min-h-11 px-3 text-[13.5px] text-left"
                  style={{ borderBottom: "1px solid var(--tt-line)", color: "var(--rbr-text)" }}
                >
                  <span className="font-medium">
                    {d.date === data.todayIso ? "Today · " : ""}
                    {formatShortDate(d.date)}
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
          Times are shown in {data.timezone}.
        </p>
      </aside>
      <div className="flex flex-col gap-12 min-w-0">
        {agenda.length === 0 ? (
          mode === "classes" ? (
            <EmptyState
              icon="calendar"
              title={data.classes.length ? "No classes in the next two weeks" : "New classes coming soon"}
              body={next ? `Next: ${next.title} · ${formatShortDate(next.metadata.startDate)} ${next.metadata.startTime}` : undefined}
            />
          ) : (
            <EmptyState icon="user" title="No private windows in the next two weeks" body={data.availability.map((w) => describeAvailability(w.metadata)).slice(0, 3).join(" · ")} />
          )
        ) : (
          agenda.map((d) => {
            const day = new Date(`${d.date}T12:00:00Z`);
            return (
              <section key={d.date} id={anchor(d.date)} aria-label={formatShortDate(d.date)} className="grid grid-cols-[96px_minmax(0,1fr)] gap-8 scroll-mt-28">
                <div className="sticky top-24 self-start flex flex-col items-center py-3" style={{ background: d.date === data.todayIso ? "var(--rbr-primary-soft)" : "var(--tt-surface)", border: "1px solid var(--tt-line)", borderRadius: "var(--tt-radius-card)" }}>
                  <span className="text-[11px] font-semibold tracking-wider" style={{ color: "var(--rbr-text-muted)" }}>
                    {d.date === data.todayIso ? "TODAY" : WEEKDAY_LABELS[day.getUTCDay()].slice(0, 3).toUpperCase()}
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
                    : d.windows.map((w) => <TeachAvailabilityCard key={w.id} item={w} dateIso={d.date} teacherName={data.teacherName} contact={data.settings.teachContact} />)}
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

function AboutScreen({ data, url }: { data: TeachGuestData; url: (r: string | null) => string | null }) {
  const a = data.settings.teachAbout;
  const since = teachingSinceLabel(a.teachingSince, data.todayIso);
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
  if (mail) socials.push({ key: "email", href: mail, icon: "mail", label: "Email" });

  return (
    <div className="flex flex-col gap-[var(--tt-section-gap)] w-full @min-[40rem]:max-w-[680px] @min-[40rem]:mx-auto @4xl:max-w-none @4xl:grid @4xl:grid-cols-[320px_minmax(0,1fr)] @4xl:gap-16 @4xl:px-10 @4xl:items-start">
      <header
        className="flex flex-col items-center text-center gap-3.5 px-6 pt-3 @4xl:sticky @4xl:top-24 @4xl:px-6 @4xl:py-8"
      >
        <TeachImage src={photo} focal={focal} alt={data.teacherName} fallbackLabel={data.teacherName} className="w-[150px] h-[150px] @4xl:w-[210px] @4xl:h-[210px] rounded-full" style={{ border: "5px solid var(--tt-surface)", boxShadow: "0 18px 40px -22px rgba(36,59,50,.5)" }} />
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
              <Eyebrow tone="primary">Teaching philosophy</Eyebrow>
              <blockquote className="text-[19px] @4xl:text-[26px] leading-[1.35] italic" style={{ fontFamily: "var(--tt-font-display)" }}>
                “{a.philosophy}”
              </blockquote>
            </figure>
          </div>
        ) : null}
        {a.about ? (
          <section className="px-6 @4xl:px-0 flex flex-col gap-2.5">
            <SectionHeader title="About me" />
            <p className="text-[14.5px] @4xl:text-[16px] leading-[1.65] @4xl:leading-[1.75] whitespace-pre-line @4xl:max-w-[68ch]" style={{ color: "var(--rbr-text-muted)" }}>
              {a.about}
            </p>
          </section>
        ) : null}
        {a.styles.length > 0 ? (
          <section className="px-6 @4xl:px-0 flex flex-col gap-2.5">
            <SectionHeader title="Styles I teach" />
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
              <SectionHeader title="Gallery" />
            </div>
            <div className="grid grid-cols-2 @xl:grid-cols-3 gap-2 @4xl:gap-3">
              {data.gallery.map((g, i) => (
                <TeachImage
                  key={g.id}
                  src={url(g.imageRef)}
                  focal={g.metadata.imagePosition}
                  alt={g.title || `Gallery photo ${i + 1}`}
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
              <SectionHeader title="Training & certificates" />
            </div>
            <ul className="flex flex-col gap-2.5 @4xl:grid @4xl:grid-cols-2 @4xl:gap-3">
              {data.certificates.map((c) => (
                <li key={c.id} className="flex items-center gap-3 p-3.5" style={{ background: "var(--tt-surface)", border: "1px solid var(--tt-line)", borderRadius: "var(--tt-radius-card)" }}>
                  {c.imageRef && url(c.imageRef) ? (
                    <TeachImage src={url(c.imageRef)} focal={c.metadata.imagePosition} alt="" className="w-12 h-12 shrink-0" style={{ borderRadius: "calc(var(--tt-radius-image) - 4px)" }} />
                  ) : (
                    <span className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--rbr-secondary-soft)", color: "var(--rbr-secondary-foreground)" }}>
                      <TeachIcon name="award" size={19} />
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] font-semibold" style={{ color: "var(--rbr-text)" }}>
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
  focal: Parameters<typeof coverStyle>[1];
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
      className={`tt-reveal relative overflow-hidden text-left w-full ${tall ? "h-[200px]" : "h-[170px]"} @min-[40rem]:h-[220px] @4xl:h-[300px] ${feature ? "@4xl:col-span-2" : ""}`}
      style={{ borderRadius: "calc(var(--tt-radius-card) + 4px)", ...coverStyle(image, focal, fallback) }}
    >
      <span aria-hidden="true" className="absolute inset-0" style={{ background: image ? "linear-gradient(180deg, transparent 35%, rgb(20 30 25 / calc(var(--tt-overlay) + 0.3)))" : "transparent" }} />
      <span className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center text-white" style={{ background: "rgb(255 255 255 / 0.22)" }}>
        <TeachIcon name={icon} size={17} />
      </span>
      <span className="absolute left-5 right-5 bottom-4 @4xl:left-7 @4xl:right-7 @4xl:bottom-6 flex flex-col gap-1 [--tt-tile-title:24px] @4xl:[--tt-tile-title:30px]">
        {subtitle ? <Eyebrow tone="light">{subtitle}</Eyebrow> : null}
        <span className="text-white leading-tight" style={{ fontFamily: "var(--tt-font-display)", fontSize: "calc(var(--tt-tile-title) * var(--tt-display-scale, 1))" }}>
          {title}
        </span>
      </span>
    </button>
  );
}

function ExploreScreen({ data, url, open }: { data: TeachGuestData; url: (r: string | null) => string | null; open: (p: Page) => void }) {
  const cards = data.settings.teachExplore.cards;
  const on = (k: TeachExploreModule) => exploreModuleStatus(data, k) === "visible";
  const tiles: ReactNode[] = [];
  const fb = (c: string | null | undefined, v: string) => c ?? v;
  if (on("teachReadings")) {
    const c = cards.teachReadings;
    tiles.push(<ExploreCard key="r" tall feature title={c?.title ?? "My Readings"} subtitle={c?.subtitle ?? "Reflections & articles"} icon="book" image={url(c?.imageRef ?? null)} focal={c?.imagePosition ?? null} fallback={fb(c?.fallbackColor, "var(--rbr-primary)")} onClick={() => open({ kind: "readings" })} />);
  }
  if (on("teachAudio")) {
    const c = cards.teachAudio;
    tiles.push(<ExploreCard key="a" tall title={c?.title ?? "My Audio"} subtitle={c?.subtitle ?? "Practices to listen to"} icon="headphones" image={url(c?.imageRef ?? null)} focal={c?.imagePosition ?? null} fallback={fb(c?.fallbackColor, "var(--rbr-primary-dark)")} onClick={() => open({ kind: "audio" })} />);
  }
  if (on("teachContact")) {
    const c = cards.teachContact;
    tiles.push(<ExploreCard key="c" title={c?.title ?? "Contact"} subtitle={c?.subtitle ?? "How to reach me"} icon="chat" image={url(c?.imageRef ?? null)} focal={c?.imagePosition ?? null} fallback={fb(c?.fallbackColor, "var(--rbr-secondary-dark)")} onClick={() => open({ kind: "contact" })} />);
  }
  if (on("customPages")) {
    for (const p of data.customPages) {
      tiles.push(<ExploreCard key={p.id} title={p.title} subtitle={p.subtitle} icon="page" image={url(p.imageRef)} focal={p.metadata.imagePosition} fallback={fb(p.metadata.fallbackColor, "var(--rbr-secondary-dark)")} onClick={() => open({ kind: "page", id: p.id })} />);
    }
  }
  return (
    <div className="flex flex-col gap-4 @min-[40rem]:gap-6 px-4 @min-[40rem]:px-6 @4xl:px-10">
      <header className="px-2 @min-[40rem]:px-0 flex flex-col gap-1">
        <Eyebrow>{`More from ${data.teacherName.split(" ")[0] || data.teacherName}`}</Eyebrow>
        <DisplayHeading as="h1" className="[--tt-h1:32px] @min-[40rem]:[--tt-h1:42px] @4xl:[--tt-h1:46px]" style={{ fontSize: "calc(var(--tt-h1) * var(--tt-display-scale, 1))" }}>
          Explore
        </DisplayHeading>
      </header>
      {tiles.length > 0 ? <div className="grid gap-3 @xl:grid-cols-2 @min-[40rem]:gap-4 @4xl:grid-cols-3 @4xl:gap-5">{tiles}</div> : <EmptyState icon="compass" title="More coming soon" body="Readings, audio and pages will appear here." />}
    </div>
  );
}
