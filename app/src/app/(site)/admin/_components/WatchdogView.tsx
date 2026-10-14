import type { WatchdogStatus } from "@/lib/admin/watchdog/status";
import { formatUtc, type AdminCtx, type AdminKey } from "@/lib/billing/admin/ui/labels";
import { reasonText } from "./MetricView";
import { Badge } from "./ui";

/**
 * Watchdog status rendering (BACKUP-WATCHDOG-MONITORING-VIEW.md §1, §3). UNKNOWN / NOT CONNECTED / stale / error are
 * grey or red, never green, and never "0 alerts".
 */
const HEALTH_KEYS: Record<string, AdminKey> = { HEALTHY: "bkHealth_HEALTHY", WARNING: "bkHealth_WARNING", CRITICAL: "bkHealth_CRITICAL", UNKNOWN: "bkHealth_UNKNOWN" };
const HEALTH_TONE = { HEALTHY: "good", WARNING: "warn", CRITICAL: "bad", UNKNOWN: "neutral" } as const;

export function WatchdogHealthBadge({ s, c }: { s: WatchdogStatus; c: AdminCtx }) {
  if (s.state === "not_connected") return <Badge>{c.t("bkNotConnected")}</Badge>;
  if (s.state === "error") return <Badge tone="bad">{c.t("bkError")}</Badge>;
  return <Badge tone={HEALTH_TONE[s.displayHealth]}>{c.t(HEALTH_KEYS[s.displayHealth])}</Badge>;
}

/** "Last verified backup N h ago" with the 8 / 12 h colour, or the reason there is no such figure. */
export function BackupFreshness({ s, c }: { s: WatchdogStatus; c: AdminCtx }) {
  if (s.state === "not_connected") return <span data-watchdog-state="not_connected" className="text-base font-medium text-idw-forest/60">{c.t("bkNotConnected")}</span>;
  if (s.state === "error") return <span data-watchdog-state="error" className="text-base font-medium text-red-800">{c.t("bkError")}</span>;
  if (s.backupAgeMs == null) return <span data-watchdog-state="no_success" className="text-base font-medium text-red-800">{c.t("bkNoVerifiedSuccess")}</span>;
  const hours = Math.floor(s.backupAgeMs / 3_600_000);
  const tone = s.backupTone === "good" ? "text-emerald-800" : s.backupTone === "warn" ? "text-amber-800" : s.backupTone === "bad" ? "text-red-800" : "text-idw-forest/50";
  return <span data-watchdog-state={s.state} data-backup-tone={s.backupTone} className={`tabular-nums ${tone}`}>{c.t("ovcBackupAge", { hours })}</span>;
}

export function WatchdogMeta({ s, c }: { s: WatchdogStatus; c: AdminCtx }) {
  if (s.state === "not_connected") return <span>{reasonText(s.reason, c)}</span>;
  if (s.state === "error") return <span>{reasonText(s.reason, c)}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {s.state === "stale" ? <Badge tone="warn">{c.t("msStaleBadge")}</Badge> : null}
      <span>{s.state === "stale" ? c.t("bkStale", { minutes: s.summaryAgeMinutes }) : c.t("msAsOf", { time: formatUtc(s.summary.checkedAt, c) })}</span>
    </span>
  );
}
