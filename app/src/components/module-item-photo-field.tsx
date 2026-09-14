"use client";

import { useRef, useState, type ChangeEvent } from "react";
import {
  uploadModuleItemPhoto,
  removeModuleItemPhoto,
  type UploadModuleItemPhotoState,
  type RemoveModuleItemPhotoState,
} from "@/app/configurator/retreat/actions";
import { enqueueItemOp } from "@/lib/modules/persistItem";
import { validateImageFile, classifyServerImageError } from "@/lib/media/clientValidation";
import { ImageUploadErrorDialog } from "@/components/image-upload-error-dialog";

const uploadInitialState: UploadModuleItemPhotoState = { error: null, imageRef: null, imageUrl: null };
const removeInitialState: RemoveModuleItemPhotoState = { error: null };

export type ModuleItemPhotoFieldProps = {
  tenantId: string;
  moduleKey: string;
  itemId: string;
  /** Current text fields, sent along with the upload so a brand-new,
   * never-saved item still gets a real, complete database row the moment
   * a photo is attached - see uploadModuleItemPhoto. */
  title: string;
  subtitle?: string | null;
  description?: string | null;
  sortOrder: number;
  imageRef: string | null;
  imageUrl: string | null | undefined;
  onChange: (patch: { imageRef: string | null; imageUrl: string | null }) => void;
  /** Tailwind `aspect-[]` value (e.g. "13/10") matching this item's ACTUAL
   * guest-app render box, so the preview thumbnail is cropped the same way
   * guests will actually see it - not a generic circle unrelated to any
   * real destination shape. Defaults to the pre-existing 1:1 circle for
   * any caller that hasn't been updated yet. */
  previewAspect?: string;
  /** CSS object-position for the preview (e.g. "center top") - matches a
   * non-default anchor already used in the real render (facilitators use
   * object-top today). Defaults to "center". */
  previewPosition?: string;
  /** Short, honest recommendation shown near the control - the real
   * render box this photo ends up in, so organizers upload something that
   * won't need much cropping. */
  ratioHint?: string;
};

/**
 * One organizer-facing photo control per module_items row: upload, replace
 * (re-upload at the same path), and remove. Shared by every module_items-
 * backed module (Facilitators, Meals, Treatments, Facilities) - only the
 * moduleKey and the item's own fields vary per caller.
 *
 * Upload and photo-remove are both called directly (not via useActionState)
 * and queued through the same per-item queue Save/create/item-remove use
 * (see persistItem.ts) - so an item Remove clicked right after an upload
 * correctly waits for the upload to actually finish first, deterministically,
 * regardless of real network timing.
 */
export function ModuleItemPhotoField({
  tenantId,
  moduleKey,
  itemId,
  title,
  subtitle,
  description,
  sortOrder,
  imageRef,
  imageUrl,
  onChange,
  previewAspect = "1/1",
  previewPosition = "center",
  ratioHint,
}: ModuleItemPhotoFieldProps) {
  const [uploadPending, setUploadPending] = useState(false);
  const [removeState, setRemoveState] = useState<RemoveModuleItemPhotoState>(removeInitialState);
  const [removePending, setRemovePending] = useState(false);
  const [dialogError, setDialogError] = useState<{ title: string; body: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    // Validated BEFORE any pending state, FormData, or network request -
    // an oversized or wrong-type file must never show a spinner or touch
    // the network at all, only ever the dialog below.
    const validation = validateImageFile(file);
    if (!validation.ok) {
      setDialogError(validation);
      return;
    }

    const formData = new FormData();
    formData.set("tenantId", tenantId);
    formData.set("moduleKey", moduleKey);
    formData.set("itemId", itemId);
    formData.set("previousRef", imageRef ?? "");
    formData.set("title", title);
    formData.set("subtitle", subtitle ?? "");
    formData.set("description", description ?? "");
    formData.set("sortOrder", String(sortOrder));
    formData.set("file", file);

    setUploadPending(true);
    const result = await enqueueItemOp(itemId, () => uploadModuleItemPhoto(uploadInitialState, formData));
    setUploadPending(false);
    if (result.imageRef && result.imageUrl) {
      onChange({ imageRef: result.imageRef, imageUrl: result.imageUrl });
    } else if (result.error) {
      setDialogError(classifyServerImageError(result.error));
    }
  }

  async function handleRemove() {
    if (!imageRef) return;
    const formData = new FormData();
    formData.set("tenantId", tenantId);
    formData.set("itemId", itemId);
    formData.set("imageRef", imageRef);

    setRemovePending(true);
    const result = await enqueueItemOp(itemId, () => removeModuleItemPhoto(removeInitialState, formData));
    setRemovePending(false);
    setRemoveState(result);
    if (!result.error) onChange({ imageRef: null, imageUrl: null });
  }

  return (
    <div className="mt-3">
      <div className="flex items-center gap-3">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="w-16 rounded-lg object-cover shrink-0"
            style={{ aspectRatio: previewAspect.replace("/", " / "), objectPosition: previewPosition }}
          />
        ) : (
          <div
            className="w-16 rounded-lg bg-idw-forest/10 shrink-0"
            style={{ aspectRatio: previewAspect.replace("/", " / ") }}
            aria-hidden="true"
          />
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadPending}
          className="text-xs font-semibold text-idw-forest underline disabled:opacity-50"
        >
          {uploadPending ? "Uploading…" : imageUrl ? "Replace photo" : "Upload photo"}
        </button>

        {imageRef && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={removePending}
            className="text-xs text-idw-forest/40 hover:text-idw-forest disabled:opacity-50"
          >
            {removePending ? "Removing…" : "Remove"}
          </button>
        )}
      </div>

      <p className="text-[11px] text-idw-forest/40 mt-1.5">
        Images up to 8MB. We automatically optimize them for fast loading.
        {ratioHint ? ` ${ratioHint}` : ""}
      </p>

      {removeState.error && <p className="text-xs text-red-700 mt-1">{removeState.error}</p>}
      <ImageUploadErrorDialog
        open={dialogError !== null}
        title={dialogError?.title ?? ""}
        body={dialogError?.body ?? ""}
        onPrimary={() => {
          setDialogError(null);
          fileInputRef.current?.click();
        }}
        onCancel={() => setDialogError(null)}
      />
    </div>
  );
}
