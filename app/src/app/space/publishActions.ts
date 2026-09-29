"use server";

import { createClient } from "@/lib/supabase/server";
import { resolveSpaceType, type SpaceTypeId } from "@/lib/spaceTypes/registry";
import { publishSpace, type PublishState } from "@/app/configurator/retreat/actions";
import { publishTeachSpace } from "@/app/configurator/teach/actions";

/**
 * My Spaces' Publish/Republish chip. Each Space type has its own publish
 * action (they differ in which draft media they snapshot before calling
 * the shared publish_space() RPC), so the chip must dispatch by the
 * tenant's DB product_type - read here, server-side, through the member's
 * RLS-scoped client. Retreat calls exactly the same publishSpace() as
 * before; an unknown or unpublishable type fails with a clear error.
 */
const PUBLISHERS: Record<SpaceTypeId, ((prev: PublishState, formData: FormData) => Promise<PublishState>) | null> = {
  retreat: publishSpace,
  teach: async (_prev, formData) => publishTeachSpace(String(formData.get("tenantId") ?? "")),
  client_hub: null,
};

export async function publishSpaceByType(prev: PublishState, formData: FormData): Promise<PublishState> {
  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: "Missing space.", publishedAt: null };
  const supabase = await createClient();
  const { data: tenant } = await supabase.from("tenants").select("product_type").eq("id", tenantId).maybeSingle();
  if (!tenant) return { error: "Space not found.", publishedAt: null };
  const resolved = resolveSpaceType(tenant.product_type);
  const publish = resolved.kind === "known" ? PUBLISHERS[resolved.type.id] : null;
  if (!publish) return { error: "This Space type can't be published here.", publishedAt: null };
  return publish(prev, formData);
}
