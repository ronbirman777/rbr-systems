import { z } from "zod";
import { publicMediaUrl } from "@/lib/media/path";

/**
 * The complete stable public representation frozen into
 * space_featured_submissions.approved_snapshot at approval time - see
 * the Featured approval architecture doc (supabase/verification/0016_
 * featured_approval_and_directory_design.md) for how it's constructed.
 * Never read from the live/editable submission columns.
 */
export const approvedSnapshotSchema = z.object({
  name: z.string(),
  spaceImageRef: z.string().nullable(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  website: z.string().nullable(),
  instagram: z.string().nullable(),
  additionalLinks: z.array(z.object({ label: z.string(), url: z.string() })),
});

export type ApprovedSnapshot = z.infer<typeof approvedSnapshotSchema>;

export type DirectoryListing = {
  tenantId: string;
  name: string;
  spaceImageUrl: string | null;
  description: string | null;
  location: string | null;
  website: string | null;
  instagram: string | null;
  additionalLinks: { label: string; url: string }[];
};

/**
 * The one rule a future public directory read must never violate: only
 * rows with a non-null approved_snapshot are directory-eligible, and the
 * snapshot itself - never the live/editable submission columns on the
 * same row - is what gets shown. A pending resubmission sitting
 * alongside an existing approved_snapshot must not change what this
 * returns; a malformed/corrupt snapshot fails closed (returns null,
 * excluding that Space) rather than showing partial/garbage data.
 */
export function toDirectoryListing(row: { tenant_id: string; approved_snapshot: unknown }): DirectoryListing | null {
  if (row.approved_snapshot === null || row.approved_snapshot === undefined) return null;

  const parsed = approvedSnapshotSchema.safeParse(row.approved_snapshot);
  if (!parsed.success) return null;

  return {
    tenantId: row.tenant_id,
    name: parsed.data.name,
    spaceImageUrl: parsed.data.spaceImageRef ? publicMediaUrl(parsed.data.spaceImageRef) : null,
    description: parsed.data.description,
    location: parsed.data.location,
    website: parsed.data.website,
    instagram: parsed.data.instagram,
    additionalLinks: parsed.data.additionalLinks,
  };
}
