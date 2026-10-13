import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  audioQuotaMessageKey,
  audioQuotaMessageValues,
  checkAudioAttach,
  checkAudioPublish,
  decideAudioQuotaPolicy,
  enforcedAttachWriteIssue,
  normalizeReportedDuration,
  type AudioQuotaIssue,
  type AudioQuotaPolicy,
  type StoredAudioItem,
} from "./audioQuota";
import { computeAudioEntitlements } from "./entitlements";
import { translate } from "@/lib/i18n";

const BUNDLE = {
  audio: { libraryMinutes: 240, maxRecordingMinutes: 60, listeningMinutesPerMonth: 100000 },
  addons: { audio_pack: { priceMinor: 500, currency: "USD", libraryMinutes: 240, listeningMinutesPerMonth: 70000 } },
};
const enforced = (qty = 0): AudioQuotaPolicy => ({ mode: "enforced", limits: computeAudioEntitlements(BUNDLE, qty) });
const LEGACY: AudioQuotaPolicy = { mode: "unenforced", reason: "legacy" };
const EXEMPT: AudioQuotaPolicy = { mode: "unenforced", reason: "exempt" };
const file = (durationSeconds: unknown) => ({ metadata: { audioRef: "t/m/i/u/draft.mp3", durationSeconds } });
/** Enforced Spaces are checked against the SERVER-measured seconds; unenforced ones against the browser claim. */
const attach = (policy: AudioQuotaPolicy, seconds: unknown, others: StoredAudioItem[] = [], claimedSeconds: unknown = seconds) =>
  checkAudioAttach(policy, { claimedSeconds, serverSeconds: seconds as number | null, otherItems: others });

describe("decideAudioQuotaPolicy", () => {
  it("no billing row = legacy (unchanged), exempt = unenforced, others enforced from the entitlement row", () => {
    expect(decideAudioQuotaPolicy(null, null)).toEqual(LEGACY);
    expect(decideAudioQuotaPolicy({ status: "exempt" }, null)).toEqual(EXEMPT);
    for (const status of ["active", "past_due", "trialing", "incomplete", "canceled"]) {
      expect(decideAudioQuotaPolicy({ status }, { library_minutes: 480, max_recording_minutes: 60, listening_minutes_per_month: 170000 })).toEqual({
        mode: "enforced",
        limits: { libraryMinutes: 480, maxRecordingMinutes: 60, listeningMinutesPerMonth: 170000 },
      });
    }
  });

  it("a paid row without a readable entitlement fails closed", () => {
    expect(decideAudioQuotaPolicy({ status: "active" }, null)).toEqual({ mode: "unavailable" });
    expect(decideAudioQuotaPolicy({ status: "active" }, { library_minutes: null, max_recording_minutes: 60, listening_minutes_per_month: 1 })).toEqual({ mode: "unavailable" });
    expect(decideAudioQuotaPolicy({ status: "active" }, { library_minutes: 0, max_recording_minutes: 60, listening_minutes_per_month: 1 })).toEqual({ mode: "unavailable" });
  });
});

describe("per-recording maximum (never raised by add-ons)", () => {
  it("60:00 passes, 60:01 is refused, at 0 and 2 add-ons", () => {
    for (const qty of [0, 2]) {
      expect(attach(enforced(qty), 3600)).toEqual({ ok: true, durationSeconds: 3600 });
      expect(attach(enforced(qty), 3601)).toEqual({ ok: false, issue: { code: "recordingTooLong", maxMinutes: 60 } });
    }
  });

  it("the measured value must be whole seconds (rounding is the measurer's job: toWholeSeconds)", () => {
    expect(attach(enforced(), 3600.4)).toEqual({ ok: false, issue: { code: "durationUnknown" } });
  });

  it("an unmeasurable file (null), negative, NaN or non-number is refused when enforced", () => {
    for (const v of [null, undefined, -1, Number.NaN, Infinity, "3600"]) {
      expect(attach(enforced(), v)).toEqual({ ok: false, issue: { code: "durationUnknown" } });
    }
  });

  it("a measured length over 12 h is too long (not unknown)", () => {
    expect(attach(enforced(), 13 * 3600)).toEqual({ ok: false, issue: { code: "recordingTooLong", maxMinutes: 60 } });
  });
});

