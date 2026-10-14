import Link from "next/link";
import type { ReactNode } from "react";
import type { MetricState, MoneyMetric, Quality } from "@/lib/admin/contracts/metric";
import { UNKNOWN_CURRENCY } from "@/lib/admin/contracts/metric";
import { formatUtc, money, type AdminCtx, type AdminKey } from "@/lib/billing/admin/ui/labels";
import { Badge } from "./ui";
import { cardCls, linkCls } from "./styles";

/**
 * Rendering of the metric contract (ADMIN-METRIC-CONTRACTS.md §1.2). Only a state that carries a value renders a
 * number; every other state renders its message. There is no code path that turns a missing value into "0".
 */

const REASON_KEYS: Record<string, AdminKey> = {
  snapshots_missing: "rsn_snapshots_missing",
  billing_missing: "rsn_billing_missing",
  alerts_not_built: "rsn_alerts_not_built",
  usage_not_connected: "rsn_usage_not_connected",
  costs_not_connected: "rsn_costs_not_connected",
  watchdog_not_connected: "rsn_watchdog_not_connected",
  watchdog_absent: "rsn_watchdog_absent",
  watchdog_read_failed: "rsn_watchdog_read_failed",
  watchdog_unreadable: "rsn_watchdog_unreadable",
  table_missing: "rsn_table_missing",
};

/** A reason code from a loader, translated; an unknown code is shown verbatim (never dropped). */
export function reasonText(code: string, c: AdminCtx): string {
  return code in REASON_KEYS ? c.t(REASON_KEYS[code]) : code;
}

const QUALITY_KEYS: Record<Quality, AdminKey> = { actual: "qualityActual", estimated: "qualityEstimated", manual: "qualityManual" };

/** The value of a metric, or its state message. `format` turns the number into text (count by default). */
export function MetricValue({ m, c, format }: { m: MetricState; c: AdminCtx; format?: (n: number) => string }) {
  const fmt = format ?? ((n: number) => new Intl.NumberFormat(c.locale).format(n));
  switch (m.state) {
    case "ok":
      return <span data-metric-state="ok" className="tabular-nums">{fmt(m.value)}</span>;
    case "stale":
      return <span data-metric-state="stale" className="tabular-nums text-idw-forest/50">{fmt(m.value)}</span>;
    case "truncated":
      return <span data-metric-state="truncated" className="tabular-nums">≥ {fmt(m.value)}</span>;
    case "no_source":
      return <span data-metric-state="no_source" className="text-base font-medium text-idw-forest/60">{c.t("msNoSource")}</span>;
    case "not_measured":
      return <span data-metric-state="not_measured" className="text-base font-medium text-idw-forest/60">{c.t("msNotMeasured")}</span>;
    case "not_applicable":
      return <span data-metric-state="not_applicable" className="text-idw-forest/60" title={reasonText(m.reason, c)}>—</span>;
    case "error":
      return <span data-metric-state="error" role="status" className="text-base font-medium text-red-800">{c.t("msError")}</span>;
  }
}

/** The line under a value: as-of + quality for a value; the reason / source for everything else. */
export function MetricMeta({ m, c }: { m: MetricState; c: AdminCtx }) {
  switch (m.state) {
    case "ok":
      return <span className="inline-flex flex-wrap items-center gap-1.5"><Badge>{c.t(QUALITY_KEYS[m.quality])}</Badge><span>{c.t("msAsOf", { time: formatUtc(m.asOf, c) })}</span></span>;
    case "stale":
      return <span className="inline-flex flex-wrap items-center gap-1.5"><Badge tone="warn">{c.t("msStaleBadge")}</Badge><span>{c.t("msStale", { time: formatUtc(m.staleSince, c) })}</span></span>;
    case "truncated":
      return <span className="inline-flex flex-wrap items-center gap-1.5"><Badge tone="warn">{c.t("msTruncatedBadge")}</Badge><span>{c.t("msTruncated", { bound: new Intl.NumberFormat(c.locale).format(m.bound) })}</span></span>;
    case "no_source":
    case "not_measured":
    case "not_applicable":
      return <span>{reasonText(m.reason, c)}</span>;
    case "error":
      return <span>{c.t("msErrorSource", { source: m.source })}</span>;
  }
}

export function MetricTile({ label, m, c, caption, href, format }: { label: string; m: MetricState; c: AdminCtx; caption?: string; href?: string; format?: (n: number) => string }) {
  return (
    <div className={`${cardCls} flex flex-col`} data-metric-label={label}>
      <div className="text-xs font-semibold uppercase tracking-wide text-idw-forest/70">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-idw-forest"><MetricValue m={m} c={c} format={format} /></div>
      <div className="mt-2 text-xs leading-snug text-idw-forest/70"><MetricMeta m={m} c={c} /></div>
      {caption ? <p className="mt-1 text-xs leading-snug text-idw-forest/70">{caption}</p> : null}
      {href ? <p className="mt-2 text-xs"><Link className={linkCls} href={href}>{c.t("ovcOpenSection")}</Link></p> : null}
    </div>
  );
}

/** One line per currency (never a cross-currency total); the unknown-currency bucket is labelled as such. */
export function MoneyLines({ by, c }: { by: MoneyMetric; c: AdminCtx }): ReactNode {
  const entries = Object.entries(by);
  if (!entries.length) return <span className="text-base font-medium text-idw-forest/70">{c.t("ovcMrrNone")}</span>;
  return (
    <>
      {entries.map(([cur, m]) => (
        <span key={cur} className="block">
          <MetricValue m={m} c={c} format={(n) => (cur === UNKNOWN_CURRENCY ? `${new Intl.NumberFormat(c.locale).format(n)} (minor)` : money(n, cur, c.locale))} />{" "}
          <span className="text-sm font-normal text-idw-forest/70">{cur === UNKNOWN_CURRENCY ? c.t("ovcCurrencyUnknown") : cur}</span>
        </span>
      ))}
    </>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 mt-8 font-ui text-lg text-idw-forest first:mt-0">{children}</h2>;
}

export function TileGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}
