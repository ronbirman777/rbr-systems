"use client";

import { useRef, useState, type ChangeEvent } from "react";
import {
  uploadModuleCoverPhoto,
  removeModuleCoverPhoto,
  type UploadModuleCoverPhotoState,
  type RemoveModuleCoverPhotoState,
} from "@/app/(site)/configurator/retreat/actions";
import { enqueueItemOp } from "@/lib/modules/persistItem";
import { validateImageFile, classifyServerImageError } from "@/lib/media/clientValidation";
import { ImageUploadErrorDialog } from "@/components/image-upload-error-dialog";
import { createTranslator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

const uploadInitialState: UploadModuleCoverPhotoState = { error: null, imageRef: null, imageUrl: null };
const removeInitialState: RemoveModuleCoverPhotoState = { error: null };

export type ModuleCoverPhotoFieldProps = {
  tenantId: string;
  moduleKey: string;
  imageRef: string | null;
  imageUrl: string | null;
  onChange: (patch: { imageRef: string | null; imageUrl: string | null }) => void;
  /** The Space's system language, for this control's own labels. */
  locale?: Locale;
};

/**
 * Explore module hero/cover image control (added alongside Task 015) -
 * one organizer-facing photo control per Explore MODULE (Meals,
 * Treatments, Facilities, Arrival, FAQ, Stay Connected), shown inline in
 * the Modules step next to that module's enable toggle. Deliberately its
 * own component rather than reusing ModuleItemPhotoField: that component
 * is hard-wired to an `itemId` (module_items upsert-by-id); this one has
 * no item, only a module_configs row keyed by (tenantId, moduleKey) -
 * see uploadModuleCoverPhoto/removeModuleCoverPhoto (actions.ts) for the
 * persistence side. Same visual/interaction language as
 * ModuleItemPhotoField (upload/replace/remove, same error dialog, same
 * queued-op ordering guarantee) so this reads as the same feature, not a
 * second design.
 */
export function ModuleCoverPhotoField({ tenantId, moduleKey, imageRef, imageUrl, onChange, locale = DEFAULT_LOCALE }: ModuleCoverPhotoFieldProps) {
  const { t } = createTranslator(locale);
  const [uploadPending, setUploadPending] = useState(false);
  const [removeState, setRemoveState] = useState<RemoveModuleCoverPhotoState>(removeInitialState);
  const [removePending, setRemovePending] = useState(false);
  const [dialogError, setDialogError] = useState<{ title: string; body: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const queueKey = `module-cover:${moduleKey}`;

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.ok) {
      setDialogError(validation);
      return;
    }

    const formData = new FormData();
    formData.set("tenantId", tenantId);
    formData.set("moduleKey", moduleKey);
    formData.set("previousRef", imageRef ?? "");
    formData.set("file", file);

    setUploadPending(true);
    const result = await enqueueItemOp(queueKey, () => uploadModuleCoverPhoto(uploadInitialState, formData));
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
    formData.set("moduleKey", moduleKey);
    formData.set("imageRef", imageRef);

    setRemovePending(true);
    const result = await enqueueItemOp(queueKey, () => removeModuleCoverPhoto(removeInitialState, formData));
    setRemovePending(false);
    setRemoveState(result);
    if (!result.error) onChange({ imageRef: null, imageUrl: null });
  }

  return (
    <div className="mt-2 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="w-12 h-9 rounded-md object-cover shrink-0" />
      ) : (
        <div className="w-12 h-9 rounded-md bg-idw-forest/10 shrink-0" aria-hidden="true" />
      )}

      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" aria-label={t("studio", "chooseImageFile")} className="hidden" onChange={handleFileChange} />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadPending}
        className="text-[11px] font-semibold text-idw-forest underline disabled:opacity-50 relative after:content-[''] after:absolute after:-inset-x-2 after:top-1/2 after:-translate-y-1/2 after:h-11"
      >
        {uploadPending ? t("common", "uploading") : imageUrl ? t("studio", "replaceCoverImage") : t("studio", "addCoverImage")}
      </button>

      {imageRef && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={removePending}
          className="text-[11px] text-idw-forest/40 hover:text-idw-forest disabled:opacity-50 relative after:content-[''] after:absolute after:-inset-x-2 after:top-1/2 after:-translate-y-1/2 after:h-11"
        >
          {removePending ? "Removing…" : "Remove"}
        </button>
      )}

      {removeState.error && <p className="text-[11px] text-red-700 ml-2">{removeState.error}</p>}
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