describe("the browser-reported length is ignored on an enforced Space (TASK B4b)", () => {
  it("an under-reported claim changes nothing: the server-measured seconds are checked and stored", () => {
    expect(attach(enforced(), 600, [], 1)).toEqual({ ok: true, durationSeconds: 600 });
    expect(attach(enforced(), 3601, [], 60)).toEqual({ ok: false, issue: { code: "recordingTooLong", maxMinutes: 60 } });
  });

  it("a plausible claim cannot rescue a file the server could not measure", () => {
    expect(attach(enforced(), null, [], 120)).toEqual({ ok: false, issue: { code: "durationUnknown" } });
  });

  it("unenforced Spaces never consult the server value", () => {
    expect(attach(LEGACY, 99_999, [], 125.4)).toEqual({ ok: true, durationSeconds: 125 });
  });
});

describe("a refused service-role finalize write", () => {
  it("maps to a localized issue (DB AUDIO_LIMIT race -> library full with the used minutes)", () => {
    const limits = computeAudioEntitlements(BUNDLE, 0);
    expect(enforcedAttachWriteIssue("limit", limits, [file(3600), file(30)])).toEqual({ code: "libraryFull", limitMinutes: 240, usedMinutes: 61 });
    expect(enforcedAttachWriteIssue("failed", limits, [])).toEqual({ code: "unavailable" });
    expect(enforcedAttachWriteIssue("studioLocked", limits, [])).toBe("studioLocked");
  });
});

describe("library total", () => {
  it("exactly 240:00 passes; 240:01 is refused with used minutes rounded up", () => {
    const others = [file(3600), file(3600), file(3600), file(3540)];
    expect(attach(enforced(), 60, others).ok).toBe(true);
    expect(attach(enforced(), 61, others)).toEqual({ ok: false, issue: { code: "libraryFull", limitMinutes: 240, usedMinutes: 239 } });
  });

  it("each add-on adds 240 library minutes", () => {
    const seven = Array.from({ length: 7 }, () => file(3600));
    expect(attach(enforced(0), 3600, seven.slice(0, 3)).ok).toBe(true); // 240 of 240
    expect(attach(enforced(0), 3600, seven.slice(0, 4)).ok).toBe(false);
    expect(attach(enforced(1), 3600, seven).ok).toBe(true); // 480 of 480
    expect(attach(enforced(1), 3600, [...seven, file(1)]).ok).toBe(false);
    expect(attach(enforced(2), 3600, [...seven, file(3600)]).ok).toBe(true); // 540 of 720
  });

  it("items without a file and items with unknown length do not count at attach", () => {
    const others = [{ metadata: { audioRef: null, durationSeconds: 99999 } }, file(null), { metadata: null }];
    expect(attach(enforced(), 3600, others).ok).toBe(true);
  });
});

describe("unenforced and unavailable", () => {
  it("legacy/exempt keep the pre-B4 normalization byte for byte", () => {
    for (const p of [LEGACY, EXEMPT]) {
      expect(attach(p, 7200.4)).toEqual({ ok: true, durationSeconds: 7200 });
      expect(attach(p, null)).toEqual({ ok: true, durationSeconds: null });
      expect(attach(p, 13 * 3600)).toEqual({ ok: true, durationSeconds: null });
      expect(attach(p, -1)).toEqual({ ok: true, durationSeconds: null });
      expect(checkAudioPublish(p, [file(99 * 3600), file(null)])).toEqual({ ok: true });
    }
    expect(normalizeReportedDuration(12 * 3600)).toBe(12 * 3600);
  });

  it("unavailable refuses both stages", () => {
    expect(attach({ mode: "unavailable" }, 10)).toEqual({ ok: false, issue: { code: "unavailable" } });
    expect(checkAudioPublish({ mode: "unavailable" }, [])).toEqual({ ok: false, issue: { code: "unavailable" } });
    expect(checkAudioPublish(enforced(), null)).toEqual({ ok: false, issue: { code: "unavailable" } });
  });
});

