"use server";

import { createClient } from "@/lib/supabase/server";
import { getPublishAvailability } from "@/lib/spaceTypes/publishAvailability";
import { resolveSpaceType } from "@/lib/spaceTypes/registry";
import { publishSpace, type PublishState } from "@/app/(site)/configurator/retreat/actions";
import { publishTeachSpace } from "@/app/(site)/configurator/teach/actions";

/**
 * My Spaces' Publish/Republish chip. Dispatches by the tenant's DB
 * product_type, read here server-side through the member's RLS-scoped
 * client - never from the form.
 *
 * Retreat calls exactly the same publishSpace() as before; Teach calls
 * publishTeachSpace(). Every other or unknown type fails closed (see
 * getPublishAvailability) - a new type needs an explicit branch here.
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

  const resolved = resolveSpaceType(tenant.product_type);
  if (resolved.kind !== "known") return { error: "This Space type can't be published here.", publishedAt: null };

  switch (resolved.type.id) {
    case "retreat":
      return publishSpace(prev, formData);
    case "teach":
      return publishTeachSpace(tenantId);
    default:
      return { error: "This Space type can't be published here.", publishedAt: null };
  }
}
