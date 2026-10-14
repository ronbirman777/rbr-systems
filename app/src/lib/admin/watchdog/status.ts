import "server-only";
import { WATCHDOG_THRESHOLDS, backupAgeTone, parseWatchdogSummaryV1, type Tone, type WatchdogSummaryV1 } from "./summary";

/**
 * Server-only adapter between the Admin console and the backup watchdog (WS-F).
 *
 * The console never talks to Cloudflare, B2 or GitHub itself. It asks a WatchdogSource for the raw `summary/v1`
 * document and turns the answer into a WatchdogStatus. Batch 1 ships ONLY the default source, which is
 * "not connected": no KV/API access, no credentials, no environment variable read at runtime. A real source
 * (access option A: KV REST read with a read-only token) is Batch 3, after the watchdog is deployed (P-8) and the
 * owner approves the access option and its credential.
 *
 * The dashboard is a viewer, never the alerting path: nothing here sends, acknowledges or writes anything.
 */
export type WatchdogRead =
  /** No source is configured or approved (Batch 1 default). */
  | { kind: "not_configured"; reason: string }
  /** A source is configured but the summary key does not exist (watchdog not deployed / never ran). */
  | { kind: "absent" }
  /** The read itself failed (network, auth, timeout). The message must already be sanitized (no token, no URL). */
  | { kind: "error"; message: string }
  | { kind: "raw"; value: unknown; readAt: Date };

export interface WatchdogSource {
  readonly id: string;
  readSummary(): Promise<WatchdogRead>;
}

/** Reason codes (translated by the page as `rsn_<code>`): not deployed yet (WS-F, P-8) and the access option (A-D) is not approved. */
export const NOT_CONNECTED_REASON = "watchdog_not_connected";

export const notConnectedWatchdogSource: WatchdogSource = {
  id: "not_connected",
  async readSummary() {
    return { kind: "not_configured", reason: NOT_CONNECTED_REASON };
  },
};

export type WatchdogStatus =
  | { state: "not_connected"; reason: string }
  | { state: "error"; reason: "watchdog_read_failed" | "watchdog_unreadable"; detail?: string }
  | {
      state: "ok" | "stale";
      summary: WatchdogSummaryV1;
      summaryAgeMinutes: number;
      backupAgeMs: number | null;
      backupTone: Tone;
      /** The health badge to show: the watchdog's own verdict, or "UNKNOWN" (grey) when the summary is stale. */
      displayHealth: WatchdogSummaryV1["health"];
    };

/** Interprets a read. Pure apart from the clock passed in; exported for tests. */
export function interpretWatchdogRead(read: WatchdogRead, now: Date): WatchdogStatus {
  switch (read.kind) {
    case "not_configured":
      return { state: "not_connected", reason: read.reason };
    case "absent":
      return { state: "not_connected", reason: "watchdog_absent" };
    case "error":
      return { state: "error", reason: "watchdog_read_failed", detail: read.message.slice(0, 120) };
    case "raw": {
      const parsed = parseWatchdogSummaryV1(read.value);
      if (!parsed.ok) return { state: "error", reason: "watchdog_unreadable", detail: parsed.reason };
      const s = parsed.summary;
      const ageMin = (now.getTime() - Date.parse(s.checkedAt)) / 60_000;
      const stale = !(ageMin <= WATCHDOG_THRESHOLDS.summaryMaxAgeMinutes);
      const backupAgeMs = s.facts.lastSuccessAt ? now.getTime() - Date.parse(s.facts.lastSuccessAt) : null;
      return {
        state: stale ? "stale" : "ok",
        summary: s,
        summaryAgeMinutes: Math.floor(ageMin),
        backupAgeMs,
        // A stale summary cannot vouch for freshness: grey, never green.
        backupTone: stale ? "unknown" : backupAgeTone(backupAgeMs),
        displayHealth: stale ? "UNKNOWN" : s.health,
      };
    }
  }
}

export async function getWatchdogStatus(now: Date = new Date(), source: WatchdogSource = notConnectedWatchdogSource): Promise<WatchdogStatus> {
  try {
    return interpretWatchdogRead(await source.readSummary(), now);
  } catch {
    return { state: "error", reason: "watchdog_read_failed" };
  }
}
