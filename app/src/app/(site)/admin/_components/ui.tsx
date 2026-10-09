import Link from "next/link";
import type { ReactNode } from "react";
import type { Tone } from "@/lib/billing/admin/ui/labels";
import { cardCls } from "./styles";

export function PageHeader({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-ui text-2xl text-idw-forest sm:text-3xl">{title}</h1>
        {children ? <div className="mt-1 max-w-3xl text-sm text-idw-forest/75">{children}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, children, className = "", id }: { title?: string; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-h` : undefined} className={`${cardCls} ${className}`}>
      {title ? <h2 id={id ? `${id}-h` : undefined} className="mb-3 font-ui text-lg text-idw-forest">{title}</h2> : null}
      {children}
    </section>
  );
}

const TONES: Record<Tone, string> = {
  good: "bg-emerald-100 text-emerald-900",
  warn: "bg-amber-100 text-amber-900",
  bad: "bg-red-100 text-red-900",
  neutral: "bg-idw-linen text-idw-forest",
};
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

export function Stat({ label, value, caption, tone }: { label: string; value: ReactNode; caption: string; tone?: Tone }) {
  return (
    <div className={`${cardCls} flex flex-col`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-idw-forest/70">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone === "bad" ? "text-red-800" : tone === "warn" ? "text-amber-800" : "text-idw-forest"}`}>{value}</div>
      <p className="mt-2 text-xs leading-snug text-idw-forest/70">{caption}</p>
    </div>
  );
}

/** key/value rows for detail pages */
export function Dl({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(10rem,14rem)_1fr]">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-medium text-idw-forest/70">{k}</dt>
          <dd className="min-w-0 break-words text-idw-forest">{v ?? "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

/* Responsive table: a real <table> from 768px up, stacked cards below. */
export function RTable({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <table className="block w-full text-sm md:table">
      <caption className="sr-only">{caption}</caption>
      {children}
    </table>
  );
}
export function RHead({ cols }: { cols: string[] }) {
  return (
    <thead className="hidden md:table-header-group">
      <tr className="border-b border-idw-forest/15 text-left text-xs uppercase tracking-wide text-idw-forest/70">
        {cols.map((c) => (
          <th key={c} scope="col" className="px-2 py-2 font-semibold">{c}</th>
        ))}
      </tr>
    </thead>
  );
}
export function RBody({ children }: { children: ReactNode }) {
  return <tbody className="block md:table-row-group">{children}</tbody>;
}
export function RRow({ children }: { children: ReactNode }) {
  return <tr className="mb-3 block rounded-xl border border-idw-forest/10 bg-white/60 p-3 md:mb-0 md:table-row md:rounded-none md:border-0 md:border-b md:bg-transparent md:p-0">{children}</tr>;
}
export function RCell({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <td
      data-label={label}
      className={`flex items-start justify-between gap-3 py-1 text-right before:shrink-0 before:text-left before:text-xs before:font-semibold before:uppercase before:tracking-wide before:text-idw-forest/70 before:content-[attr(data-label)] md:table-cell md:px-2 md:py-2.5 md:text-left md:align-top md:before:content-none ${className}`}
    >
      <span className="min-w-0 break-words">{children}</span>
    </td>
  );
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-idw-forest/20 p-4 text-sm text-idw-forest/70">{children}</p>;
}

export function FilterLinks({ base, param, options, current, label }: { base: string; param: string; options: [string, string][]; current: string | undefined; label: string }) {
  return (
    <nav aria-label={label} className="mb-4 flex flex-wrap gap-2">
      {options.map(([value, label]) => {
        const active = (current ?? "") === value;
        const href = value ? `${base}?${param}=${encodeURIComponent(value)}` : base;
        return (
          <Link key={value || "all"} href={href} aria-current={active ? "true" : undefined}
            className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold ${active ? "border-idw-forest bg-idw-forest text-idw-parchment" : "border-idw-forest/25 text-idw-forest hover:border-idw-forest/60"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
