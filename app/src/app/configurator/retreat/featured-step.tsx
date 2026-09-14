"use client";

import { useActionState, useState } from "react";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import { StudioHeading, StudioIntro, StudioLabel, STUDIO_INPUT_CLASS } from "./studio-ui";
import {
  submitFeaturedListing,
  type FeaturedSubmission,
  type SubmitFeaturedListingState,
} from "./featuredActions";

export type FeaturedStepProps = {
  tenantId: string;
  name: string;
  spaceImageUrl: string | null;
  initialSubmission: FeaturedSubmission;
};

const STATUS_COPY: Record<FeaturedSubmission["status"], { label: string; dotClass: string }> = {
  not_submitted: { label: "Not submitted", dotClass: "bg-idw-forest/30" },
  submitted: { label: "Pending review", dotClass: "bg-idw-clay" },
  approved: { label: "Approved", dotClass: "bg-idw-sage" },
  rejected: { label: "Not approved", dotClass: "bg-idw-forest/30" },
};

type LinkDraft = { label: string; url: string };

/**
 * Distribution phase - Featured on InnerDweS. An explicit organizer
 * opt-in, never automatic listing (§ "This is a submission for
 * review... does NOT automatically publish"). Reuses the Space's own
 * name/Space Image (already available from Identity/Brand) rather than
 * asking the organizer to retype them - only genuinely new fields
 * (description/location/website/instagram/links) are collected here.
 */
export function FeaturedStep({ tenantId, name, spaceImageUrl, initialSubmission }: FeaturedStepProps) {
  const [submission, setSubmission] = useState(initialSubmission);
  const [description, setDescription] = useState(initialSubmission.description ?? "");
  const [location, setLocation] = useState(initialSubmission.location ?? "");
  const [website, setWebsite] = useState(initialSubmission.website ?? "");
  const [instagram, setInstagram] = useState(initialSubmission.instagram ?? "");
  const [links, setLinks] = useState<LinkDraft[]>(
    initialSubmission.additionalLinks.length > 0 ? initialSubmission.additionalLinks : []
  );

  const initialState: SubmitFeaturedListingState = { error: null, submission: initialSubmission };
  const [state, formAction, pending] = useActionState(async (prev: SubmitFeaturedListingState, fd: FormData) => {
    const result = await submitFeaturedListing(prev, fd);
    if (!result.error) setSubmission(result.submission);
    return result;
  }, initialState);

  const statusCopy = STATUS_COPY[submission.status];
  const hasBeenReviewed = submission.status === "approved" || submission.status === "rejected";

  function addLink() {
    if (links.length >= 6) return;
    setLinks((prev) => [...prev, { label: "", url: "" }]);
  }
  function updateLink(index: number, patch: Partial<LinkDraft>) {
    setLinks((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }
  function removeLink(index: number) {
    setLinks((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="max-w-2xl">
      <StudioHeading>Featured on InnerDweS</StudioHeading>
      <StudioIntro>
        I&apos;d like my retreat to be featured on InnerDweS. This is a submission for review - it does not
        automatically publish your retreat to a public directory. InnerDweS reviews every submission before it
        goes live.
      </StudioIntro>

      <div className="rounded-2xl border p-5 flex items-center gap-4 mb-6" style={{ borderColor: "rgba(45,74,62,0.12)" }}>
        <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0" style={{ background: GUEST_BASE_PALETTE.parchmentDeep }}>
          {spaceImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={spaceImageUrl} alt={name} className="w-full h-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium truncate" style={{ color: GUEST_BASE_PALETTE.forest }}>
            {name}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`w-2 h-2 rounded-full ${statusCopy.dotClass}`} />
            <span className="text-xs font-semibold" style={{ color: GUEST_BASE_PALETTE.forest }}>
              {statusCopy.label}
            </span>
          </div>
        </div>
      </div>

      {submission.hasApprovedSnapshot && submission.status === "submitted" && (
        <p className="text-[12px] leading-relaxed mb-5 rounded-xl px-3 py-2.5" style={{ background: `${GUEST_BASE_PALETTE.sage}22`, color: GUEST_BASE_PALETTE.forest }}>
          Your previously approved listing stays live on InnerDweS while this revision is pending review. It won&apos;t
          be replaced until the new version is approved.
        </p>
      )}
      {submission.status === "rejected" && (
        <p className="text-[12px] leading-relaxed mb-5 rounded-xl px-3 py-2.5" style={{ background: `${GUEST_BASE_PALETTE.sand}40`, color: GUEST_BASE_PALETTE.dusk }}>
          This submission wasn&apos;t approved. You can update the details below and submit again.
        </p>
      )}

      <form action={formAction}>
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="additionalLinks" value={JSON.stringify(links.filter((l) => l.label || l.url))} />

        <div className="space-y-4">
          <div>
            <StudioLabel>Description</StudioLabel>
            <textarea
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
              rows={4}
              maxLength={1000}
              placeholder="What makes your retreat worth featuring?"
              className={`${STUDIO_INPUT_CLASS} resize-none`}
            />
            <p className="text-[10px] mt-1" style={{ color: GUEST_BASE_PALETTE.mist }}>
              {description.length}/1000
            </p>
          </div>

          <div>
            <StudioLabel>Location</StudioLabel>
            <input
              name="location"
              value={location}
              onChange={(e) => setLocation(e.target.value.slice(0, 200))}
              placeholder="e.g. Ubud, Bali"
              className={STUDIO_INPUT_CLASS}
            />
          </div>

          <div>
            <StudioLabel>Website</StudioLabel>
            <input
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://yourretreat.com"
              className={STUDIO_INPUT_CLASS}
            />
          </div>

          <div>
            <StudioLabel>Instagram</StudioLabel>
            <input
              name="instagram"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="@yourretreat or a profile link"
              className={STUDIO_INPUT_CLASS}
            />
          </div>

          <div>
            <StudioLabel>Additional links (up to 6)</StudioLabel>
            <div className="space-y-2">
              {links.map((link, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={link.label}
                    onChange={(e) => updateLink(i, { label: e.target.value.slice(0, 60) })}
                    placeholder="Label"
                    className={`${STUDIO_INPUT_CLASS} w-28 shrink-0`}
                  />
                  <input
                    value={link.url}
                    onChange={(e) => updateLink(i, { url: e.target.value })}
                    placeholder="https://…"
                    className={STUDIO_INPUT_CLASS}
                  />
                  <button
                    type="button"
                    onClick={() => removeLink(i)}
                    className="shrink-0 text-[11px] px-2"
                    style={{ color: GUEST_BASE_PALETTE.mist }}
                    aria-label={`Remove link ${i + 1}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            {links.length < 6 && (
              <button
                type="button"
                onClick={addLink}
                className="mt-2 text-[11px] font-medium px-3 py-1.5 rounded-full border"
                style={{ color: GUEST_BASE_PALETTE.forest, borderColor: "rgba(45,74,62,0.2)" }}
              >
                + Add link
              </button>
            )}
          </div>
        </div>

        {state.error && (
          <p className="text-sm text-red-700 mt-4" role="alert">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-6 rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-6 py-3 disabled:opacity-60"
        >
          {pending ? "Submitting…" : hasBeenReviewed ? "Resubmit for review" : "Submit for review"}
        </button>
      </form>
    </div>
  );
}
