/**
 * Shared media-path architecture for tenant Storage uploads. One bucket,
 * one deterministic path shape, reused by every module that attaches
 * files (module items, module covers, brand images) - a different
 * moduleKey/itemId, never a new bucket or upload code path.
 *
 * Every upload gets its own unique folder (TASK 023):
 * `{tenantId}/{moduleKey}/{itemId}/{uploadId}/draft.webp`. Publish copies
 * it to `.../{uploadId}/published.webp`, and that published object is
 * never rewritten with different bytes - replacing a photo creates a NEW
 * uploadId (and so a new published key on the next Publish) rather than
 * overwriting anything the live snapshot may reference. Studio only ever
 * touches `draft.*` objects; `published.*` objects are created by Publish
 * and removed only by the post-publish sweep (publishedCleanup.ts), once
 * the snapshot no longer references them.
 *
 * Legacy single-path media (`.../{itemId}/draft.webp` with no uploadId
 * folder) still resolves through the same draft->published transform; it
 * is not migrated here.
 */
export const MEDIA_BUCKET = "tenant-media";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const ALLOWED_IMAGE_TYPES = Object.keys(EXTENSION_BY_TYPE);

export function extensionForMimeType(type: string): string | null {
  return EXTENSION_BY_TYPE[type] ?? null;
}

/** Pulled out as its own pure function so the accept/reject boundary is
 * unit-testable without a real upload - see uploadModuleItemPhoto in
 * configurator/retreat/actions.ts, the only caller. */
export function isFileSizeAllowed(sizeBytes: number): boolean {
  return sizeBytes > 0 && sizeBytes <= MAX_IMAGE_BYTES;
}

/**
 * Every accepted upload is re-encoded (see optimizeUploadedImage in
 * actions.ts) before it's stored, regardless of the input format - so the
 * object we actually write always has this extension, never the source
 * file's own one. Keeps the draft/published path convention (below)
 * single-format instead of needing to track/derive the original type at
 * every consumer.
 */
export const OPTIMIZED_IMAGE_EXTENSION = "webp";
export const OPTIMIZED_IMAGE_MIME = "image/webp";

/** Long-edge cap applied by optimizeUploadedImage - guests never receive
 * an original file larger than this, no matter what was uploaded. */
export const MAX_IMAGE_DIMENSION = 2000;

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
export function tenantMediaPath(
  tenantId: string,
  moduleKey: string,
  itemId: string,
  ext: string,
  uploadId?: string
): string {
  const folder = uploadId ? `${tenantId}/${moduleKey}/${itemId}/${uploadId}` : `${tenantId}/${moduleKey}/${itemId}`;
  return `${folder}/draft.${ext}`;
}

/** A fresh, unguessable-by-construction folder segment for one upload. */
export function newUploadId(): string {
  return globalThis.crypto.randomUUID();
}

const SEGMENT_RE = /^[A-Za-z0-9_-]+$/;
const EXT_RE = /^[a-z0-9]{1,8}$/;

export type VersionedMediaKind = "draft" | "published";

export type VersionedMediaParts = {
  tenantId: string;
  moduleKey: string;
  itemId: string;
  uploadId: string;
  ext: string;
};

/**
 * The one builder for a versioned object path
 * (`{tenant}/{module}/{item}/{uploadId}/{draft|published}.<ext>`). It
 * generalizes tenantMediaPath for any media kind (audio today) and
 * validates every segment, so a crafted id can never smuggle a `/`, `..`
 * or an unexpected extension into a Storage key. Throws on bad input -
 * callers build paths from server-trusted values, so a throw is a bug.
 */
export function versionedMediaPath(kind: VersionedMediaKind, parts: VersionedMediaParts): string {
  const { tenantId, moduleKey, itemId, uploadId, ext } = parts;
  if (!tenantId || !isTenantId(tenantId)) throw new Error("Invalid tenant id for media path.");
  if (!SEGMENT_RE.test(moduleKey)) throw new Error("Invalid module key for media path.");
  if (!SEGMENT_RE.test(itemId)) throw new Error("Invalid item id for media path.");
  if (!SEGMENT_RE.test(uploadId)) throw new Error("Invalid upload id for media path.");
  if (!EXT_RE.test(ext)) throw new Error("Invalid file extension for media path.");
  return `${tenantId}/${moduleKey}/${itemId}/${uploadId}/${kind}.${ext}`;
}

