/**
 * The contract the deployed backup watchdog (infra `innerdwes-backup-watchdog`, KV key `summary/v1`) must satisfy
 * for the Admin Backups & DR view (docs/admin/BACKUP-WATCHDOG-MONITORING-VIEW.md §3, ADMIN-METRIC-CONTRACTS.md §3.6/§5).
 *
 * Shape written by the Worker today (watchdog/src/index.ts `runOnce`, rules.ts `evaluate`):
 *   { health, checked_at, unknown[], open[{ fp, severity, since }], facts{...} }
 *
 * The parser is STRICT: an unknown health value, a non-ISO checked_at, a non-array unknown/open, or a malformed open
 * entry makes the whole summary `invalid` (rendered as "error", never HEALTHY). Unknown fact keys are ignored;
 * unknown fingerprints are kept verbatim so a new watchdog rule never disappears from the view.
 *
 * Pure (no I/O). No object names or credentials exist in this shape by design; the parser drops nothing it does not
 * know into the page except the declared fields.
 */

export const WATCHDOG_HEALTH = ["HEALTHY", "WARNING", "CRITICAL", "UNKNOWN"] as const;
export type WatchdogHealth = (typeof WATCHDOG_HEALTH)[number];
export const WATCHDOG_SEVERITY = ["warning", "critical"] as const;
export type WatchdogSeverity = (typeof WATCHDOG_SEVERITY)[number];
export const WATCHDOG_SOURCES = ["b2", "github", "delivery"] as const;

/**
 * Thresholds pinned here until summary/v2 carries the watchdog's own values (gap G-1). They MUST equal infra
 * `watchdog/src/config.ts` CONFIG.staleWarningH / staleCriticalH (owner decision 2026-10-13); a test pins them.
 */
export const WATCHDOG_THRESHOLDS = {
  backupWarningHours: 8,
  backupCriticalHours: 12,
  /** Three missed 30-minute evaluations (Healthchecks period 30 min + grace 60 min). */
  summaryMaxAgeMinutes: 90,
  credentialWarningDays: 14,
  credentialCriticalDays: 3,
} as const;

export type WatchdogOpenAlert = { fp: string; severity: WatchdogSeverity; since: string };

export type WatchdogFacts = {
  lastSuccessAt: string | null;
  backupCount: number | null;
  lastAttemptStatus: string | null;
  deleted24h: number | null;
  lastRunStartedAt: string | null;
  b2KeyExpiresAt: string | null;
  githubTokenExpiresAt: string | null;
  /** facts.b2 / facts.github === "unavailable": the watchdog could not read that source this evaluation. */
  b2Unavailable: boolean;
  githubUnavailable: boolean;
};

export type WatchdogSummaryV1 = {
  health: WatchdogHealth;
  checkedAt: string;
  unknown: string[];
  open: WatchdogOpenAlert[];
  facts: WatchdogFacts;
};

export type ParseResult = { ok: true; summary: WatchdogSummaryV1 } | { ok: false; reason: string };

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const isIso = (v: unknown): v is string => typeof v === "string" && ISO.test(v) && !Number.isNaN(Date.parse(v));
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isoOrNull = (v: unknown): string | null => (isIso(v) ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown, max = 40): string | null => (typeof v === "string" && v.length <= max && /^[a-z_]+$/.test(v) ? v : null);
/** Fingerprints are short dotted identifiers (e.g. "backup.stale", "credential.b2_key"). Anything else is malformed. */
const FINGERPRINT = /^[a-z0-9_]+(\.[a-z0-9_]+){0,3}$/;

export function parseWatchdogSummaryV1(raw: unknown): ParseResult {
  if (!isObj(raw)) return { ok: false, reason: "not an object" };
  if (typeof raw.health !== "string" || !(WATCHDOG_HEALTH as readonly string[]).includes(raw.health)) return { ok: false, reason: "unknown health value" };
  if (!isIso(raw.checked_at)) return { ok: false, reason: "checked_at is not an ISO timestamp" };
  if (!Array.isArray(raw.unknown) || !raw.unknown.every((u) => typeof u === "string" && (WATCHDOG_SOURCES as readonly string[]).includes(u))) return { ok: false, reason: "unknown[] malformed" };
  if (!Array.isArray(raw.open)) return { ok: false, reason: "open is not an array" };
  const open: WatchdogOpenAlert[] = [];
  for (const a of raw.open) {
    if (!isObj(a) || typeof a.fp !== "string" || !FINGERPRINT.test(a.fp) || !(WATCHDOG_SEVERITY as readonly string[]).includes(a.severity as string) || !isIso(a.since)) {
      return { ok: false, reason: "open[] entry malformed" };
    }
    open.push({ fp: a.fp, severity: a.severity as WatchdogSeverity, since: a.since });
  }
  const f = isObj(raw.facts) ? raw.facts : null;
  if (!f) return { ok: false, reason: "facts missing" };
  return {
    ok: true,
    summary: {
      health: raw.health as WatchdogHealth,
      checkedAt: raw.checked_at,
      unknown: raw.unknown as string[],
      open,
      facts: {
        lastSuccessAt: isoOrNull(f.last_success_at),
        backupCount: numOrNull(f.backup_count),
        lastAttemptStatus: strOrNull(f.last_attempt_status),
        deleted24h: numOrNull(f.deleted_24h),
        lastRunStartedAt: isoOrNull(f.last_run_started_at),
        b2KeyExpiresAt: isoOrNull(f["credential.b2_key_expires_at"]),
        githubTokenExpiresAt: isoOrNull(f["credential.github_token_expires_at"]),
        b2Unavailable: f.b2 === "unavailable",
        githubUnavailable: f.github === "unavailable",
      },
    },
  };
}

export type Tone = "good" | "warn" | "bad" | "unknown";

/** Backup age colour: green <= 8 h, amber > 8 h and <= 12 h, red > 12 h (matching `>` in the watchdog's rules.ts). */
export function backupAgeTone(ageMs: number | null): Tone {
  if (ageMs == null || !Number.isFinite(ageMs) || ageMs < 0) return "unknown";
  const h = 3_600_000;
  if (ageMs > WATCHDOG_THRESHOLDS.backupCriticalHours * h) return "bad";
  if (ageMs > WATCHDOG_THRESHOLDS.backupWarningHours * h) return "warn";
  return "good";
}

/** Credential expiry colour: <= 3 d red, <= 14 d amber; unknown expiry is amber ("expiry unknown"), never green. */
export function credentialTone(expiresAt: string | null, now: Date): Tone {
  if (!expiresAt) return "warn";
  const days = (Date.parse(expiresAt) - now.getTime()) / 86_400_000;
  if (days <= WATCHDOG_THRESHOLDS.credentialCriticalDays) return "bad";
  if (days <= WATCHDOG_THRESHOLDS.credentialWarningDays) return "warn";
  return "good";
}
