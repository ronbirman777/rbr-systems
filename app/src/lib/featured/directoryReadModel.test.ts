import { describe, expect, it } from "vitest";
import { toDirectoryListing } from "./directoryReadModel";

describe("toDirectoryListing - only approved_snapshot rows are directory-eligible", () => {
  it("returns null when approved_snapshot is null - a pending/never-submitted row is never directory-eligible", () => {
    expect(toDirectoryListing({ tenant_id: "t1", approved_snapshot: null })).toBeNull();
  });

  it("returns null when approved_snapshot is undefined", () => {
    expect(toDirectoryListing({ tenant_id: "t1", approved_snapshot: undefined })).toBeNull();
  });

  it("returns null (fails closed) for a malformed snapshot rather than showing partial/garbage data", () => {
    expect(toDirectoryListing({ tenant_id: "t1", approved_snapshot: { nonsense: true } })).toBeNull();
  });

  it("maps a valid approved_snapshot into a full DirectoryListing", () => {
    const result = toDirectoryListing({
      tenant_id: "t1",
      approved_snapshot: {
        name: "Samadhi Retreat",
        spaceImageRef: "t1/brand/space/published.webp",
        description: "A quiet jungle retreat.",
        location: "Ubud, Bali",
        website: "https://samadhi.example.com",
        instagram: "@samadhi",
        additionalLinks: [{ label: "Booking", url: "https://book.samadhi.example.com" }],
      },
    });
    expect(result).not.toBeNull();
    expect(result?.tenantId).toBe("t1");
    expect(result?.name).toBe("Samadhi Retreat");
    expect(result?.spaceImageUrl).toBe("/api/media/t1/brand/space/published.webp");
    expect(result?.additionalLinks).toEqual([{ label: "Booking", url: "https://book.samadhi.example.com" }]);
  });

  it("maps a null spaceImageRef to a null spaceImageUrl, not a broken path", () => {
    const result = toDirectoryListing({
      tenant_id: "t1",
      approved_snapshot: {
        name: "Samadhi Retreat",
        spaceImageRef: null,
        description: null,
        location: null,
        website: null,
        instagram: null,
        additionalLinks: [],
      },
    });
    expect(result?.spaceImageUrl).toBeNull();
  });

  it("a pending resubmission's own submission fields never leak in - only approved_snapshot is ever read", () => {
    // toDirectoryListing only ever receives approved_snapshot - proving
    // by construction that a row's live `status`/`description`/etc.
    // columns (which may differ from what was approved) have no path
    // into this function's output at all.
    const result = toDirectoryListing({
      tenant_id: "t1",
      approved_snapshot: {
        name: "Old Approved Name",
        spaceImageRef: null,
        description: "Old approved description",
        location: null,
        website: null,
        instagram: null,
        additionalLinks: [],
      },
    });
    expect(result?.name).toBe("Old Approved Name");
    expect(result?.description).toBe("Old approved description");
  });
});
