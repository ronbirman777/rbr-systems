import { describe, expect, it, vi, beforeEach } from "vitest";
import { makeFakeSupabase } from "@/lib/media/fakeSupabase.test-util";
import type { AudioQuotaPolicy } from "@/lib/billing/audioQuota";

/**
 * TASK B4 - server-side audio entitlement enforcement in the real Studio
 * actions (Teach attachTeachAudio / saveTeachItems / publishTeachSpace and
 * Flow attachFlowAudio / publishSpace), against the shared in-memory
 * Supabase fake. The policy loader is mocked per test; its own I/O is
 * covered in lib/billing/audioQuota.test.ts.
 */

let fake: ReturnType<typeof makeFakeSupabase>;
let policy: AudioQuotaPolicy;

vi.mock("server-only", () => ({}));
vi.mock("sharp", () => ({ default: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/entitlements/getSpaceEntitlement", () => ({ getSpaceEntitlement: async () => null }));
vi.mock("@/lib/entitlements/availability", () => ({ deriveCommercialAvailability: () => ({ canPublish: true }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.supabase }));
vi.mock("@/lib/billing/audioQuota.server", () => ({ loadAudioQuotaPolicy: async () => policy }));
// TASK 032 (0045): on an enforced Space the media copies use the service-role
// client; here that is the same in-memory fake.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fake.supabase }));
// TASK B4b - the service-role finalize half: the server-measured length and
// the verified write. The real module (download + parse with the secret key)
// is covered by lib/media/audioDuration.test.ts; here it is driven per test.
let measured: number | null = null;
let writeRefusal: "studioLocked" | "limit" | "failed" | null = null;
const finalize = vi.hoisted(() => ({ derive: [] as string[], writes: [] as { tenantId: string; itemId: string }[] }));
vi.mock("@/lib/billing/audioFinalize.server", () => ({
  deriveStoredAudioSeconds: async (ref: string) => {
    finalize.derive.push(ref);
    return measured;
  },
  writeEnforcedAudioFile: async (tenantId: string, itemId: string, metadata: Record<string, unknown>) => {
    finalize.writes.push({ tenantId, itemId });
    if (writeRefusal) return { ok: false, reason: writeRefusal };
    const row = fake.tables.module_items.find((r) => r.id === itemId && r.tenant_id === tenantId);
    if (!row) return { ok: false, reason: "failed" };
    row.metadata = metadata;
    return { ok: true };
  },
}));

const TEACH = "11111111-2222-4333-8444-555555555555";
const FLOW = "22222222-2222-4333-8444-555555555555";
const ITEM = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const UPLOAD = "33333333-3333-4333-8333-333333333333";

const base = (libraryMinutes = 240): AudioQuotaPolicy => ({
  mode: "enforced",
  limits: { libraryMinutes, maxRecordingMinutes: 60, listeningMinutesPerMonth: 100_000 },
});

const teachRef = (item = ITEM, ext = "mp3") => `${TEACH}/teachAudioFile/${item}/${UPLOAD}/draft.${ext}`;
const flowRef = (item = ITEM, ext = "mp3") => `${FLOW}/audioFile/${item}/${UPLOAD}/draft.${ext}`;

function seedItem(tenant: string, moduleKey: string, id: string, metadata: Record<string, unknown>) {
  fake.tables.module_items.push({ id, tenant_id: tenant, module_key: moduleKey, title: "Track", image_ref: null, metadata });
}
/** Sets what the server measures and returns a deliberately WRONG browser claim: on a paid Space the claim must not matter. */
const server = (seconds: number | null) => {
  measured = seconds;
  return seconds === null ? 120 : 1;
};
const meta = (id = ITEM) => fake.tables.module_items.find((r) => r.id === id)?.metadata as Record<string, unknown> | undefined;

beforeEach(() => {
  fake = makeFakeSupabase();
  fake.tables.tenants.push({ id: TEACH, product_type: "teach", timezone: "UTC" }, { id: FLOW, product_type: "retreat", timezone: "UTC" });
  policy = base();
  measured = null;
  writeRefusal = null;
  finalize.derive.length = 0;
  finalize.writes.length = 0;
});

async function teach() {
  return import("./teach/actions");
}
async function flow() {
  return import("./retreat/actions");
}

describe("Teach attach - per-recording maximum", () => {
  beforeEach(() => {
    seedItem(TEACH, "teachAudio", ITEM, { audioRef: null, durationSeconds: null });
    fake.put(teachRef(), "x".repeat(1000), undefined, "audio/mpeg");
  });

  it("60:00 (3600 s) is accepted and stored", async () => {
    const { attachTeachAudio } = await teach();
    expect(await attachTeachAudio(TEACH, ITEM, teachRef(), server(3600))).toEqual({ error: null });
    expect(meta()).toMatchObject({ audioRef: teachRef(), durationSeconds: 3600 });
  });

  it("60:01 (3601 s) is refused, localized, and the new upload is removed", async () => {
    const { attachTeachAudio } = await teach();
    expect((await attachTeachAudio(TEACH, ITEM, teachRef(), server(3601))).error).toBe(
      "Each recording can be up to 60 minutes long. Please upload a shorter file."
    );
    expect(meta()?.audioRef).toBeNull();
    expect(fake.files.has(teachRef())).toBe(false);
  });

  it("the refusal is translated (de/he) and Studio tr/it fall back to English", async () => {
    const { attachTeachAudio } = await teach();
    fake.put(teachRef(), "x", undefined, "audio/mpeg");
    expect((await attachTeachAudio(TEACH, ITEM, teachRef(), server(4000), "de")).error).toMatch(/höchstens 60 Minuten/);
    fake.put(teachRef(), "x", undefined, "audio/mpeg");
    expect((await attachTeachAudio(TEACH, ITEM, teachRef(), server(4000), "he")).error).toMatch(/עד 60 דקות/);
    fake.put(teachRef(), "x", undefined, "audio/mpeg");
    expect((await attachTeachAudio(TEACH, ITEM, teachRef(), server(4000), "it")).error).toMatch(/up to 60 minutes/);
  });

  it("an unknown (null) length is refused on a paid Space", async () => {
    const { attachTeachAudio } = await teach();
    expect((await attachTeachAudio(TEACH, ITEM, teachRef(), server(null))).error).toMatch(/couldn't read how long/);
  });

  it("the browser claim is ignored: a 2 h file claimed as 1 s is measured on the server and refused", async () => {
    const { attachTeachAudio } = await teach();
    measured = 7200;
    expect((await attachTeachAudio(TEACH, ITEM, teachRef(), 1)).error).toMatch(/up to 60 minutes/);
    expect(finalize.derive).toEqual([teachRef()]);
    expect(meta()?.audioRef).toBeNull();
  });

  it("the verified file fields are written through the service-role finalize path, never the member session", async () => {
    const { attachTeachAudio } = await teach();
    expect(await attachTeachAudio(TEACH, ITEM, teachRef(), server(1800))).toEqual({ error: null });
    expect(finalize.writes).toEqual([{ tenantId: TEACH, itemId: ITEM }]);
    expect(meta()).toMatchObject({ audioRef: teachRef(), durationSeconds: 1800 });
  });

  it("a database AUDIO_LIMIT refusal on the finalize write (concurrent upload) is reported and the upload removed", async () => {
    const { attachTeachAudio } = await teach();
    writeRefusal = "limit";
    expect((await attachTeachAudio(TEACH, ITEM, teachRef(), server(60))).error).toMatch(/240-minute allowance/);
    expect(fake.files.has(teachRef())).toBe(false);
  });

  it("a Studio-locked Space cannot attach through the service-role path", async () => {
    const { attachTeachAudio } = await teach();
    writeRefusal = "studioLocked";
    expect((await attachTeachAudio(TEACH, ITEM, teachRef(), server(60))).error).toMatch(/needs active access/);
    expect(meta()?.audioRef).toBeNull();
  });

  it("an unavailable policy fails closed", async () => {
    policy = { mode: "unavailable" };
    const { attachTeachAudio } = await teach();
    expect((await attachTeachAudio(TEACH, ITEM, teachRef(), server(10))).error).toMatch(/couldn't check your audio allowance/);
    expect(meta()?.audioRef).toBeNull();
  });
});

describe("Teach attach - library total (incl. add-ons)", () => {
  beforeEach(() => {
    seedItem(TEACH, "teachAudio", ITEM, { audioRef: null, durationSeconds: null });
    fake.put(teachRef(), "x", undefined, "audio/mpeg");
  });

  it("exactly at 240 minutes passes; one second over is refused with the used total", async () => {
    seedItem(TEACH, "teachAudio", OTHER, { audioRef: teachRef(OTHER), durationSeconds: 239 * 60 });
    const { attachTeachAudio } = await teach();
    expect((await attachTeachAudio(TEACH, ITEM, teachRef(), server(61))).error).toBe(
      "This recording would take your audio library over its 240-minute allowance (239 minutes already used)."
    );
    fake.put(teachRef(), "x", undefined, "audio/mpeg");
    expect(await attachTeachAudio(TEACH, ITEM, teachRef(), server(60))).toEqual({ error: null });
  });

  it("one audio add-on (480 library minutes from space_audio_entitlements) admits what the base refuses", async () => {
    seedItem(TEACH, "teachAudio", OTHER, { audioRef: teachRef(OTHER), durationSeconds: 239 * 60 });
    policy = base(480);
    const { attachTeachAudio } = await teach();
    expect(await attachTeachAudio(TEACH, ITEM, teachRef(), server(3600))).toEqual({ error: null });
  });

  it("replacing a file does not count the item's own previous length", async () => {
    seedItem(TEACH, "teachAudio", OTHER, { audioRef: teachRef(OTHER), durationSeconds: 200 * 60 });
    meta()!.audioRef = `${TEACH}/teachAudioFile/${ITEM}/44444444-4444-4444-8444-444444444444/draft.mp3`;
    meta()!.durationSeconds = 40 * 60;
    const { attachTeachAudio } = await teach();
    expect(await attachTeachAudio(TEACH, ITEM, teachRef(), server(40 * 60))).toEqual({ error: null });
  });
});

describe("Teach - legacy and exempt Spaces are unchanged", () => {
  it.each<[string, AudioQuotaPolicy]>([
    ["legacy (no billing row)", { mode: "unenforced", reason: "legacy" }],
    ["exempt", { mode: "unenforced", reason: "exempt" }],
  ])("%s: a 2 h recording and an unknown length still attach", async (_label, p) => {
    policy = p;
    seedItem(TEACH, "teachAudio", ITEM, { audioRef: null, durationSeconds: null });
    fake.put(teachRef(), "x", undefined, "audio/mpeg");
    const { attachTeachAudio } = await teach();
    expect(await attachTeachAudio(TEACH, ITEM, teachRef(), 7200.4)).toEqual({ error: null });
    expect(meta()?.durationSeconds).toBe(7200);
    fake.put(teachRef(), "x", undefined, "audio/mpeg");
    expect(await attachTeachAudio(TEACH, ITEM, teachRef(), null)).toEqual({ error: null });
    expect(meta()?.durationSeconds).toBeNull();
    // Nothing is downloaded or measured, and the member-session write is used as before.
    expect(finalize.derive).toEqual([]);
    expect(finalize.writes).toEqual([]);
  });
});

describe("Teach save - a client snapshot cannot set the file fields on a paid Space", () => {
  const item = (metadata: Record<string, unknown>) => ({ id: ITEM, title: "Track", subtitle: null, description: null, externalLink: null, metadata });

  it("enforced: audioRef/durationSeconds are carried over from the database", async () => {
    seedItem(TEACH, "teachAudio", ITEM, { audioRef: teachRef(), durationSeconds: 600 });
    const { saveTeachItems } = await teach();
    const forged = `${TEACH}/teachAudioFile/${ITEM}/55555555-5555-4555-8555-555555555555/draft.mp3`;
    expect((await saveTeachItems(TEACH, "teachAudio", [item({ audioRef: forged, durationSeconds: 1 })])).error).toBeNull();
    expect(meta()).toMatchObject({ audioRef: teachRef(), durationSeconds: 600 });
  });

  it("legacy: the previous behaviour (client metadata written as sent) is kept", async () => {
    policy = { mode: "unenforced", reason: "legacy" };
    seedItem(TEACH, "teachAudio", ITEM, { audioRef: teachRef(), durationSeconds: 600 });
    const { saveTeachItems } = await teach();
    expect((await saveTeachItems(TEACH, "teachAudio", [item({ audioRef: teachRef(), durationSeconds: 601 })])).error).toBeNull();
    expect(meta()?.durationSeconds).toBe(601);
  });
});

describe("Teach publish - re-check before any media is copied", () => {
  it("over the library allowance: refused before the publish RPC", async () => {
    seedItem(TEACH, "teachAudio", ITEM, { audioRef: teachRef(), durationSeconds: 3600 });
    for (const [i, id] of ["c1", "c2", "c3", "c4"].entries()) {
      seedItem(TEACH, "teachAudio", `cccccccc-cccc-4ccc-8ccc-cccccccccc${i}${i}`, { audioRef: teachRef(`cccccccc-cccc-4ccc-8ccc-cccccccccc${i}${i}`), durationSeconds: id === "c4" ? 1 : 3600 });
    }
    const { publishTeachSpace } = await teach();
    const res = await publishTeachSpace(TEACH);
    expect(res.error).toBe("Your recordings add up to 241 minutes, over this Space's 240-minute audio allowance. Remove some audio before publishing.");
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("a recording with no known length blocks publish", async () => {
    seedItem(TEACH, "teachAudio", ITEM, { audioRef: teachRef(), durationSeconds: null });
    const { publishTeachSpace } = await teach();
    expect((await publishTeachSpace(TEACH)).error).toMatch(/no known length/);
  });

  it("a stored recording over 60:00 blocks publish", async () => {
    seedItem(TEACH, "teachAudio", ITEM, { audioRef: teachRef(), durationSeconds: 3601 });
    const { publishTeachSpace } = await teach();
    expect((await publishTeachSpace(TEACH)).error).toMatch(/longer than 60 minutes/);
  });

  it("items without a file never count", async () => {
    seedItem(TEACH, "teachAudio", ITEM, { audioRef: null, durationSeconds: null });
    const { publishTeachSpace } = await teach();
    expect((await publishTeachSpace(TEACH)).error).toBeNull();
  });

  it("legacy Space with a 5 h library publishes as before", async () => {
    policy = { mode: "unenforced", reason: "legacy" };
    fake.put(teachRef(), "x", undefined, "audio/mpeg");
    seedItem(TEACH, "teachAudio", ITEM, { audioRef: teachRef(), durationSeconds: 5 * 3600 });
    const { publishTeachSpace } = await teach();
    expect((await publishTeachSpace(TEACH)).error).toBeNull();
  });
});

describe("Flow attach and publish", () => {
  beforeEach(() => {
    seedItem(FLOW, "audio", ITEM, { audioRef: null, durationSeconds: null });
    fake.put(flowRef(), "x", undefined, "audio/mpeg");
  });

  it("60:00 passes, 60:01 is refused and removed", async () => {
    const { attachFlowAudio } = await flow();
    expect(await attachFlowAudio(FLOW, ITEM, flowRef(), server(3601))).toEqual({ error: "Each recording can be up to 60 minutes long. Please upload a shorter file." });
    expect(fake.files.has(flowRef())).toBe(false);
    fake.put(flowRef(), "x", undefined, "audio/mpeg");
    expect(await attachFlowAudio(FLOW, ITEM, flowRef(), server(3600))).toEqual({ error: null });
    expect(meta()?.durationSeconds).toBe(3600);
  });

  it("library total counts the Space's other Flow audio", async () => {
    seedItem(FLOW, "audio", OTHER, { audioRef: flowRef(OTHER), durationSeconds: 230 * 60 });
    const { attachFlowAudio } = await flow();
    expect((await attachFlowAudio(FLOW, ITEM, flowRef(), server(11 * 60))).error).toMatch(/240-minute allowance \(230 minutes already used\)/);
  });

  it("exempt Space is not blocked", async () => {
    policy = { mode: "unenforced", reason: "exempt" };
    const { attachFlowAudio } = await flow();
    expect(await attachFlowAudio(FLOW, ITEM, flowRef(), 4 * 3600)).toEqual({ error: null });
  });

  it("publish is refused over the allowance, before the RPC", async () => {
    meta()!.audioRef = flowRef();
    meta()!.durationSeconds = 3600;
    seedItem(FLOW, "audio", OTHER, { audioRef: flowRef(OTHER), durationSeconds: 3 * 3600 + 1 });
    const { publishSpace } = await flow();
    const form = new FormData();
    form.set("tenantId", FLOW);
    const res = await publishSpace({ error: null, publishedAt: null }, form);
    expect(res.error).toMatch(/longer than 60 minutes/);
    expect(fake.rpc).not.toHaveBeenCalled();
  });
});
