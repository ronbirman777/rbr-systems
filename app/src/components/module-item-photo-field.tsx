"use client";

import { startTransition, useActionState, useEffect, useRef, type ChangeEvent } from "react";
import {
  uploadModuleItemPhoto,
  removeModuleItemPhoto,
  type UploadModuleItemPhotoState,
  type RemoveModuleItemPhotoState,
} from "@/app/configurator/retreat/actions";
import { registerPendingWrite } from "@/lib/modules/persistItem";

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
};

/**
 * One organizer-facing photo control per module_items row: upload, replace
 * (re-upload at the same path), and remove. Shared by every module_items-
 * backed module (Facilitators, Meals, Treatments, Facilities) - only the
 * moduleKey and the item's own fields vary per caller. Each row gets its
 * own instance (and so its own useActionState pair) since these lists are
 * dynamic-length - hooks stay fixed per component instance, only the
 * number of instances varies.
 *
 * Both actions are invoked directly with a FormData, not via nested
 * <form> elements with requestSubmit()/native submission - this component
 * is always rendered inside its module's own outer <form>, and HTML
 * forbids a <form> nesting inside another <form>. Calling the action
 * function returned by useActionState directly with a payload - the
 * officially supported alternative to a form submission - sidesteps that
 * entirely (found and fixed as a real bug during the Facilitators slice).
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
}: ModuleItemPhotoFieldProps) {
  const [uploadState, uploadAction, uploadPending] = useActionState(uploadModuleItemPhoto, uploadInitialState);
  const [removeState, removeAction, removePending] = useActionState(removeModuleItemPhoto, removeInitialState);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const removeSubmittedRef = useRef(false);
  const uploadSettleRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (uploadState.imageRef && uploadState.imageUrl) {
      onChange({ imageRef: uploadState.imageRef, imageUrl: uploadState.imageUrl });
    }
    // Settle the tracked pending-write promise either way (success or
    // error) - a Remove waiting on it must never hang over an upload that
    // failed.
    uploadSettleRef.current?.();
    uploadSettleRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadState.imageRef, uploadState.imageUrl, uploadState.error]);

  useEffect(() => {
    if (!removePending && removeSubmittedRef.current) {
      removeSubmittedRef.current = false;
      if (!removeState.error) onChange({ imageRef: null, imageUrl: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removePending]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

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

    // Register a promise a same-item Remove can wait on, so it can never
    // race ahead of this upload's own row-write (see persistItem.ts) -
    // resolved by the effect above once the server has actually responded.
    const pending = new Promise<void>((resolve) => {
      uploadSettleRef.current = resolve;
    });
    registerPendingWrite(itemId, pending);

    startTransition(() => uploadAction(formData));
  }

  function handleRemove() {
    if (!imageRef) return;
    const formData = new FormData();
    formData.set("tenantId", tenantId);
    formData.set("itemId", itemId);
    formData.set("imageRef", imageRef);
    removeSubmittedRef.current = true;
    startTransition(() => removeAction(formData));
  }

  return (
    <div className="flex items-center gap-3 mt-3">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-11 h-11 rounded-full bg-idw-forest/10 shrink-0" aria-hidden="true" />
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

      {(uploadState.error || removeState.error) && (
        <p className="text-xs text-red-700">{uploadState.error || removeState.error}</p>
      )}
    </div>
  );
}
