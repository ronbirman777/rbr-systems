"use client";

import { useId } from "react";
import type { TeachContact, TeachItem } from "@/lib/teach/schemas";
import { buildRegistrationCta, venueLinks, safeHttpUrl, availabilityCtas, formatShortDate } from "@/lib/teach/links";
import { durationMinutes, describeAvailability } from "@/lib/teach/schedule";
import { TeachIcon, type TeachIconName } from "./teach-icons";
import { TeachImage } from "./teach-image";
import { DisplayHeading, Eyebrow, PillLink } from "./teach-ui";

const VENUE_ICON: Record<string, TeachIconName> = {
  website: "globe",
  instagram: "instagram",
  facebook: "facebook",
  email: "mail",
  booking: "calendar",
  map: "map",
};

const CTA_ICON: Record<string, TeachIconName> = {
  whatsapp: "chat",
  email: "mail",
  instagram: "instagram",
  facebook: "facebook",
  website: "globe",
  bookingLink: "calendar",
  venueLink: "calendar",
};

function MetaRow({ icon, children }: { icon: TeachIconName; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[12.5px] min-w-0" style={{ color: "var(--rbr-text-muted)" }}>
      <span className="shrink-0" style={{ opacity: 0.8 }}>
        <TeachIcon name={icon} size={14} />
      </span>
      <span className="truncate">{children}</span>
    </p>
  );
}

/**
 * The class card - collapsed: image, type, title, time, location, chevron;
 * expanded: description, facts, how to register / get there, venue, CTA.
 * The whole header row is the toggle (>=44px target, aria-expanded).
 */
