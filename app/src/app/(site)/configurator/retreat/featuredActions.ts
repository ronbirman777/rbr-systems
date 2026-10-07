"use server";

import { createClient } from "@/lib/supabase/server";
import { validateAdditionalLinks } from "./featuredValidation";

import { localeFromFormData, studioMessages } from "@/lib/i18n";
export type FeaturedStatus = "not_submitted" | "submitted" | "approved" | "rejected";

export type FeaturedSubmission = {
  status: FeaturedStatus;
  description: string | null;
  location: string | null;
  website: string | null;
  instagram: string | null;
  additionalLinks: { label: string; url: string }[];
  submittedAt: string | null;
  hasApprovedSnapshot: boolean;
};

const EMPTY_SUBMISSION: FeaturedSubmission = {
  status: "not_submitted",
  description: null,
  location: null,
  website: null,
  instagram: null,
  additionalLinks: [],
  submittedAt: null,
  hasApprovedSnapshot: false,
};

/** Same "migration 0016 not applied yet" tolerance as guestAccessActions.ts -
 * this table doesn't exist in Production yet, and the Featured panel must
 * render a sane empty state rather than crash Studio until it lands. */
function isTableMissingError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    !!error.message?.includes("Could not find the table")
  );
}

export async function getFeaturedSubmissionForOwner(tenantId: string): Promise<FeaturedSubmission> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("space_featured_submissions")
    .select("status, description, location, website, instagram, additional_links, submitted_at, approved_snapshot")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    if (isTableMissingError(error)) return EMPTY_SUBMISSION;
    return EMPTY_SUBMISSION;
  }
  if (!data) return EMPTY_SUBMISSION;

  return {
    status: (data.status as FeaturedStatus) ?? "not_submitted",
    description: data.description,
    location: data.location,
    website: data.website,
    instagram: data.instagram,
    additionalLinks: Array.isArray(data.additional_links) ? data.additional_links : [],
    submittedAt: data.submitted_at,
    hasApprovedSnapshot: data.approved_snapshot !== null,
  };
}

export type SubmitFeaturedListingState = { error: string | null; submission: FeaturedSubmission };

export async function submitFeaturedListing(
  _prevState: SubmitFeaturedListingState,
  formData: FormData
): Promise<SubmitFeaturedListingState> {
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedIn"), submission: EMPTY_SUBMISSION };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: t("missingSpace"), submission: EMPTY_SUBMISSION };

  const description = String(formData.get("description") ?? "").trim() || null;
  const location = String(formData.get("location") ?? "").trim() || null;
  const website = String(formData.get("website") ?? "").trim() || null;
  const instagram = String(formData.get("instagram") ?? "").trim() || null;

  if (description && description.length > 1000) {
    return { error: t("descriptionTooLong"), submission: await getFeaturedSubmissionForOwner(tenantId) };
  }
  if (location && location.length > 200) {
    return { error: t("locationTooLong"), submission: await getFeaturedSubmissionForOwner(tenantId) };
  }
  if (website && (website.length > 500 || !/^https?:\/\//i.test(website))) {
    return { error: t("websiteMustBeHttp"), submission: await getFeaturedSubmissionForOwner(tenantId) };
  }
  if (instagram && !/^(https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]{1,30}\/?|@?[A-Za-z0-9._]{1,30})$/i.test(instagram)) {
    return { error: t("instagramInvalid"), submission: await getFeaturedSubmissionForOwner(tenantId) };
  }

  let additionalLinks: { label: string; url: string }[] = [];
  try {
    additionalLinks = JSON.parse(String(formData.get("additionalLinks") ?? "[]"));
  } catch {
    return { error: t("couldNotReadAdditionalLinks"), submission: await getFeaturedSubmissionForOwner(tenantId) };
  }
  const linksError = validateAdditionalLinks(additionalLinks, localeFromFormData(formData));
  if (linksError) return { error: linksError, submission: await getFeaturedSubmissionForOwner(tenantId) };

  const { error } = await supabase.rpc("submit_featured_listing", {
    p_tenant_id: tenantId,
    p_description: description,
    p_location: location,
    p_website: website,
    p_instagram: instagram,
    p_additional_links: additionalLinks,
  });

  if (error) {
    if (isTableMissingError(error) || error.message?.includes("Could not find the function")) {
      return { error: t("featuredUnavailable"), submission: EMPTY_SUBMISSION };
    }
    return { error: error.message, submission: await getFeaturedSubmissionForOwner(tenantId) };
  }

  return { error: null, submission: await getFeaturedSubmissionForOwner(tenantId) };
}
