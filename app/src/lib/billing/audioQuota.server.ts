import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decideAudioQuotaPolicy, UNAVAILABLE_AUDIO_POLICY, type AudioQuotaPolicy } from "./audioQuota";

/**
 * Reads the audio quota policy for one Space. READ-ONLY, and only called by
 * Studio actions AFTER they have verified the signed-in user's access to the
 * tenant. It uses the service-role client because neither billing_plans,
 * space_subscription_addons nor space_audio_entitlements() is readable by
 * `authenticated`, and because an RLS read of space_subscriptions is
 * owner-only (a non-owner member would otherwise look like a legacy Space and
 * slip past enforcement). Any read failure is "unavailable" (fail closed).
 */
export async function loadAudioQuotaPolicy(tenantId: string): Promise<AudioQuotaPolicy> {
  try {
    const admin = createAdminClient();
    const { data: sub, error } = await admin.from("space_subscriptions").select("status").eq("tenant_id", tenantId).maybeSingle();
    if (error) return UNAVAILABLE_AUDIO_POLICY;
    if (!sub) return decideAudioQuotaPolicy(null, null);
    if (sub.status === "exempt") return decideAudioQuotaPolicy(sub, null);
    const { data, error: rpcError } = await admin.rpc("space_audio_entitlements", { p_tenant_id: tenantId });
    if (rpcError) return UNAVAILABLE_AUDIO_POLICY;
    const row = Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
    return decideAudioQuotaPolicy(sub, row);
  } catch {
    return UNAVAILABLE_AUDIO_POLICY;
  }
}