describe("checkAudioPublish", () => {
  it("boundaries", () => {
    expect(checkAudioPublish(enforced(), [file(3600), file(3600), file(3600), file(3600)])).toEqual({ ok: true });
    expect(checkAudioPublish(enforced(), [file(3600), file(3600), file(3600), file(3600), file(1)])).toEqual({
      ok: false,
      issue: { code: "libraryFull", limitMinutes: 240, usedMinutes: 241 },
    });
    expect(checkAudioPublish(enforced(), [file(3601)])).toEqual({ ok: false, issue: { code: "recordingTooLong", maxMinutes: 60 } });
    expect(checkAudioPublish(enforced(), [file(10), file(null)])).toEqual({ ok: false, issue: { code: "durationUnknown" } });
    expect(checkAudioPublish(enforced(1), Array.from({ length: 8 }, () => file(3600)))).toEqual({ ok: true });
  });
});

describe("messages - localized in every Studio locale", () => {
  const issues: AudioQuotaIssue[] = [
    { code: "unavailable" },
    { code: "durationUnknown" },
    { code: "recordingTooLong", maxMinutes: 60 },
    { code: "libraryFull", limitMinutes: 240, usedMinutes: 239 },
  ];
  it("every locale has its own wording with the numbers interpolated (tr/it translated in TASK 033)", () => {
    for (const stage of ["attach", "publish"] as const) {
      for (const issue of issues) {
        const key = audioQuotaMessageKey(issue, stage);
        const values = audioQuotaMessageValues(issue);
        const en = translate("en", "studio", key, values);
        expect(en).not.toMatch(/[{}]/);
        for (const v of Object.values(values)) expect(en).toContain(String(v));
        for (const locale of ["de", "es", "fr", "he", "tr", "it"] as const) {
          const text = translate(locale, "studio", key, values);
          expect(text, `${locale}.${key}`).not.toBe(en);
          expect(text).not.toMatch(/[{}]/);
          for (const v of Object.values(values)) expect(text).toContain(String(v));
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// loadAudioQuotaPolicy (the I/O half) - mocked service-role client.
// ---------------------------------------------------------------------------
const admin = { sub: null as unknown, subError: null as unknown, ent: null as unknown, entError: null as unknown, throws: false, rpcCalls: 0 };
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    if (admin.throws) throw new Error("no key");
    return {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: admin.sub, error: admin.subError }) }) }) }),
      rpc: async (name: string) => {
        admin.rpcCalls += 1;
        expect(name).toBe("space_audio_entitlements");
        return { data: admin.ent, error: admin.entError };
      },
    };
  },
}));

describe("loadAudioQuotaPolicy", () => {
  beforeEach(() => Object.assign(admin, { sub: null, subError: null, ent: null, entError: null, throws: false, rpcCalls: 0 }));
  const load = async () => (await import("./audioQuota.server")).loadAudioQuotaPolicy("t");

  it("no row -> legacy without calling the entitlement RPC", async () => {
    expect(await load()).toEqual(LEGACY);
    expect(admin.rpcCalls).toBe(0);
  });
  it("exempt -> unenforced", async () => {
    admin.sub = { status: "exempt" };
    expect(await load()).toEqual(EXEMPT);
  });
  it("active + add-on row from space_audio_entitlements -> enforced with the RPC's numbers", async () => {
    admin.sub = { status: "active" };
    admin.ent = [{ library_minutes: 480, max_recording_minutes: 60, listening_minutes_per_month: 170000 }];
    expect(await load()).toEqual({ mode: "enforced", limits: { libraryMinutes: 480, maxRecordingMinutes: 60, listeningMinutesPerMonth: 170000 } });
  });
  it("any read failure fails closed", async () => {
    admin.subError = { message: "x" };
    expect(await load()).toEqual({ mode: "unavailable" });
    Object.assign(admin, { subError: null, sub: { status: "active" }, entError: { message: "y" } });
    expect(await load()).toEqual({ mode: "unavailable" });
    Object.assign(admin, { entError: null, ent: [] });
    expect(await load()).toEqual({ mode: "unavailable" });
    admin.throws = true;
    expect(await load()).toEqual({ mode: "unavailable" });
  });
});
