"use client";

import type { ReactNode } from "react";
import type { TeachGuestData } from "@/lib/teach/guestData";
import type { TeachItem } from "@/lib/teach/schemas";
import { buildRetreatRegistrationCta, safeHttpUrl } from "@/lib/teach/links";
import { formatRetreatPrice, retreatDateSummary, retreatPhase, type RetreatPhase } from "@/lib/teach/retreats";
import { createTranslator } from "@/lib/i18n";
import { TeachIcon, type TeachIconName } from "./teach-icons";
import { TeachImage } from "./teach-image";
import { TEACH_SIZES } from "./teach-media-sizes";
import { BackButton, Chip, DisplayHeading, EmptyState, Eyebrow, PillLink } from "./teach-ui";

/**
 * My Retreats - the Teach Guest App's list and detail screens (TASK 031).
 *
 * Everything a teacher typed (name, description, location, duration,
 * button label) is user content: it carries dir="auto" and is never
 * translated. Everything around it - labels, phase chips, the default
 * button text - is system copy in the Space language.
 *
 * Past retreats are shown, marked "Past retreat". Hiding them would be a
 * product decision nobody has made (a teacher has the per-retreat switch
 * if they want one gone).
 */

const media = (data: TeachGuestData, ref: string | null | undefined) => (ref ? (data.mediaUrls[ref] ?? null) : null);

function PhaseChip({ phase, locale }: { phase: RetreatPhase; locale: TeachGuestData["locale"] }) {
  const { t } = createTranslator(locale);
  if (phase === "ongoing") return <Chip active>{t("teach", "retreatPhaseOngoing")}</Chip>;
  if (phase === "past") return <Chip>{t("teach", "retreatPhasePast")}</Chip>;
  return null;
}

/** "location · dates" - the line under a retreat's name in the list. */
function summaryLine(data: TeachGuestData, r: TeachItem<"teachRetreats">): string {
  return [retreatDateSummary(r.metadata, data.locale), r.metadata.location].filter(Boolean).join(" · ");
}

