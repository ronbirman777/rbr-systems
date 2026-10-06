"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createClient } from "@/lib/supabase/client";
import { ModuleItemPhotoField } from "@/components/module-item-photo-field";
import { FocalPointPicker } from "@/components/focal-point-picker";
import { objectPositionStyle } from "@/lib/modules/imagePosition";
import { persistNewItemStub, persistItemRemoval, enqueueItemsOp } from "@/lib/modules/persistItem";
import { blankFlowTrack, FLOW_AUDIO_KEY, type EditableFlowTrack } from "@/lib/modules/flowLibrary";
import { formatDuration } from "@/lib/modules/duration";
import { AUDIO_ALLOWED_TYPES, audioFileProblem } from "@/lib/media/audio";
import { MEDIA_BUCKET } from "@/lib/media/path";
import { detectAudioDuration, uploadAudioDraftObject } from "@/lib/media/audioUpload";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import { STUDIO_INPUT_CLASS, StudioLabel, StudioHeading, StudioIntro, ForwardArrow } from "./studio-ui";
import { EmptyState } from "@/components/studio/empty-state";
import {
  attachFlowAudio,
  detachFlowAudio,
  prepareFlowAudioUpload,
  saveFlowAudio,
  type SaveFlowAudioState,
} from "./actions";
import { useRegisteredSave, type StudioSectionEditorProps } from "./studioSection";
import { createTranslator, type Locale } from "@/lib/i18n";

const initialState: SaveFlowAudioState = { error: null };

export type AudioStepProps = {
  tenantId: string;
  tracks: EditableFlowTrack[];
  setTracks: Dispatch<SetStateAction<EditableFlowTrack[]>>;
  onBack: () => void;
  onContinue: () => void;
} & StudioSectionEditorProps;

/**
 * Flow Audio (TASK 029, P4A).
 *
 * The upload is the same three-step contract Teach established and the
 * same shared helpers do the work: validate (audioFileProblem), probe the
 * duration in the browser (detectAudioDuration), ask the server for a
 * brand-new versioned path (prepareFlowAudioUpload), upload straight to
 * Storage through the member's own session (uploadAudioDraftObject), then
 * have the server verify what actually landed and point the row at it
 * (attachFlowAudio). There is no Flow-specific media route and no second
 * upload path - /api/media serves these bytes exactly as it serves every
 * other published object.
 *
 * No quota or entitlement check here, deliberately: that is not built
 * yet for either product, and inventing half of it would be worse than
 * leaving the shape ready for it.
 */
