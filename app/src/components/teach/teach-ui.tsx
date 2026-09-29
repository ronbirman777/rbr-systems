import type { ReactNode, CSSProperties } from "react";
import type { TeachStyle } from "@/lib/teach/schemas";
import type { DailyQuote } from "@/lib/content/dailyQuotes";
import { TeachIcon, type TeachIconName } from "./teach-icons";

/** Small presentational building blocks shared by every Teach guest screen. */

export function Eyebrow({ children, tone = "muted", className = "" }: { children: ReactNode; tone?: "muted" | "primary" | "light"; className?: string }) {
  const color = tone === "primary" ? "var(--rbr-primary)" : tone === "light" ? "rgba(255,255,255,0.9)" : "var(--rbr-text-muted)";
  return (
    <p className={`text-[10.5px] font-semibold uppercase tracking-[0.18em] ${className}`} style={{ color }}>
      {children}
    </p>
  );
}

export function DisplayHeading({
  children,
  as: Tag = "h2",
  size = 22,
  className = "",
  style,
}: {
  children: ReactNode;
  as?: "h1" | "h2" | "h3";
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Tag
      className={`leading-[1.15] ${className}`}
      style={{
        fontFamily: "var(--tt-font-display)",
        fontSize: `calc(${size}px * var(--tt-display-scale, 1))`,
        color: "var(--rbr-text)",
        fontWeight: 400,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <DisplayHeading size={22}>{title}</DisplayHeading>
      {action && onAction ? (
        <button type="button" onClick={onAction} className="text-[12.5px] font-semibold min-h-11 px-1" style={{ color: "var(--rbr-primary)" }}>
          {action}
        </button>
      ) : action ? (
        <span className="text-[12.5px] font-semibold" style={{ color: "var(--rbr-primary)" }}>
          {action}
        </span>
      ) : null}
    </div>
  );
}

type PillKind = "primary" | "outline" | "soft";

function pillStyle(kind: PillKind): CSSProperties {
  if (kind === "primary") return { background: "var(--rbr-primary)", color: "var(--rbr-on-primary)", borderRadius: "var(--tt-radius-pill)" };
  if (kind === "soft") return { background: "var(--rbr-primary-soft)", color: "var(--rbr-primary-foreground)", borderRadius: "var(--tt-radius-pill)" };
  return { border: "1px solid var(--rbr-primary-border)", color: "var(--rbr-primary-foreground)", borderRadius: "var(--tt-radius-pill)" };
}

const PILL_CLASS =
  "inline-flex items-center justify-center gap-2 min-h-11 px-5 text-[13.5px] font-semibold transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2";

export function PillLink({ href, kind = "primary", icon, children, className = "", external = true }: { href: string; kind?: PillKind; icon?: TeachIconName; children: ReactNode; className?: string; external?: boolean }) {
  return (
    <a
      href={href}
      className={`${PILL_CLASS} ${className}`}
      style={pillStyle(kind)}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {icon ? <TeachIcon name={icon} size={17} /> : null}
      <span>{children}</span>
    </a>
  );
}

export function PillButton({ onClick, kind = "primary", icon, children, className = "" }: { onClick: () => void; kind?: PillKind; icon?: TeachIconName; children: ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={`${PILL_CLASS} ${className}`} style={pillStyle(kind)}>
      {icon ? <TeachIcon name={icon} size={17} /> : null}
      <span>{children}</span>
    </button>
  );
}

export function Chip({ children, active = false, onClick }: { children: ReactNode; active?: boolean; onClick?: () => void }) {
  const style: CSSProperties = active
    ? { background: "var(--rbr-primary)", color: "var(--rbr-on-primary)", borderRadius: "var(--tt-radius-pill)" }
    : { background: "var(--tt-surface)", color: "var(--rbr-text)", border: "1px solid var(--tt-line)", borderRadius: "var(--tt-radius-pill)" };
  if (!onClick)
    return (
      <span className="inline-flex items-center px-3 py-1.5 text-[12px] font-semibold" style={style}>
        {children}
      </span>
    );
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className="inline-flex items-center px-3.5 min-h-9 text-[12px] font-semibold shrink-0" style={style}>
      {children}
    </button>
  );
}

export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 min-h-11 pr-3 text-[13px] font-semibold" style={{ color: "var(--rbr-primary)" }}>
      <TeachIcon name="chevronLeft" size={20} strokeWidth={2} />
      {label}
    </button>
  );
}

