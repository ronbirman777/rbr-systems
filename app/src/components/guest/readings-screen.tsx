"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import type { DisplayFlowReading } from "@/lib/modules/flowLibrary";
import { itemCategories, readingMinutes, sortByDateDesc } from "@/lib/modules/library";
import { objectPositionStyle } from "@/lib/modules/imagePosition";
import { safeHttpUrl } from "@/lib/teach/links";
import { createTranslator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { formatShortDateLocalized } from "@/lib/i18n/datetime";
import { BrandImage } from "@/components/shared/brand-image";
import { FLOW_SIZES } from "@/components/flow-media-sizes";
import { ChevronRightIcon } from "./icons";
import { FlowBackButton, FlowEmptyNote, FlowScreenHeader } from "./flow-screen-chrome";

export type ReadingsScreenProps = {
  brand: BrandConfig;
  readings: DisplayFlowReading[];
  locale?: Locale;
};

/**
 * Flow Readings - list, then one reading (TASK 029, P4).
 *
 * The DATA and the derived values are shared with Time to Teach
 * (lib/modules/library.ts: the metadata schema, the date sort, the
 * category set, the reading-time estimate). The APPEARANCE is not: this
 * is the Flow card language - parchment and cream, a featured first
 * card, --rbr-* throughout - because §17 is explicit that Flow must not
 * read as a Teach clone.
 *
 * Navigation lives here rather than in ExploreScreen because a reading
 * is one level BELOW the Readings list, and ExploreSubPage's own back
 * button leaves the module entirely. So: this screen owns list/detail,
 * and the chrome above owns module/Explore.
 */
export function ReadingsScreen({ brand, readings, locale = DEFAULT_LOCALE }: ReadingsScreenProps) {
  const { t } = createTranslator(locale);
  const vars = deriveThemeVars(brand) as CSSProperties;
  const [openId, setOpenId] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  const sorted = useMemo(() => sortByDateDesc(readings), [readings]);
  const categories = itemCategories(sorted);
  const list = category ? sorted.filter((r) => r.metadata.category === category) : sorted;
  const open = openId ? (readings.find((r) => r.id === openId) ?? null) : null;

  if (open) {
    return <ReadingDetailScreen brand={brand} reading={open} onBack={() => setOpenId(null)} locale={locale} />;
  }

  const [featured, ...rest] = list;

  return (
    <div style={vars} className="flex-1 overflow-y-auto no-scrollbar">
      <FlowScreenHeader eyebrow={t("flow", "eyebrowReadings")} title={t("flow", "readings")} />

      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-6 pb-4">
          <CategoryChip active={category === null} onClick={() => setCategory(null)} label={t("common", "all")} />
          {categories.map((c) => (
            <CategoryChip key={c} active={category === c} onClick={() => setCategory(c)} label={c} userContent />
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <FlowEmptyNote>{t("flow", "noReadingsGuest")}</FlowEmptyNote>
      ) : (
        <div className="px-4 pb-10 space-y-3">
          {featured && (
            <button
              type="button"
              onClick={() => setOpenId(featured.id)}
              className="w-full text-start rounded-3xl overflow-hidden shadow-sm"
              style={{
                background: "var(--rbr-cream)",
                border: "1px solid color-mix(in srgb, var(--rbr-sand) 30%, transparent)",
              }}
            >
              <div className="relative h-[200px]">
                <BrandImage
                  src={featured.imageUrl}
                  alt=""
                  className="w-full h-full"
                  sizes={FLOW_SIZES.frame}
                  style={{ objectPosition: objectPositionStyle(featured.metadata.imagePosition) }}
                  fallback="linear-gradient(160deg, var(--rbr-primary), var(--rbr-primary-dark))"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to top, color-mix(in srgb, var(--rbr-primary-dark) 75%, transparent), transparent 62%)",
                  }}
                />
                <div className="absolute bottom-0 start-0 end-0 p-4">
                  <p
                    className="text-[9.5px] tracking-[0.2em] uppercase font-medium text-white/70"
                    style={{ fontFamily: "var(--rbr-font-ui)" }}
                    dir="auto"
                  >
                    {readingMeta(featured, t, locale)}
                  </p>
                  <h2
                    dir="auto"
                    className="text-white text-[22px] leading-snug mt-0.5"
                    style={{ fontFamily: "var(--rbr-font-display)" }}
                  >
                    {featured.title}
                  </h2>
                </div>
              </div>
              {featured.metadata.excerpt && (
                <p
                  dir="auto"
                  className="px-4 py-3.5 text-[12.5px] leading-relaxed"
                  style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-dusk)" }}
                >
                  {featured.metadata.excerpt}
                </p>
              )}
            </button>
          )}

          {rest.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setOpenId(r.id)}
              className="w-full text-start rounded-3xl overflow-hidden flex items-stretch gap-3 min-h-[88px]"
              style={{
                background: "var(--rbr-cream)",
                border: "1px solid color-mix(in srgb, var(--rbr-sand) 30%, transparent)",
              }}
            >
              <div className="w-[88px] shrink-0">
                <BrandImage
                  src={r.imageUrl}
                  alt=""
                  className="w-full h-full"
                  sizes={FLOW_SIZES.tile}
                  style={{ objectPosition: objectPositionStyle(r.metadata.imagePosition) }}
                  fallback="linear-gradient(160deg, var(--rbr-secondary), var(--rbr-secondary-dark))"
                />
              </div>
              <span className="flex-1 min-w-0 py-3 pe-2 flex flex-col justify-center">
                <span
                  className="text-[9.5px] tracking-[0.18em] uppercase font-medium"
                  style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-secondary-foreground)" }}
                  dir="auto"
                >
                  {readingMeta(r, t, locale)}
                </span>
                <span
                  dir="auto"
                  className="block text-[15px] leading-snug mt-0.5"
                  style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text)" }}
                >
                  {r.title}
                </span>
                {r.metadata.excerpt && (
                  <span
                    dir="auto"
                    className="block text-[11.5px] leading-relaxed mt-0.5 line-clamp-2"
                    style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}
                  >
                    {r.metadata.excerpt}
                  </span>
                )}
              </span>
              <span className="flex items-center pe-4 shrink-0">
                <ChevronRightIcon style={{ color: "var(--rbr-mist)" }} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Morning · 4 min read", or whichever of those exist. */
