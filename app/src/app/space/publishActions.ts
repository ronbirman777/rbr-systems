"use server";

import { createClient } from "@/lib/supabase/server";
import { getPublishAvailability } from "@/lib/spaceTypes/publishAvailability";
import { publishSpace, type PublishState } from "@/app/configurator/retreat/actions";

/**
 * My Spaces' Publish/Republish chip. Dispatches by the tenant's DB
 * product_type, read here server-side through the member's RLS-scoped
 * client - never from the form.
 *
 * Retreat calls exactly the same publishSpace() as before. Every other type
 * fails closed until it has a complete publish path (see
 * getPublishAvailability): this module deliberately does NOT import any other
 * product's publish action, so no incomplete payload can be published from
 * here.
 */
export async function publishSpaceByType(prev: PublishState, formData: FormData): Promise<PublishState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in.", publishedAt: null };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: "Missing space.", publishedAt: null };

  const { data: tenant } = await supabase.from("tenants").select("product_type").eq("id", tenantId).maybeSingle();
  if (!tenant) return { error: "Space not found.", publishedAt: null };

  const availability = getPublishAvailability(tenant.product_type);
  if (!availability.available) return { error: availability.message, publishedAt: null };

  return publishSpace(prev, formData);
}