/** Yoga-inspired but abstract dividers - purely decorative. */
export function TeachDivider({ kind }: { kind: TeachStyle["dividers"] }) {
  if (kind === "none") return null;
  const color = "var(--rbr-secondary)";
  if (kind === "wave") {
    return (
      <svg aria-hidden="true" width="96" height="10" viewBox="0 0 96 10" className="mx-auto block" fill="none">
        <path d="M1 5c8-6 16 6 24 0s16-6 24 0 16 6 24 0 16-6 22 0" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "leaf") {
    return (
      <div aria-hidden="true" className="flex items-center justify-center gap-2">
        <span className="h-px w-8" style={{ background: color }} />
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6">
          <path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19 13 11" />
        </svg>
        <span className="h-px w-8" style={{ background: color }} />
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="flex items-center justify-center gap-2">
      <span className="h-px w-10" style={{ background: color }} />
      <span className="w-[5px] h-[5px] rounded-full" style={{ background: color }} />
      <span className="h-px w-10" style={{ background: color }} />
    </div>
  );
}

export function DailyQuoteBlock({ quote, style, attribution }: { quote: DailyQuote; style: TeachStyle; attribution: string }) {
  const text = (
    <p
      className="text-[20px] leading-[1.35] italic"
      style={{ fontFamily: "var(--tt-font-display)", color: "var(--rbr-text)", fontSize: "calc(20px * var(--tt-display-scale, 1))" }}
    >
      “{quote.text}”
    </p>
  );
  const label = <Eyebrow className="mt-3">{quote.source || attribution}</Eyebrow>;
  if (style.quoteStyle === "card") {
    return (
      <figure className="p-5 text-center" style={{ background: "var(--rbr-primary-soft)", borderRadius: "var(--tt-radius-card)" }}>
        {text}
        {label}
      </figure>
    );
  }
  if (style.quoteStyle === "line") {
    return (
      <figure className="pl-4 text-left" style={{ borderLeft: "2px solid var(--rbr-secondary)" }}>
        {text}
        {label}
      </figure>
    );
  }
  return (
    <figure className="text-center flex flex-col gap-3 items-center">
      <TeachDivider kind={style.dividers === "none" ? "breath" : style.dividers} />
      <div>
        {text}
        {label}
      </div>
    </figure>
  );
}

/** Soft organic background shapes (decorative, behind content, never over text). */
export function OrganicShapes() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden">
      <div className="absolute -top-24 -right-20 w-72 h-72 rounded-full opacity-[0.35] blur-2xl" style={{ background: "var(--rbr-secondary-soft)" }} />
      <div className="absolute top-40 -left-24 w-64 h-64 rounded-full opacity-[0.3] blur-2xl" style={{ background: "var(--rbr-primary-soft)" }} />
    </div>
  );
}

export function EmptyState({ icon = "leaf", title, body, action }: { icon?: TeachIconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <div
      className="flex flex-col items-center text-center gap-2 px-6 py-8"
      style={{ border: "1px dashed var(--tt-line)", borderRadius: "var(--tt-radius-card)", background: "var(--tt-surface)" }}
    >
      <span style={{ color: "var(--rbr-primary)" }}>
        <TeachIcon name={icon} size={26} />
      </span>
      <DisplayHeading as="h3" size={19}>
        {title}
      </DisplayHeading>
      {body ? (
        <p className="text-[13px]" style={{ color: "var(--rbr-text-muted)" }}>
          {body}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
