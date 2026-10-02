import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isTenantId } from "@/lib/media/path";
import { studioRouteDecision, type SpaceTypeId } from "@/lib/spaceTypes/registry";

/**
 * Resolves the Studio tenant for the current request, or ends the request with
 * notFound()/redirect(). `expectedProductType` is the Studio the route belongs
 * to; it is required (not defaulted) so every caller states its product and
 * React's per-request cache() key is always the same two arguments. A tenant of
 * another known product is redirected to its own Studio (the tenant row only
 * comes back for members, so this reveals nothing the member could not already
 * open); an unknown/unsupported type or a missing/hidden tenant is a 404 - a
 * tenant is never rendered by the wrong product's Studio.
 *
 * Called from the route layout - which renders OUTSIDE the segment's
 * loading.tsx Suspense boundary, so the HTTP status is still changeable - and
 * again from the page, where React's per-request cache() makes it free.
 * Otherwise notFound() thrown inside the boundary arrives after the 200 shell
 * has already been flushed.
 */
export const loadStudioTenant = cache(async (tenantId: string, expectedProductType: SpaceTypeId) => {
  if (!isTenantId(tenantId)) notFound();
  const supabase = await createClient();
  // Independent reads, run together so the layout adds one round trip in
  // front of the first byte, not two. RLS scopes the tenant read to tenants
  // the signed-in user is a member of - a draft belonging to someone else
  // simply won't come back, regardless of the id - and a signed-out
  // visitor never reaches the result (redirected below).
  const [
    {
      data: { user },
    },
    { data: tenant },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("tenants")
      .select("id, name, timezone, slug, product_type, status")
      .eq("id", tenantId)
      .maybeSingle(),
  ]);
  if (!user) redirect("/log-in");
  if (!tenant) notFound();
  const route = studioRouteDecision(tenant.product_type, expectedProductType, tenant.id);
  if (route.action === "redirect") redirect(route.href);
  if (route.action === "unsupported") notFound();
  return { supabase, tenant };
});