export function TeachClassCard({
  item,
  imageUrl,
  teacherName,
  expanded,
  onToggle,
  past = false,
  timezoneLabel,
}: {
  item: TeachItem<"teachClasses">;
  imageUrl: string | null;
  teacherName: string;
  expanded: boolean;
  onToggle: () => void;
  past?: boolean;
  timezoneLabel?: string | null;
}) {
  const regionId = useId();
  const m = item.metadata;
  const cta = past ? null : buildRegistrationCta(teacherName, item.title, m);
  const venue = venueLinks(m.venue);
  const mins = durationMinutes(m);
  const directions = safeHttpUrl(m.venue.enabled ? m.venue.mapUrl : null);
  const time = `${m.startTime}${m.endTime ? ` – ${m.endTime}` : ""}${m.endDate && m.endDate !== m.startDate ? ` · until ${formatShortDate(m.endDate)}` : ""}`;
  const facts: { icon: TeachIconName; label: string; value: string }[] = [];
  if (m.price) facts.push({ icon: "tag", label: "Price", value: m.price });
  if (m.maxParticipants) facts.push({ icon: "users", label: "Spots", value: `Max ${m.maxParticipants}` });
  if (mins) facts.push({ icon: "clock", label: "Length", value: `${mins} min` });

  return (
    <article
      className="tt-reveal overflow-hidden transition-shadow"
      style={{
        background: "var(--tt-surface)",
        border: "1px solid var(--tt-line)",
        borderRadius: "var(--tt-radius-card)",
        boxShadow: expanded ? "0 14px 34px -18px rgba(36,59,50,.35)" : "0 6px 18px -14px rgba(36,59,50,.25)",
        opacity: past ? 0.62 : 1,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={regionId}
        className="w-full flex items-center gap-3.5 p-3 text-left"
      >
        <TeachImage
          src={imageUrl}
          focal={m.imagePosition}
          alt=""
          fallbackLabel={item.title}
          className="w-[76px] h-[90px] shrink-0"
          style={{ borderRadius: "var(--tt-radius-image)" }}
        />
        <span className="flex-1 min-w-0 flex flex-col gap-1">
          <span className="flex items-center gap-2">
            {item.subtitle ? <Eyebrow tone="primary">{item.subtitle}</Eyebrow> : null}
            {past ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: "var(--tt-line)", color: "var(--rbr-text-muted)" }}>
                Ended
              </span>
            ) : null}
          </span>
          <DisplayHeading as="h3" size={18} className="line-clamp-2">
            {item.title}
          </DisplayHeading>
          <MetaRow icon="clock">
            <span style={{ color: "var(--rbr-text)" }}>{time}</span>
            {timezoneLabel ? <span> · {timezoneLabel}</span> : null}
          </MetaRow>
          {m.location ? <MetaRow icon="pin">{m.location}</MetaRow> : null}
        </span>
        <span
          aria-hidden="true"
          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-transform duration-200"
          style={{
            background: expanded ? "var(--rbr-primary)" : "var(--rbr-primary-soft)",
            color: expanded ? "var(--rbr-on-primary)" : "var(--rbr-primary-foreground)",
            transform: expanded ? "rotate(180deg)" : "none",
          }}
        >
          <TeachIcon name="chevronDown" size={18} strokeWidth={2} />
        </span>
      </button>

      <div id={regionId} role="region" aria-label={`${item.title} details`} hidden={!expanded}>
        {expanded ? (
          <div className="tt-expand px-4 pb-4 flex flex-col gap-4">
            <div className="h-px" style={{ background: "var(--tt-line)" }} />
            {item.description ? (
              <p className="text-[13.5px] leading-[1.55] whitespace-pre-line" style={{ color: "var(--rbr-text-muted)" }}>
                {item.description}
              </p>
            ) : null}
            {facts.length > 0 ? (
              <dl className="grid gap-2" style={{ gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))` }}>
                {facts.map((f) => (
                  <div key={f.label} className="p-2.5 flex flex-col gap-0.5" style={{ background: "var(--tt-bg)", borderRadius: "calc(var(--tt-radius-image) - 2px)" }}>
                    <span style={{ color: "var(--rbr-primary)" }}>
                      <TeachIcon name={f.icon} size={15} />
                    </span>
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--rbr-text-muted)" }}>
                      {f.label}
                    </dt>
                    <dd className="text-[13px] font-semibold" style={{ color: "var(--rbr-text)" }}>
                      {f.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {m.howToRegister ? (
              <div className="flex flex-col gap-1.5">
                <Eyebrow>How to register</Eyebrow>
                <p className="text-[13px] leading-[1.5] whitespace-pre-line" style={{ color: "var(--rbr-text)" }}>
                  {m.howToRegister}
                </p>
              </div>
            ) : null}
            {m.howToGetThere ? (
              <div className="flex flex-col gap-1.5">
                <Eyebrow>How to get there</Eyebrow>
                <p className="text-[13px] leading-[1.5] whitespace-pre-line" style={{ color: "var(--rbr-text)" }}>
                  {m.howToGetThere}
                </p>
              </div>
            ) : null}
            {m.venue.enabled && (m.venue.name || venue.length > 0) ? (
              <div className="p-3 flex flex-col gap-2.5" style={{ background: "var(--rbr-secondary-soft)", borderRadius: "calc(var(--tt-radius-card) - 6px)" }}>
                {m.venue.name ? (
                  <p className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--rbr-text)" }}>
                    <TeachIcon name="leaf" size={15} />
                    Hosted at {m.venue.name}
                  </p>
                ) : null}
                {venue.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {venue.map((l) => (
                      <a
                        key={l.kind}
                        href={l.href}
                        target={l.href.startsWith("mailto:") ? undefined : "_blank"}
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 min-h-9 text-[12px] font-semibold"
                        style={{ background: "var(--tt-surface)", color: "var(--rbr-text)", borderRadius: "var(--tt-radius-pill)" }}
                      >
                        <TeachIcon name={VENUE_ICON[l.kind]} size={13} />
                        {l.label}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {cta ? (
              <PillLink href={cta.href} icon={CTA_ICON[cta.method]} external={cta.external} className="w-full">
                {cta.label}
              </PillLink>
            ) : null}
            {directions ? (
              <PillLink href={directions} kind="outline" icon="map" className="w-full">
                Directions
              </PillLink>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function TeachAvailabilityCard({
  item,
  dateIso,
  teacherName,
  contact,
}: {
  item: TeachItem<"teachAvailability">;
  dateIso: string;
  teacherName: string;
  contact: TeachContact;
}) {
  const ctas = availabilityCtas(teacherName, dateIso, item.metadata, contact);
  return (
    <article
      className="tt-reveal p-4 flex flex-col gap-3"
      style={{
        background: "var(--rbr-primary-soft)",
        border: "1px dashed var(--rbr-primary-border)",
        borderRadius: "var(--tt-radius-card)",
      }}
    >
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--tt-surface)", color: "var(--rbr-primary)" }}>
          <TeachIcon name="user" size={18} />
        </span>
        <div className="min-w-0">
          <Eyebrow tone="primary">{item.title || "Available for private session"}</Eyebrow>
          <DisplayHeading as="h3" size={18}>
            {formatShortDate(dateIso)} · {item.metadata.from} – {item.metadata.to}
          </DisplayHeading>
        </div>
      </div>
      {item.description ? (
        <p className="text-[13px] leading-[1.5]" style={{ color: "var(--rbr-text-muted)" }}>
          {item.description}
        </p>
      ) : null}
      {ctas.length > 0 ? (
        <div className="flex gap-2">
          {ctas.map((c, i) => (
            <PillLink key={c.kind} href={c.href} kind={i === 0 ? "primary" : "outline"} icon={c.kind === "whatsapp" ? "chat" : c.kind === "email" ? "mail" : "calendar"} external={!c.href.startsWith("mailto:")} className="flex-1">
              {c.label}
            </PillLink>
          ))}
        </div>
      ) : null}
      <p className="sr-only">{describeAvailability(item.metadata)}</p>
    </article>
  );
}
