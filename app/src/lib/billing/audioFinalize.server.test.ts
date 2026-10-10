import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

/**
 * TASK 032 (0046): the service-role finalize half records SERVER PROVENANCE - the measured length plus a content
 * fingerprint (size + sha256) of the very bytes that were measured - through billing_audio_attach_verified(), and
 * hands the recorded fingerprints to Publish. The audio parser itself is covered by lib/media/audioDuration.test.ts.
 */

vi.mock("server-only", () => ({}));
const parse = vi.hoisted(() => ({ result: { ok: true, seconds: 61.97 } as { ok: true; seconds: number } | { ok: false; reason: "malformed" } }));
vi.mock("@/lib/media/audioDuration", () => ({
  deriveAudioDuration: () => parse.result,
  toWholeSeconds: (s: number) => Math.round(s),
}));

const admin = vi.hoisted(() => ({
  bytes: null as Uint8Array | null,
  rpc: vi.fn(),
  rows: [] as { audio_ref: string; size_bytes: number | string; sha256: string; published_size_bytes?: number | string | null; published_sha256?: string | null; published_etag?: string | null }[],
  selectError: null as { message: string } | null,
  eq: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        download: async () => (admin.bytes ? { data: new Blob([admin.bytes as BlobPart]), error: null } : { data: null, error: { message: "Object not found" } }),
      }),
    },
    rpc: (...a: unknown[]) => admin.rpc(...a),
    from: (table: string) => {
      expect(table).toBe("billing_audio_verifications");
      return {
        select: () => ({
          eq: async (col: string, v: string) => {
            admin.eq(col, v);
            return { data: admin.selectError ? null : admin.rows, error: admin.selectError };
          },
        }),
      };
    },
  }),
}));

const T = "11111111-2222-4333-8444-555555555555";
const I = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const REF = `${T}/teachAudioFile/${I}/33333333-3333-4333-8333-333333333333/draft.mp3`;

beforeEach(() => {
  admin.bytes = new TextEncoder().encode("ID3-fake-audio-bytes");
  admin.rpc.mockReset();
  admin.eq.mockReset();
  admin.rows = [];
  admin.selectError = null;
  parse.result = { ok: true, seconds: 61.97 };
});

describe("measureStoredAudio", () => {
  it("measures and fingerprints the SAME downloaded bytes", async () => {
    const { measureStoredAudio } = await import("./audioFinalize.server");
    const sha = createHash("sha256").update(admin.bytes!).digest("hex");
    expect(await measureStoredAudio(REF, "mp3")).toEqual({ seconds: 62, sizeBytes: admin.bytes!.byteLength, sha256: sha });
  });

  it("fails closed (null) when the object is missing, empty or cannot be measured", async () => {
    const { measureStoredAudio } = await import("./audioFinalize.server");
    parse.result = { ok: false, reason: "malformed" };
    expect(await measureStoredAudio(REF, "mp3")).toBeNull();
    parse.result = { ok: true, seconds: 10 };
    admin.bytes = new Uint8Array(0);
    expect(await measureStoredAudio(REF, "mp3")).toBeNull();
    admin.bytes = null;
    expect(await measureStoredAudio(REF, "mp3")).toBeNull();
  });
});

describe("writeEnforcedAudioFile", () => {
  const fp = { sizeBytes: 20, sha256: "a".repeat(64) };
  const metadata = { audioRef: REF, durationSeconds: 62 };

  it("writes through billing_audio_attach_verified (provenance + metadata in one transaction)", async () => {
    admin.rpc.mockImplementation(async (fn: string) => (fn === "space_studio_writable" ? { data: true, error: null } : { data: null, error: null }));
    const { writeEnforcedAudioFile } = await import("./audioFinalize.server");
    expect(await writeEnforcedAudioFile(T, I, metadata, fp)).toEqual({ ok: true });
    expect(admin.rpc).toHaveBeenCalledWith("billing_audio_attach_verified", {
      p_tenant_id: T,
      p_item_id: I,
      p_metadata: metadata,
      p_size_bytes: 20,
      p_sha256: "a".repeat(64),
    });
  });

  it("a Studio-suspended Space is refused before the write", async () => {
    admin.rpc.mockResolvedValue({ data: false, error: null });
    const { writeEnforcedAudioFile } = await import("./audioFinalize.server");
    expect(await writeEnforcedAudioFile(T, I, metadata, fp)).toEqual({ ok: false, reason: "studioLocked" });
    expect(admin.rpc).toHaveBeenCalledTimes(1);
  });

  it("maps the database refusals: AUDIO_LIMIT -> limit, anything else (AUDIO_UNVERIFIED, errors) -> failed", async () => {
    const { writeEnforcedAudioFile } = await import("./audioFinalize.server");
    for (const [hint, reason] of [["AUDIO_LIMIT", "limit"], ["AUDIO_UNVERIFIED", "failed"], [null, "failed"]] as const) {
      admin.rpc.mockImplementation(async (fn: string) =>
        fn === "space_studio_writable" ? { data: true, error: null } : { data: null, error: { message: "refused", hint } }
      );
      expect(await writeEnforcedAudioFile(T, I, metadata, fp)).toEqual({ ok: false, reason });
    }
  });
});

describe("loadAudioFingerprints", () => {
  it("returns this Space's recorded fingerprints keyed by draft ref", async () => {
    admin.rows = [{ audio_ref: REF, size_bytes: "20", sha256: "b".repeat(64) }];
    const { loadAudioFingerprints } = await import("./audioFinalize.server");
    const map = await loadAudioFingerprints(T);
    expect(admin.eq).toHaveBeenCalledWith("tenant_id", T);
    expect(map?.get(REF)).toEqual({ sizeBytes: 20, sha256: "b".repeat(64), published: null });
  });

  it("carries a verified published copy's ETag only when it was recorded for the same bytes", async () => {
    admin.rows = [
      { audio_ref: REF, size_bytes: "20", sha256: "b".repeat(64), published_size_bytes: "20", published_sha256: "b".repeat(64), published_etag: "e1" },
      { audio_ref: `${REF}x`, size_bytes: "20", sha256: "b".repeat(64), published_size_bytes: "21", published_sha256: "b".repeat(64), published_etag: "e2" },
    ];
    const { loadAudioFingerprints } = await import("./audioFinalize.server");
    const map = await loadAudioFingerprints(T);
    expect(map?.get(REF)?.published).toEqual({ sizeBytes: 20, etag: "e1" });
    expect(map?.get(`${REF}x`)?.published).toBeNull();
  });

  it("an unreadable table is null (Publish fails closed)", async () => {
    admin.selectError = { message: "boom" };
    const { loadAudioFingerprints } = await import("./audioFinalize.server");
    expect(await loadAudioFingerprints(T)).toBeNull();
  });
});
