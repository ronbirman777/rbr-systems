/**
 * Shared media-path architecture for tenant Storage uploads. One bucket,
 * one deterministic path shape, reused by every module that will ever
 * attach files - only Facilitator photos exist today, but meal photography,
 * treatment/facility images, resource files and brand assets (logo, hero)
 * all plug into this same convention later without a new bucket or a new
 * upload code path: just a different moduleKey/itemId.
 *
 * One object per item (itemId) - "replace" is an upsert at the same path,
 * "remove" is a delete at the same path. No orphaned files unless the
 * upload's file type changes the extension, which callers handle by
 * removing the previous path first.
 */
export const MEDIA_BUCKET = "tenant-media";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const ALLOWED_IMAGE_TYPES = Object.keys(EXTENSION_BY_TYPE);

export function extensionForMimeType(type: string): string | null {
  return EXTENSION_BY_TYPE[type] ?? null;
}

/**
 * The DRAFT object an organizer is actively editing in the configurator.
 * Deliberately a distinct object from its published counterpart (see
 * publishedMediaPath below) - replacing or removing a draft photo must
 * never retroactively change what a guest is currently seeing, only the
 * next Publish/Republish should. Text content already gets this for free
 * (published_spaces stores a copied value, not a live reference); media
 * needs the same guarantee applied deliberately, since Storage objects are
 * referenced by path, not copied into the database.
 */
export function tenantMediaPath(tenantId: string, moduleKey: string, itemId: string, ext: string): string {
  return `${tenantId}/${moduleKey}/${itemId}/draft.${ext}`;
}

/**
 * The stable, publish-scoped copy of a draft object - what actually gets
 * referenced from published_spaces.modules. Publish/Republish (see
 * publishSpace in configurator/retreat/actions.ts) copies the current
 * draft bytes here; nothing else ever writes to this path. The transform
 * is a pure string derivation (swap the "draft" path segment for
 * "published") so the database function that builds the published
 * snapshot (publish_space in migration 0007) can derive the exact same
 * path from image_ref with plain SQL, with no extra parameters and no
 * risk of the two computations drifting - they share this one convention.
 */
export function publishedMediaPath(draftPath: string): string | null {
  const match = draftPath.match(/^(.*)\/draft\.([a-zA-Z0-9]+)$/);
  if (!match) return null;
  return `${match[1]}/published.${match[2]}`;
}

/**
 * The item's own folder ("{tenantId}/{moduleKey}/{itemId}") - used to list
 * and clean up stale sibling objects (e.g. a "published.png" left behind
 * after the organizer replaces a photo with a different file type and
 * republishes - the new copy lands at "published.jpg", so nothing else
 * would ever remove the old one without this).
 */
export function mediaItemFolder(draftPath: string): string | null {
  const match = draftPath.match(/^(.*)\/draft\.[a-zA-Z0-9]+$/);
  return match ? match[1] : null;
}

/**
 * The public delivery path for an already-published media reference - what
 * the guest app's <img src> actually points at. Deliberately just
 * `/api/media/<path>`: the delivery route re-validates the path against the
 * tenant's real published snapshot before it will ever mint a signed URL,
 * so this string carries no capability by itself.
 */
export function publicMediaUrl(imageRef: string): string {
  return `/api/media/${imageRef}`;
}

/**
 * Walks a published_spaces.modules payload and collects every string value
 * found under a key literally named "imageRef", anywhere in the structure.
 * This is what makes the guest media route generic across future modules -
 * a new module's published items just need an `imageRef` field and they're
 * automatically covered, no route changes required.
 */
export function collectImageRefs(modules: unknown): Set<string> {
  const refs = new Set<string>();
  function walk(node: unknown) {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === "imageRef" && typeof value === "string") {
          refs.add(value);
        } else {
          walk(value);
        }
      }
    }
  }
  walk(modules);
  return refs;
}