export function RetreatsScreen({ data, onBack, onOpen, title }: { data: TeachGuestData; onBack: () => void; onOpen: (id: string) => void; title: string }) {
  const { t } = createTranslator(data.locale);
  return (
    <div className="flex flex-col gap-4 @min-[40rem]:gap-6 px-4 @min-[40rem]:px-6 @4xl:px-10 pb-8">
      <BackButton label={t("teach", "navExplore")} onClick={onBack} />
      <header className="px-2 @min-[40rem]:px-0 flex flex-col gap-1">
        <Eyebrow>{t("teach", "retreatsEyebrow")}</Eyebrow>
        <DisplayHeading as="h1" className="[--tt-h1:32px] @min-[40rem]:[--tt-h1:42px] @4xl:[--tt-h1:46px]" style={{ fontSize: "calc(var(--tt-h1) * var(--tt-display-scale, 1))" }}>
          {title}
        </DisplayHeading>
      </header>
      {data.retreats.length === 0 ? (
        <EmptyState icon="leaf" title={t("teach", "noRetreatsYet")} body="" />
      ) : (
        <ul className="flex flex-col gap-3 @min-[40rem]:grid @min-[40rem]:grid-cols-2 @min-[40rem]:gap-4 @4xl:grid-cols-3 @4xl:gap-5">
          {data.retreats.map((r) => {
            const phase = retreatPhase(r.metadata, data.todayIso);
            const price = formatRetreatPrice(r.metadata, data.locale);
            const line = summaryLine(data, r);
            return (
              <li key={r.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onOpen(r.id)}
                  className="tt-reveal w-full h-full text-start flex flex-col overflow-hidden min-w-0 active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ background: "var(--tt-surface)", border: "1px solid var(--tt-line)", borderRadius: "var(--tt-radius-card)" }}
                  data-testid="retreat-card"
                >
                  <TeachImage
                    src={media(data, r.imageRef)}
                    focal={r.metadata.imagePosition}
                    alt=""
                    fallbackLabel={r.title}
                    sizes={TEACH_SIZES.retreatCard}
                    className="w-full h-[180px] @min-[40rem]:h-[200px] shrink-0 !rounded-none"
                  />
                  <span className="flex flex-col gap-1.5 p-4 min-w-0">
                    {phase === "ongoing" || phase === "past" ? (
                      <span className="flex">
                        <PhaseChip phase={phase} locale={data.locale} />
                      </span>
                    ) : null}
                    <DisplayHeading userContent as="h2" size={19} className="[overflow-wrap:anywhere]">
                      {r.title}
                    </DisplayHeading>
                    {line ? (
                      <span dir="auto" className="text-[12.5px] font-medium [overflow-wrap:anywhere]" style={{ color: "var(--rbr-primary)" }}>
                        {line}
                      </span>
                    ) : null}
                    {r.description ? (
                      <span dir="auto" className="text-[13.5px] leading-[1.5] line-clamp-3 [overflow-wrap:anywhere]" style={{ color: "var(--rbr-text-muted)" }}>
                        {r.description}
                      </span>
                    ) : null}
                    {price ? (
                      <span className="text-[13px] font-semibold" style={{ color: "var(--rbr-text)" }} dir="auto">
                        {price}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Fact({ icon, label, children }: { icon: TeachIconName; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <span aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: "var(--rbr-primary)" }}>
        <TeachIcon name={icon} size={18} />
      </span>
      <div className="min-w-0 flex flex-col">
        <dt className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--rbr-text-muted)" }}>
          {label}
        </dt>
        <dd dir="auto" className="text-[15px] leading-[1.45] [overflow-wrap:anywhere]" style={{ color: "var(--rbr-text)" }}>
          {children}
        </dd>
      </div>
    </div>
  );
}

export function RetreatDetailScreen({ data, item, onBack }: { data: TeachGuestData; item: TeachItem<"teachRetreats">; onBack: () => void }) {
  const { t } = createTranslator(data.locale);
  const m = item.metadata;
  const phase = retreatPhase(m, data.todayIso);
  const dates = retreatDateSummary(m, data.locale);
  const price = formatRetreatPrice(m, data.locale);
  const flowUrl = safeHttpUrl(m.flowGuestUrl);
  const registration = buildRetreatRegistrationCta(m.registration, item.title, data.teacherName, data.locale);
  const cover = media(data, item.imageRef);
  return (
    <article className="flex flex-col pb-8">
      <div className="relative @4xl:mx-10 @4xl:overflow-hidden @4xl:rounded-[var(--tt-radius-card)]">
        <TeachImage src={cover} focal={m.imagePosition} alt="" fallbackLabel={item.title} sizes={TEACH_SIZES.retreatCover} className="w-full h-[240px] @min-[40rem]:h-[340px] @4xl:h-[440px]" />
        <div className="absolute top-3 start-3 @4xl:top-5 @4xl:start-5">
          <button type="button" onClick={onBack} aria-label={t("common", "backTo", { label: t("teach", "myRetreats") })} className="w-11 h-11 rounded-full flex items-center justify-center shadow active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: "var(--tt-surface)", color: "var(--rbr-text)" }}>
            <TeachIcon name="chevronLeft" size={20} strokeWidth={2} />
          </button>
        </div>
      </div>
      <div className="px-6 pt-6 @4xl:pt-12 flex flex-col gap-5 max-w-[680px] @4xl:max-w-[720px] w-full mx-auto min-w-0">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Eyebrow tone="primary">{t("teach", "retreatsEyebrow")}</Eyebrow>
            <PhaseChip phase={phase} locale={data.locale} />
          </div>
          <DisplayHeading userContent as="h1" className="[--tt-h1:30px] @min-[40rem]:[--tt-h1:38px] @4xl:[--tt-h1:46px] [overflow-wrap:anywhere]" style={{ fontSize: "calc(var(--tt-h1) * var(--tt-display-scale, 1))" }}>
            {item.title}
          </DisplayHeading>
        </div>
        {dates || m.location || m.durationLabel || price ? (
          <dl className="flex flex-col gap-3.5 p-4" style={{ background: "var(--tt-surface)", border: "1px solid var(--tt-line)", borderRadius: "var(--tt-radius-card)" }}>
            {dates ? (
              <Fact icon="calendar" label={t("teach", "retreatDatesLabel")}>
                {dates}
              </Fact>
            ) : null}
            {m.location ? (
              <Fact icon="pin" label={t("common", "location")}>
                {m.location}
              </Fact>
            ) : null}
            {m.durationLabel ? (
              <Fact icon="clock" label={t("teach", "retreatDuration")}>
                {m.durationLabel}
              </Fact>
            ) : null}
            {price ? (
              <Fact icon="tag" label={t("teach", "price")}>
                {price}
              </Fact>
            ) : null}
          </dl>
        ) : null}
        {item.description ? (
          <p dir="auto" className="text-[15px] @4xl:text-[17px] leading-[1.7] whitespace-pre-line [overflow-wrap:anywhere]" style={{ color: "var(--rbr-text)" }}>
            {item.description}
          </p>
        ) : null}
        {flowUrl || registration ? (
          <div className="flex flex-col gap-3 @min-[40rem]:flex-row @min-[40rem]:flex-wrap">
            {/* The InnerDweS retreat is the primary destination; an external
                registration stays available beside it. Same tab for the
                internal link (it is another Guest App), new tab for external. */}
            {flowUrl ? (
              <PillLink href={flowUrl} external={false} kind="primary" icon="leaf" className="w-full @min-[40rem]:w-auto">
                {t("teach", "viewRetreat")}
              </PillLink>
            ) : null}
            {registration ? (
              <PillLink href={registration.href} external={registration.external} kind={flowUrl ? "outline" : "primary"} icon={registration.method === "email" ? "mail" : registration.method === "whatsapp" ? "chat" : "external"} className="w-full @min-[40rem]:w-auto text-center">
                <span dir="auto">{registration.label}</span>
              </PillLink>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
