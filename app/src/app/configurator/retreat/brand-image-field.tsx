"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { uploadBrandImage, removeBrandImage, type BrandImageKind, type UploadBrandImageState, type RemoveBrandImageState } from "./actions";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import { validateImageFile, classifyServerImageError } from "@/lib/media/clientValidation";
import { ImageUploadErrorDialog } from "@/components/image-upload-error-dialog";

import { createTranslator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
const uploadInitialState: UploadBrandImageState = { error: null, imageRef: null, imageUrl: null };
const removeInitialState: RemoveBrandImageState = { error: null };

/**
 * Recommended upload ratio per kind, derived from where each one actually
 * renders today - not guessed. Hero's box is TodayScreen's real
 * `h-[280px]` full-width hero (today-screen.tsx) at the guest device's
 * ~390px width, i.e. ~7:5. Logo shows subtly in that same hero's identity
 * area, next to the tenant name (Manual QA Fixes phase). Space Image
 * represents the Space itself, shown on its My Spaces card - not the
 * Today hero, and not (yet) reused by other InnerDweS surfaces.
 */
/** Translation keys, resolved per render in the Space language. */
const RATIO_HINT_KEY: Record<BrandImageKind, "heroImageHint" | "spaceImageHint" | "logoImageHint"> = {
  hero: "heroImageHint",
  space: "spaceImageHint",
  logo: "logoImageHint",
};

/** Preview box classes per kind - hero matches its real guest-app crop
 * (aspect + object-cover); logo uses object-contain (a logo should never
 * be cover-cropped) inside a neutral square; space keeps a plain box since
 * there is no real destination shape to match yet (see RATIO_HINT). */
const PREVIEW_BOX_CLASS: Record<BrandImageKind, string> = {
  hero: "aspect-[39/28] w-full",
  space: "h-40 w-full",
  logo: "aspect-square w-full max-w-[160px]",
};
const PREVIEW_IMG_CLASS: Record<BrandImageKind, string> = {
  hero: "w-full h-full object-cover",
  space: "w-full h-full object-cover",
  logo: "w-full h-full object-contain p-4",
};

export type BrandImageFieldProps = {
  tenantId: string;
  kind: BrandImageKind;
  label: string;
  hint: string;
  imageRef: string | null;
  imageUrl: string | null;
  onChange: (patch: { imageRef: string | null; imageUrl: string | null }) => void;
  /** The Space's system language. */
  locale?: Locale;
};

/**
 * Wide-preview upload control for Today Hero / Space Image / Logo -
 * visually distinct from ModuleItemPhotoField's small round avatar
 * (appropriate for a full-bleed hero photo instead of a facilitator
 * portrait), but calling the exact same upload/remove/optimize pipeline
 * via uploadBrandImage/removeBrandImage. Requires migration 0014 to
 * actually persist against Production - see those actions' own comments.
 */
export function BrandImageField({ tenantId, kind, label, hint, imageRef, imageUrl, onChange, locale = DEFAULT_LOCALE }: BrandImageFieldProps) {
  const { t } = createTranslator(locale);
  const [uploadPending, setUploadPending] = useState(false);
  const [removeState, setRemoveState] = useState<RemoveBrandImageState>(removeInitialState);
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

    formData.set("locale", locale);
    formData.set("tenantId", tenantId);
    formData.set("kind", kind);
    formData.set("previousRef", imageRef ?? "");
    formData.set("file", file);

    setUploadPending(true);
    const result = await uploadBrandImage(uploadInitialState, formData);
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
    formData.set("locale", locale);
    formData.set("tenantId", tenantId);
    formData.set("kind", kind);
    formData.set("imageRef", imageRef);

    setRemovePending(true);
    const result = await removeBrandImage(removeInitialState, formData);
    setRemovePending(false);
    setRemoveState(result);
    if (!result.error) onChange({ imageRef: null, imageUrl: null });
  }

  return (
    <div>
      <p className="text-[11px] mb-2" style={{ color: GUEST_BASE_PALETTE.mist }}>
        {t("studio", RATIO_HINT_KEY[kind])}
      </p>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" aria-label={t("studio", "chooseImageFile")} className="hidden" onChange={handleFileChange} />
      {imageUrl ? (
        <div
          className={`relative rounded-2xl overflow-hidden ${PREVIEW_BOX_CLASS[kind]}`}
          style={{ background: GUEST_BASE_PALETTE.parchmentDeep }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={label} className={PREVIEW_IMG_CLASS[kind]} />
          <div className="absolute bottom-3 right-3 flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadPending}
              className="text-[11px] font-medium px-3 py-1.5 rounded-full bg-white/90 disabled:opacity-50"
              style={{ color: GUEST_BASE_PALETTE.forest }}
            >
              {uploadPending ? t("common", "uploading") : t("common", "replace")}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={removePending}
              className="text-[11px] font-medium px-3 py-1.5 rounded-full bg-white/90 disabled:opacity-50"
              style={{ color: GUEST_BASE_PALETTE.dusk }}
            >
              {removePending ? t("common", "removing") : t("common", "remove")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadPending}
          className={`${PREVIEW_BOX_CLASS[kind]} rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all disabled:opacity-60`}
          style={{ borderColor: `${GUEST_BASE_PALETTE.sand}99`, color: GUEST_BASE_PALETTE.mist }}
        >
          <span className="text-[13px] font-medium">{uploadPending ? t("common", "uploading") : label}</span>
          <span className="text-[11px]">{hint}</span>
        </button>
      )}
      {removeState.error && <p className="text-xs text-red-700 mt-1.5">{removeState.error}</p>}
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