export function AudioStep({
  tenantId,
  tracks,
  setTracks,
  onBack,
  onContinue,
  onDirty,
  onSaved,
  registerSave,
  locale,
}: AudioStepProps) {
  const { t } = createTranslator(locale);
  const [state, setState] = useState<SaveFlowAudioState>(initialState);
  const [pending, setPending] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  function update(id: string, patch: Partial<EditableFlowTrack>) {
    onDirty();
    setTracks((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function updateMeta(id: string, patch: Partial<EditableFlowTrack["metadata"]>) {
    onDirty();
    setTracks((items) => items.map((it) => (it.id === id ? { ...it, metadata: { ...it.metadata, ...patch } } : it)));
  }

  /** The file fields are owned by the server actions, so this one does
   * NOT mark the section dirty: the change is already persisted. */
  function setFile(id: string, audioRef: string | null, durationSeconds: number | null, audioUrl: string | null) {
    setTracks((items) =>
      items.map((it) =>
        it.id === id ? { ...it, audioUrl, metadata: { ...it.metadata, audioRef, durationSeconds } } : it
      )
    );
  }

  function handleAdd() {
    const item = blankFlowTrack();
    setTracks((items) => [...items, item]);
    persistNewItemStub(tenantId, FLOW_AUDIO_KEY, item.id, tracks.length);
    setEditId(item.id);
  }

  function handleRemove(id: string) {
    setTracks((items) => items.filter((it) => it.id !== id));
    persistItemRemoval(tenantId, id);
    if (editId === id) setEditId(null);
  }

  async function handleSave(): Promise<boolean> {
    const formData = new FormData();
    formData.set("locale", locale);
    formData.set("tenantId", tenantId);
    formData.set(
      "items",
      JSON.stringify(
        tracks.map(({ id, title, subtitle, description, externalLink, metadata }) => ({
          id,
          title,
          subtitle,
          description,
          externalLink,
          metadata,
        }))
      )
    );
    const ids = tracks.map((a) => a.id);
    setPending(true);
    const result = await enqueueItemsOp(ids, () => saveFlowAudio(initialState, formData));
    setPending(false);
    setState(result);
    // A failed save must NOT clear the guard.
    if (result.error) return false;
    onSaved();
    return true;
  }

  useRegisteredSave(registerSave, handleSave);

  const editing = editId ? (tracks.find((a) => a.id === editId) ?? null) : null;
  const editIdx = editing ? tracks.indexOf(editing) : -1;

  return (
    <div className="max-w-2xl">
      <StudioHeading>{t("flow", "audioStepTitle")}</StudioHeading>
      <StudioIntro>{t("flow", "audioStepBody")}</StudioIntro>

      <div className="space-y-3 mb-4">
        {tracks.map((a) => {
          const isEditing = editId === a.id;
          return (
            <div
              key={a.id}
              className="group flex items-center gap-4 rounded-2xl border overflow-hidden bg-white transition-all"
              style={{
                borderColor: isEditing ? `${GUEST_BASE_PALETTE.forest}4d` : `${GUEST_BASE_PALETTE.sand}80`,
                boxShadow: isEditing ? "0 1px 3px rgba(45,74,62,0.08)" : "none",
              }}
            >
              <div className="w-20 h-20 flex-shrink-0" style={{ background: GUEST_BASE_PALETTE.parchmentDeep }}>
                {a.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.imageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    style={{ objectPosition: objectPositionStyle(a.metadata.imagePosition) }}
                  />
                ) : null}
              </div>
              <div className="flex-1 py-3 min-w-0 pr-3">
                {a.metadata.category && (
                  <span className="text-[11px] font-medium" style={{ color: GUEST_BASE_PALETTE.clay }} dir="auto">
                    {a.metadata.category}
                  </span>
                )}
                <p className="text-[13px] font-medium truncate" style={{ color: GUEST_BASE_PALETTE.forest }} dir="auto">
                  {a.title || t("flow", "untitledTrack")}
                </p>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: GUEST_BASE_PALETTE.mist }}>
                  {[formatDuration(a.metadata.durationSeconds), a.metadata.audioRef ? null : t("flow", "noFileYet")]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 pr-4 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setEditId(isEditing ? null : a.id)}
                  className="text-[11px] px-2.5 py-1 rounded-lg border transition-colors"
                  style={{ color: GUEST_BASE_PALETTE.forest, borderColor: "rgba(45,74,62,0.2)" }}
                >
                  {t("common", "edit")}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(a.id)}
                  className="text-[11px] px-2.5 py-1 rounded-lg border transition-colors"
                  style={{ color: GUEST_BASE_PALETTE.mist, borderColor: `${GUEST_BASE_PALETTE.sand}80` }}
                >
                  {t("common", "remove")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {tracks.length === 0 && (
        <div className="mb-4">
          <EmptyState title={t("flow", "noTracksYet")} body={t("flow", "noTracksBody")} />
        </div>
      )}

      <button
        type="button"
        onClick={handleAdd}
        className="w-full border-2 border-dashed rounded-2xl py-3 text-[12px] font-medium transition-all mb-4"
        style={{ borderColor: `${GUEST_BASE_PALETTE.sand}99`, color: GUEST_BASE_PALETTE.mist }}
      >
        + {t("flow", "addTrack")}
      </button>

      {editing && (
        <div
          className="rounded-2xl border p-5"
          style={{ background: GUEST_BASE_PALETTE.parchmentDeep, borderColor: "rgba(45,74,62,0.15)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[14px] font-semibold" style={{ color: GUEST_BASE_PALETTE.forest }} dir="auto">
              {editing.title || t("flow", "untitledTrack")}
            </h4>
            <button type="button" onClick={() => setEditId(null)} className="text-[11px]" style={{ color: GUEST_BASE_PALETTE.mist }}>
              {t("common", "done")}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <ModuleItemPhotoField
                tenantId={tenantId}
                moduleKey={FLOW_AUDIO_KEY}
                itemId={editing.id}
                title={editing.title}
                subtitle={editing.subtitle}
                description={editing.description}
                sortOrder={editIdx}
                imageRef={editing.imageRef}
                imageUrl={editing.imageUrl}
                onChange={(patch) => {
                  update(editing.id, patch);
                  updateMeta(editing.id, { imagePosition: null });
                }}
                previewAspect="1/1"
                previewPosition={objectPositionStyle(editing.metadata.imagePosition)}
                ratioHint={t("studio", "photoSquare")}
              />
              {editing.imageUrl && (
                <FocalPointPicker
                  locale={locale}
                  imageUrl={editing.imageUrl}
                  position={editing.metadata.imagePosition}
                  onChange={(imagePosition) => updateMeta(editing.id, { imagePosition })}
                  aspect="1/1"
                  label={editing.title || t("flow", "untitledTrack")}
                />
              )}
            </div>
            <div className="sm:col-span-2 space-y-3">
              <div>
                <StudioLabel>{t("common", "title")}</StudioLabel>
                <input
                  aria-label={t("common", "title")}
                  value={editing.title}
                  onChange={(e) => update(editing.id, { title: e.target.value })}
                  placeholder={t("flow", "trackTitlePlaceholder")}
                  maxLength={160}
                  className={STUDIO_INPUT_CLASS}
                  dir="auto"
                />
              </div>
              <div>
                <StudioLabel>{t("flow", "category")}</StudioLabel>
                <input
                  aria-label={t("flow", "category")}
                  value={editing.metadata.category ?? ""}
                  onChange={(e) => updateMeta(editing.id, { category: e.target.value || null })}
                  placeholder={t("flow", "categoryPlaceholder")}
                  maxLength={60}
                  className={STUDIO_INPUT_CLASS}
                  dir="auto"
                />
              </div>

              <AudioFileField
                tenantId={tenantId}
                item={editing}
                index={editIdx}
                locale={locale}
                onFile={(ref, duration, url) => setFile(editing.id, ref, duration, url)}
              />

              <div>
                <StudioLabel>{t("flow", "noteOptional")}</StudioLabel>
                <textarea
                  aria-label={t("flow", "noteOptional")}
                  value={editing.metadata.note ?? ""}
                  onChange={(e) => updateMeta(editing.id, { note: e.target.value || null })}
                  placeholder={t("flow", "notePlaceholder")}
                  rows={2}
                  maxLength={800}
                  className={`${STUDIO_INPUT_CLASS} resize-none`}
                  dir="auto"
                />
              </div>
              <div>
                <StudioLabel>{t("common", "description")}</StudioLabel>
                <textarea
                  aria-label={t("common", "description")}
                  value={editing.description ?? ""}
                  onChange={(e) => update(editing.id, { description: e.target.value || null })}
                  placeholder={t("flow", "mealDescriptionPlaceholder")}
                  rows={3}
                  maxLength={2000}
                  className={`${STUDIO_INPUT_CLASS} resize-none`}
                  dir="auto"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {state.error && (
        <p className="text-sm text-red-700 mt-4" role="alert">
          {state.error}
        </p>
      )}

      <div className="mt-8 flex flex-wrap gap-3 items-center">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-idw-forest/20 text-idw-forest text-sm font-semibold uppercase tracking-wide px-6 py-3"
        >
          {t("common", "back")}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-6 py-3 disabled:opacity-60"
        >
          {pending ? t("common", "savingNow") : t("studio", "saveSection", { section: t("flow", "audioStepTitle") })}
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="text-xs font-semibold uppercase tracking-wide text-idw-forest/50 hover:text-idw-forest"
        >
          {t("common", "next")} <ForwardArrow />
        </button>
      </div>
    </div>
  );
}

/**
 * Upload / replace / remove one track's audio file.
 *
 * Every step is the shared one, so Flow and Teach cannot drift on what a
 * valid upload is: audioFileProblem() for the rule, detectAudioDuration()
 * for the length, uploadAudioDraftObject() for the create-only upload.
 * The server actions own the row's audioRef - this component never
 * writes it from the client, which is what makes an upload that finishes
 * mid-save impossible to lose.
 */
function AudioFileField({
  tenantId,
  item,
  index,
  locale,
  onFile,
}: {
  tenantId: string;
  item: EditableFlowTrack;
  index: number;
  locale: Locale;
  onFile: (ref: string | null, durationSeconds: number | null, url: string | null) => void;
}) {
  const { t } = createTranslator(locale);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = item.metadata.audioRef;

  async function handle(file: File) {
    setError(null);
    // Shared rule, product-specific wording.
    const problem = audioFileProblem(file);
    if (problem === "unsupportedType") return setError(t("flow", "audioUnsupported"));
    if (problem === "tooLarge") return setError(t("flow", "audioTooLarge"));

    setBusy(t("common", "uploading"));
    const duration = await detectAudioDuration(file);
    // Ownership at upload: the server makes sure this item's row exists
    // before any bytes land, and hands back a brand-new versioned path.
    const prep = await prepareFlowAudioUpload(tenantId, item, index, file.type, file.size, locale);
    if (prep.error || !prep.path) {
      setBusy(null);
      return setError(prep.error ?? t("studio", "uploadFailed"));
    }
    const path = prep.path;
    // Uploaded straight from the browser through the member's own
    // session: the tenant-media bucket's RLS only admits paths under this
    // tenant's id, and attachFlowAudio re-validates the ref and the
    // stored object server-side.
    const supabase = createClient();
    const { error: upErr } = await uploadAudioDraftObject(supabase, path, file);
    if (upErr) {
      setBusy(null);
      return setError(upErr);
    }
    const attachErr = await attachFlowAudio(tenantId, item.id, path, duration, locale);
    if (attachErr.error) {
      setBusy(null);
      return setError(attachErr.error);
    }
    const { data: signed } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
    onFile(path, duration, signed?.signedUrl ?? null);
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-2 p-4 rounded-xl border bg-white" style={{ borderColor: `${GUEST_BASE_PALETTE.sand}80` }}>
      <StudioLabel>{t("flow", "audioFile")}</StudioLabel>
      {ref ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px]" style={{ color: GUEST_BASE_PALETTE.forest }}>
            {ref.split("/").pop()} · {formatDuration(item.metadata.durationSeconds) ?? t("flow", "durationUnknown")}
          </p>
          {/* preload="none": the Studio must not pull the file just
              because the editor is open. */}
          {item.audioUrl ? <audio controls preload="none" src={item.audioUrl} className="w-full" /> : null}
        </div>
      ) : (
        <p className="text-[12.5px]" style={{ color: GUEST_BASE_PALETTE.mist }}>
          {t("flow", "noAudioUploadedYet")}
        </p>
      )}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== null}
          className="text-[11px] px-3 py-1.5 rounded-lg border disabled:opacity-60"
          style={{ color: GUEST_BASE_PALETTE.forest, borderColor: "rgba(45,74,62,0.2)" }}
        >
          {busy ?? (ref ? t("flow", "replaceAudio") : t("flow", "uploadAudio"))}
        </button>
        {ref ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              setBusy(t("common", "removing"));
              const res = await detachFlowAudio(tenantId, item.id, locale);
              setBusy(null);
              if (res.error) setError(res.error);
              else onFile(null, null, null);
            }}
            className="text-[11px] px-3 py-1.5 rounded-lg border disabled:opacity-60"
            style={{ color: GUEST_BASE_PALETTE.mist, borderColor: `${GUEST_BASE_PALETTE.sand}80` }}
          >
            {t("common", "remove")}
          </button>
        ) : null}
      </div>
      <p className="text-[11px]" style={{ color: GUEST_BASE_PALETTE.mist }}>
        {t("flow", "audioFormats")}
      </p>
      {error && (
        <p className="text-[12px] text-red-700" role="alert">
          {error}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={Object.keys(AUDIO_ALLOWED_TYPES).join(",")}
        className="hidden"
        aria-label={t("flow", "audioFile")}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void handle(f);
        }}
      />
    </div>
  );
}