/**
 * Strict inverse of versionedMediaPath: the parts of a versioned draft or
 * published path, or null for anything else (legacy unversioned shape,
 * foreign tenant segment, traversal, wrong extension...).
 */
export function parseVersionedMediaPath(
  path: string
): (VersionedMediaParts & { kind: VersionedMediaKind }) | null {
  const segments = path.split("/");
  if (segments.length !== 5) return null;
  const [tenantId, moduleKey, itemId, uploadId, file] = segments;
  const match = file.match(/^(draft|published)\.([a-z0-9]{1,8})$/);
  if (!match) return null;
  if (!isTenantId(tenantId)) return null;
  if (!SEGMENT_RE.test(moduleKey) || !SEGMENT_RE.test(itemId) || !SEGMENT_RE.test(uploadId)) return null;
  return { tenantId, moduleKey, itemId, uploadId, ext: match[2], kind: match[1] as VersionedMediaKind };
}

/**
 * True only for a draft object that belongs to `tenantId`. Server actions
 * that delete Storage objects take the path from the client, so this is
 * the guard that keeps a crafted request from deleting a published object
 * (which the live snapshot may still reference) or another tenant's file.
 */
export function isDraftMediaPathForTenant(tenantId: string, path: string): boolean {
  if (!tenantId || !path.startsWith(`${tenantId}/`)) return false;
  const segments = path.split("/");
  if (segments.some((seg) => seg.length === 0 || seg === "." || seg === "..")) return false;
  return /\/draft\.[a-zA-Z0-9]+$/.test(path);
}

/** True for a published-copy object (`.../published.<ext>`). */
export function isPublishedMediaPath(path: string): boolean {
  return /\/published\.[a-zA-Z0-9]+$/.test(path);
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
 * How long the signed Storage URL minted by /api/media stays valid. A
 * browser follows the redirect immediately, so this only has to cover that
 * hop - it is deliberately short because an already-issued signed URL
 * cannot be revoked: this is the residual window during which a URL issued
 * just before a Space lost guest access still works.
 */
export const MEDIA_SIGNED_URL_TTL_SECONDS = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True only for a well-formed tenant uuid - the sole shape a Storage
 * tenant folder name can ever have. */
export function isTenantId(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Shape check for a requested /api/media path (already split into
 * segments): first segment is a tenant uuid, and no segment is empty,
 * "."/"..", or carries a slash, backslash or control character. Cheap
 * defense in depth - the real gate is exact membership in the tenant's
 * published snapshot.
 */
export function isWellFormedMediaPath(segments: string[]): boolean {
  if (segments.length < 2 || !UUID_RE.test(segments[0])) return false;
  return segments.every(
    (seg) => seg.length > 0 && seg !== "." && seg !== ".." && !/[\\/\u0000-\u001f\u007f]/.test(seg)
  );
}

function collectRefsByKey(modules: unknown, keys: ReadonlySet<string>): Set<string> {
  const refs = new Set<string>();
  function walk(node: unknown) {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (keys.has(key) && typeof value === "string") {
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

const IMAGE_REF_KEYS: ReadonlySet<string> = new Set(["imageRef"]);
const MEDIA_REF_KEYS: ReadonlySet<string> = new Set(["imageRef", "audioRef"]);

/**
 * Walks a published_spaces.modules payload and collects every string value
 * found under a key literally named "imageRef", anywhere in the structure.
 * This is what makes the guest media route generic across future modules -
 * a new module's published items just need an `imageRef` field and they're
 * automatically covered, no route changes required. Image-only on purpose:
 * its callers (the guest media route, the stale-media sweep) gate image
 * objects; use collectMediaRefs for every media kind.
 */
export function collectImageRefs(modules: unknown): Set<string> {
  return collectRefsByKey(modules, IMAGE_REF_KEYS);
}

/** Every media ref in a published payload: `imageRef` and `audioRef`. */
export function collectMediaRefs(modules: unknown): Set<string> {
  return collectRefsByKey(modules, MEDIA_REF_KEYS);
}
