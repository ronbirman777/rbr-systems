import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { WATCHDOG_THRESHOLDS, backupAgeTone, credentialTone, parseWatchdogSummaryV1 } from "./summary";
import { getWatchdogStatus, interpretWatchdogRead, notConnectedWatchdogSource, type WatchdogSource } from "./status";

/** BACKUP-WATCHDOG-MONITORING-VIEW.md §7 (parser + boundaries) and the Batch 1 "not connected" default. */
const NOW = new Date("2026-10-14T12:00:00Z");
const H = 3_600_000;
const iso = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString();

/** A summary exactly as watchdog/src/index.ts writes it. */
const summary = (o: Record<string, unknown> = {}) => ({
  health: "HEALTHY",
  checked_at: iso(10 * 60_000),
  unknown: [],
  open: [],
  facts: { checked_at: iso(10 * 60_000), last_success_at: iso(3 * H), backup_count: 334, last_attempt_status: "success", deleted_24h: 0, last_run_started_at: iso(3.2 * H), "credential.b2_key_expires_at": iso(-200 * 24 * H), health: "HEALTHY" },
  ...o,
});

describe("thresholds are pinned to the watchdog's owner-approved values (gap G-1)", () => {
  it("8 h warning, 12 h critical, 90 min summary staleness, 14 / 3 day credential expiry", () => {
    expect(WATCHDOG_THRESHOLDS).toEqual({ backupWarningHours: 8, backupCriticalHours: 12, summaryMaxAgeMinutes: 90, credentialWarningDays: 14, credentialCriticalDays: 3 });
  });
});

describe("backup age boundaries (match `>` in the watchdog's rules.ts)", () => {
  it("exactly 8 h is green, 8 h + 1 s amber, exactly 12 h amber, 12 h + 1 s red", () => {
    expect(backupAgeTone(8 * H)).toBe("good");
    expect(backupAgeTone(8 * H + 1000)).toBe("warn");
    expect(backupAgeTone(12 * H)).toBe("warn");
    expect(backupAgeTone(12 * H + 1000)).toBe("bad");
    expect(backupAgeTone(0)).toBe("good");
  });
  it("no age, a negative or a non-finite age is unknown (grey), never green", () => {
    expect(backupAgeTone(null)).toBe("unknown");
    expect(backupAgeTone(-1)).toBe("unknown");
    expect(backupAgeTone(Number.NaN)).toBe("unknown");
  });
  it("credential expiry: unknown expiry is amber; <= 14 d amber; <= 3 d red", () => {
    expect(credentialTone(null, NOW)).toBe("warn");
    expect(credentialTone(iso(-30 * 24 * H), NOW)).toBe("good");
    expect(credentialTone(iso(-14 * 24 * H), NOW)).toBe("warn");
    expect(credentialTone(iso(-3 * 24 * H), NOW)).toBe("bad");
    expect(credentialTone(iso(1 * H), NOW)).toBe("bad");
  });
});

describe("strict summary/v1 parser: anything unexpected is an error, never HEALTHY", () => {
  it("accepts the shape the Worker writes", () => {
    const r = parseWatchdogSummaryV1(summary());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.summary.facts).toMatchObject({ backupCount: 334, lastAttemptStatus: "success", b2Unavailable: false });
  });
  it.each<[string, unknown]>([
    ["not an object", "HEALTHY"],
    ["null", null],
    ["unknown health", summary({ health: "GREEN" })],
    ["lower-case health", summary({ health: "healthy" })],
    ["non-ISO checked_at", summary({ checked_at: "yesterday" })],
    ["epoch checked_at", summary({ checked_at: 1760443200000 })],
    ["open not an array", summary({ open: {} })],
    ["unknown not an array", summary({ unknown: "b2" })],
    ["unknown source", summary({ unknown: ["kv"] })],
    ["open entry with bad severity", summary({ open: [{ fp: "backup.stale", severity: "info", since: iso(H) }] })],
    ["open entry with a path-like fingerprint", summary({ open: [{ fp: "backups/2026/file.jpg", severity: "critical", since: iso(H) }] })],
    ["open entry without since", summary({ open: [{ fp: "backup.stale", severity: "critical" }] })],
    ["facts missing", summary({ facts: undefined })],
  ])("%s -> rejected", (_name, raw) => {
    expect(parseWatchdogSummaryV1(raw).ok).toBe(false);
    const s = interpretWatchdogRead({ kind: "raw", value: raw, readAt: NOW }, NOW);
    expect(s.state).toBe("error");
  });
  it("an unknown fingerprint is kept verbatim (a new watchdog rule never disappears)", () => {
    const r = parseWatchdogSummaryV1(summary({ health: "WARNING", open: [{ fp: "backup.future_rule_x", severity: "warning", since: iso(H) }] }));
    expect(r.ok && r.summary.open[0].fp).toBe("backup.future_rule_x");
  });
  it("source unavailability is carried through", () => {
    const r = parseWatchdogSummaryV1(summary({ health: "UNKNOWN", unknown: ["b2"], facts: { b2: "unavailable", github: "unavailable" } }));
    expect(r.ok && r.summary.facts).toMatchObject({ b2Unavailable: true, githubUnavailable: true, lastSuccessAt: null, backupCount: null });
  });
});

describe("status interpretation", () => {
  it("a fresh summary keeps the watchdog's verdict and the 8/12 h tone", () => {
    const s = interpretWatchdogRead({ kind: "raw", value: summary(), readAt: NOW }, NOW);
    expect(s).toMatchObject({ state: "ok", displayHealth: "HEALTHY", backupTone: "good", summaryAgeMinutes: 10 });
  });
  it("a summary older than 90 min is stale: grey health even if it says HEALTHY", () => {
    const at90 = interpretWatchdogRead({ kind: "raw", value: summary({ checked_at: iso(90 * 60_000) }), readAt: NOW }, NOW);
    expect(at90.state).toBe("ok");
    const s = interpretWatchdogRead({ kind: "raw", value: summary({ checked_at: iso(91 * 60_000) }), readAt: NOW }, NOW);
    expect(s).toMatchObject({ state: "stale", displayHealth: "UNKNOWN", backupTone: "unknown" });
  });
  it("no verified success recorded -> no age, tone unknown", () => {
    const s = interpretWatchdogRead({ kind: "raw", value: summary({ facts: {} }), readAt: NOW }, NOW);
    expect(s).toMatchObject({ state: "ok", backupAgeMs: null, backupTone: "unknown" });
  });
  it("absent summary and failed reads are not_connected / error, with no alert count", () => {
    expect(interpretWatchdogRead({ kind: "absent" }, NOW)).toEqual({ state: "not_connected", reason: "watchdog_absent" });
    expect(interpretWatchdogRead({ kind: "error", message: "timeout" }, NOW)).toMatchObject({ state: "error", reason: "watchdog_read_failed" });
  });
});

describe("Batch 1 default: NOT CONNECTED, with no network or env access", () => {
  it("the default source is not_connected and getWatchdogStatus uses it", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const envBefore = { ...process.env };
    await expect(getWatchdogStatus(NOW)).resolves.toEqual({ state: "not_connected", reason: "watchdog_not_connected" });
    expect(notConnectedWatchdogSource.id).toBe("not_connected");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(process.env).toEqual(envBefore);
    fetchSpy.mockRestore();
  });
  it("a source that throws is an error state, never healthy", async () => {
    const bad: WatchdogSource = { id: "x", readSummary: async () => { throw new Error("token=abc"); } };
    await expect(getWatchdogStatus(NOW, bad)).resolves.toEqual({ state: "error", reason: "watchdog_read_failed" });
  });
});