function readingMeta(
  reading: DisplayFlowReading,
  t: ReturnType<typeof createTranslator>["t"],
  locale: Locale
): string {
  const mins = readingMinutes(reading.description);
  return [
    reading.metadata.category,
    mins ? t("flow", "minutesRead", { count: mins }) : reading.externalLink ? t("flow", "externalArticle") : null,
    reading.metadata.date ? formatShortDateLocalized(reading.metadata.date, locale) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function CategoryChip({
  active,
  onClick,
  label,
  userContent,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  userContent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      dir={userContent ? "auto" : undefined}
      /* min-h-11 is 44px: the P6 accessibility pass measured these
         chips at 31px tall, which is under the touch target a thumb
         needs. Padding alone would not have been enough on the
         shortest label ("All"), so the floor is explicit. */
      className="shrink-0 rounded-full px-4 min-h-11 text-[11.5px] font-medium whitespace-nowrap transition-colors"
      style={{
        fontFamily: "var(--rbr-font-ui)",
        background: active ? "var(--rbr-primary)" : "var(--rbr-cream)",
        color: active ? "var(--rbr-on-primary)" : "var(--rbr-dusk)",
        border: `1px solid ${active ? "transparent" : "color-mix(in srgb, var(--rbr-sand) 55%, transparent)"}`,
      }}
    >
      {label}
    </button>
  );
}

export function ReadingDetailScreen({
  brand,
  reading,
  onBack,
  locale,
}: {
  brand: BrandConfig;
  reading: DisplayFlowReading;
  onBack: () => void;
  locale: Locale;
}) {
  const { t } = createTranslator(locale);
  const vars = deriveThemeVars(brand) as CSSProperties;
  const external = safeHttpUrl(reading.externalLink);
  const mins = readingMinutes(reading.description);

  return (
    <article style={vars} className="flex-1 overflow-y-auto no-scrollbar">
      <FlowBackButton label={t("flow", "readings")} onClick={onBack} />

      {reading.imageUrl && (
        <div className="relative h-[200px] mt-2">
          <BrandImage
            src={reading.imageUrl}
            alt=""
            className="w-full h-full"
            sizes={FLOW_SIZES.frame}
            style={{ objectPosition: objectPositionStyle(reading.metadata.imagePosition) }}
            fallback="linear-gradient(160deg, var(--rbr-primary), var(--rbr-primary-dark))"
          />
        </div>
      )}

      <header className="px-6 pt-6 pb-4">
        <p
          className="text-[10px] tracking-[0.2em] uppercase font-medium mb-1.5"
          style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-secondary-foreground)" }}
          dir="auto"
        >
          {[
            reading.metadata.category,
            mins ? t("flow", "minutesRead", { count: mins }) : null,
            reading.metadata.date ? formatShortDateLocalized(reading.metadata.date, locale) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <h1
          dir="auto"
          className="text-[26px] leading-tight font-normal"
          style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text)" }}
        >
          {reading.title}
        </h1>
        {reading.metadata.author && (
          <p
            dir="auto"
            className="text-[12px] mt-2"
            style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}
          >
            {reading.metadata.author}
          </p>
        )}
      </header>

      {reading.metadata.excerpt && (
        <p
          dir="auto"
          className="px-6 pb-5 text-[14px] leading-relaxed italic"
          style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-dusk)" }}
        >
          {reading.metadata.excerpt}
        </p>
      )}

      {reading.description && (
        <div
          dir="auto"
          className="px-6 pb-6 text-[14px] leading-[1.75] whitespace-pre-line"
          style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-text)" }}
        >
          {reading.description}
        </div>
      )}

      {external && (
        <div className="px-6 pb-10">
          <a
            href={external}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-[12.5px] font-medium min-h-11"
            style={{
              fontFamily: "var(--rbr-font-ui)",
              background: "var(--rbr-primary-soft)",
              color: "var(--rbr-text-on-primary-soft)",
            }}
          >
            {t("flow", "openOriginal")}
            <ChevronRightIcon style={{ color: "var(--rbr-text-on-primary-soft)" }} />
          </a>
        </div>
      )}

      {!reading.description && !external && <div className="pb-10" />}
    </article>
  );
}
