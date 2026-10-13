"use server";

import { createClient } from "@/lib/supabase/server";
import { isTenantId } from "@/lib/media/path";
import { buildPublishedShareCard, type PublishedShareCard } from "./publishedCardImage";

/**
 * TASK 033 P1 (A3) - the Flow Share Card's fields, re-read from the
 * PUBLISHED snapshot right after an in-session Publish/Republish, so the
 * card shows the new image without a manual reload.
 *
 * Read-only. Organizer-only through the same RLS-scoped pattern as
 * /api/share-card and /api/qr: a tenant id that is not the signed-in
 * user's own Space selects no `tenants` row, and the result is null.
 * Every call is a fresh request-time read (server actions are never
 * cached), so it can never return the snapshot from before the publish.
 */
export async function loadPublishedShareCard(tenantId: string): Promise<PublishedShareCard | null> {
  if (typeof tenantId !== "string" || !isTenantId(tenantId)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: tenant } = await supabase.from("tenants").select("id").eq("id", tenantId).maybeSingle();
  if (!tenant) return null;

  const { data: published } = await supabase
    .from("published_spaces")
    .select("name, theme, modules, published_at")
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  return buildPublishedShareCard(tenant.id, published);
}
