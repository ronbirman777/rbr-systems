import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isReferencedDraftAudio } from "./draftAuthorization";

const T = "11111111-1111-4111-8111-111111111111";
const O = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";
const REF = `${T}/teachAudioFile/${ITEM}/up-2/draft.mp3`;

function client(rows: Array<{ id: string; tenant_id: string; metadata: unknown }>, error: unknown = null) {
  return {
    from: () => {
      const f: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((f[c] = v), q),
        maybeSingle: async () => ({ data: rows.find((r) => r.id === f.id && r.tenant_id === f.tenant_id) ?? null, error }),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

describe("isReferencedDraftAudio", () => {
  const rows = [{ id: ITEM, tenant_id: T, metadata: { audioRef: REF } }];

  it("true only for the exact ref the current draft row holds", async () => {
    expect(await isReferencedDraftAudio(client(rows), T, REF)).toBe(true);
  });

  it("false for a stale version, an unattached upload, a published sibling, another tenant, a malformed or image path", async () => {
    const c = client(rows);
    expect(await isReferencedDraftAudio(c, T, `${T}/teachAudioFile/${ITEM}/up-1/draft.mp3`)).toBe(false);
    expect(await isReferencedDraftAudio(c, T, `${T}/teachAudioFile/${ITEM}/up-2/published.mp3`)).toBe(false);
    expect(await isReferencedDraftAudio(c, O, REF)).toBe(false);
    expect(await isReferencedDraftAudio(c, T, `${T}/teachAudioFile/${ITEM}/draft.mp3`)).toBe(false);
    expect(await isReferencedDraftAudio(c, T, `${T}/teachAudioFile/${ITEM}/up-2/draft.webp`)).toBe(false);
    expect(await isReferencedDraftAudio(client([{ id: ITEM, tenant_id: T, metadata: { audioRef: null } }]), T, REF)).toBe(false);
    expect(await isReferencedDraftAudio(client([{ id: ITEM, tenant_id: T, metadata: null }]), T, REF)).toBe(false);
  });

  it("false when the row is not visible (RLS) or the lookup errors", async () => {
    expect(await isReferencedDraftAudio(client([]), T, REF)).toBe(false);
    expect(await isReferencedDraftAudio(client(rows, { message: "boom" }), T, REF)).toBe(false);
  });
});
