"use client";

/* eslint-disable @next/next/no-img-element */
import { useId, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { FocalPointPicker } from "@/components/focal-point-picker";
import { ImageUploadErrorDialog } from "@/components/image-upload-error-dialog";
import { validateImageFile, classifyServerImageError } from "@/lib/media/clientValidation";
import { focalPointToObjectPosition, type FocalPoint } from "@/lib/media/focalPoint";
import { meetsAA } from "@/lib/theme/contrast";

/** Shared Studio form primitives (platform chrome, not guest theme) - used by the Time to Teach and Time to Flow Studios. */

export const INPUT =
  "w-full bg-white border border-[#D4C5A9]/70 rounded-xl px-3.5 py-2.5 text-[14px] text-[#232926] outline-none focus:ring-2 focus:ring-[#9A7B4F]/25 focus:border-[#9A7B4F]/60 placeholder:text-[#9B8E84]/70 transition-all";

export function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-[10.5px] tracking-[0.14em] uppercase font-semibold block mb-1.5 text-[#8C8A84]">
      {children}
    </label>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[11.5px] mt-1.5 text-[#8C8A84] leading-snug">{children}</p>;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  type = "text",
  maxLength,
  suffix,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  type?: string;
  maxLength?: number;
  suffix?: string;
  inputMode?: "text" | "tel" | "email" | "url" | "numeric";
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <input
          id={id}
          type={type}
          value={value}
          maxLength={maxLength}
          inputMode={inputMode}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${INPUT} ${suffix ? "pr-32" : ""}`}
        />
        {suffix ? <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-[#8C8A84] pointer-events-none">{suffix}</span> : null}
      </div>
      {hint ? <Hint>{hint}</Hint> : null}
    </div>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  hint,
  rows = 4,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  rows?: number;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <textarea id={id} value={value} rows={rows} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${INPUT} leading-relaxed resize-y`} />
      {hint ? <Hint>{hint}</Hint> : null}
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className={INPUT}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <Hint>{hint}</Hint> : null}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex items-center gap-3 min-h-11 cursor-pointer">
      <span className="flex-1 min-w-0">
        <span className="block text-[13.5px] font-medium text-[#192B21]">{label}</span>
        {description ? <span className="block text-[11.5px] text-[#8C8A84]">{description}</span> : null}
      </span>
      <input type="checkbox" className="sr-only peer" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden="true" className={`relative w-10 h-6 rounded-full transition-colors shrink-0 peer-focus-visible:ring-2 peer-focus-visible:ring-[#9A7B4F]/50 ${checked ? "bg-[#4E7A5B]" : "bg-[#D8D2C7]"}`}>
        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? "left-5" : "left-1"}`} />
      </span>
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: readonly { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-[#EBE1D5]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 min-h-9 rounded-lg text-[12.5px] transition-all ${value === o.value ? "bg-white shadow-sm font-semibold text-[#192B21]" : "font-medium text-[#6F6C66]"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Card({ title, description, children, actions }: { title?: string; description?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-[#E2DACD] p-5 sm:p-6 flex flex-col gap-5">
      {title ? (
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[19px] text-[#192B21]" style={{ fontFamily: "var(--font-fraunces), serif" }}>
              {title}
            </h2>
            {description ? <p className="text-[12.5px] text-[#8C8A84] mt-1 leading-relaxed max-w-[60ch]">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function StudioButton({
  children,
  onClick,
  kind = "primary",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "outline" | "soft" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const cls =
    kind === "primary"
      ? "bg-[#192B21] text-white"
      : kind === "soft"
        ? "bg-[#F1E9DC] text-[#192B21]"
        : kind === "danger"
          ? "border border-[#8F3B3B]/30 text-[#8F3B3B]"
          : "border border-[#192B21]/20 text-[#192B21]";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-2 min-h-10 px-4 rounded-full text-[12.5px] font-semibold transition active:scale-[0.98] disabled:opacity-50 ${cls}`}>
      {children}
    </button>
  );
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Colour input: preset swatches, a typed hex field and the native visual
 * colour picker - all three bound to the same value, so typing a hex moves
 * the picker and dragging the picker rewrites the hex.
 */
export function ColorField({
  label,
  value,
  onChange,
  swatches,
  hint,
  checkWhiteText = false,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  swatches?: readonly { label: string; hex: string }[];
  hint?: string;
  checkWhiteText?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }
  const valid = HEX.test(draft);
  const commit = (v: string) => {
    const next = v.startsWith("#") ? v : `#${v}`;
    setDraft(next);
    if (HEX.test(next)) onChange(next.toUpperCase());
  };
  return (
    <div className="flex flex-col gap-2.5" data-testid={`color-field-${label}`}>
      <Label htmlFor={id}>{label}</Label>
      {swatches ? (
        <div className="flex flex-wrap gap-2">
          {swatches.map((s) => (
            <button
              key={s.hex + s.label}
              type="button"
              onClick={() => commit(s.hex)}
              title={s.label}
              aria-label={`${s.label} ${s.hex}`}
              className="w-8 h-8 rounded-full border border-black/10"
              style={{ background: s.hex, outline: value.toLowerCase() === s.hex.toLowerCase() ? "2px solid #192B21" : "none", outlineOffset: 2 }}
            />
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-2.5">
        <input
          type="color"
          aria-label={`${label} visual picker`}
          value={HEX.test(value) ? value : "#5B7A6E"}
          onChange={(e) => commit(e.target.value)}
          className="w-11 h-11 rounded-xl border border-[#D4C5A9]/70 bg-white p-1 cursor-pointer"
        />
        <input
          id={id}
          value={draft}
          onChange={(e) => commit(e.target.value.trim())}
          maxLength={7}
          spellCheck={false}
          aria-invalid={!valid}
          className={`${INPUT} font-mono uppercase max-w-[140px]`}
        />
        {!valid ? <span className="text-[11.5px] text-[#8F3B3B]">Use a 6-digit hex like #5B7A6E</span> : null}
      </div>
      {checkWhiteText && valid ? (
        meetsAA(draft, "#FFFFFF") ? (
          <p className="text-[11.5px] text-[#4E7A5B]">✓ Buttons stay readable with white text (WCAG AA).</p>
        ) : (
          <p className="text-[11.5px] text-[#A8643C]">This colour is light — buttons will switch to dark text automatically to stay readable.</p>
        )
      ) : null}
      {hint ? <Hint>{hint}</Hint> : null}
    </div>
  );
}

/**
 * Image control used by every Teach image surface: upload / replace /
 * remove, with the shared FocalPointPicker once an image exists. Replacing
 * or removing always resets the focal point (the caller stores null), so a
 * stale point can never carry over to a different photo.
 */
export function ImageField({
  label,
  imageUrl,
  focal,
  onFocal,
  onUpload,
  onRemove,
  hint,
  previewClassName = "w-[120px] h-[120px] rounded-xl",
  disabled,
}: {
  label: string;
  imageUrl: string | null;
  focal: FocalPoint | null;
  onFocal: (f: FocalPoint | null) => void;
  onUpload: (file: File) => Promise<string | null>;
  onRemove: () => Promise<string | null>;
  hint?: string;
  previewClassName?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [errorDialog, setErrorDialog] = useState<{ title: string; body: string } | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const check = validateImageFile(file);
    if (!check.ok) {
      setErrorDialog({ title: check.title, body: check.body });
      return;
    }
    setBusy("upload");
    const err = await onUpload(file);
    setBusy(null);
    if (err) setErrorDialog(classifyServerImageError(err));
  }

  async function handleRemove() {
    setBusy("remove");
    const err = await onRemove();
    setBusy(null);
    if (err) setErrorDialog({ title: "Couldn't remove the image", body: err });
  }

  return (
    <div className="flex flex-col gap-2" data-testid={`image-field-${label}`}>
      <Label>{label}</Label>
      <div className="flex flex-wrap items-start gap-4">
        {imageUrl ? (
          <img src={imageUrl} alt="" className={`${previewClassName} object-cover border border-[#E2DACD]`} style={{ objectPosition: focalPointToObjectPosition(focal) }} />
        ) : (
          <div className={`${previewClassName} border border-dashed border-[#D4C5A9] bg-[#FBF8F2] flex items-center justify-center text-[11px] text-[#8C8A84] text-center px-2`}>No image yet</div>
        )}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <StudioButton kind="outline" onClick={() => inputRef.current?.click()} disabled={disabled || busy !== null}>
              {busy === "upload" ? "Uploading…" : imageUrl ? "Replace" : "Upload image"}
            </StudioButton>
            {imageUrl ? (
              <StudioButton kind="outline" onClick={handleRemove} disabled={disabled || busy !== null}>
                {busy === "remove" ? "Removing…" : "Remove"}
              </StudioButton>
            ) : null}
          </div>
          <Hint>{hint ?? "JPG, PNG or WebP up to 8 MB."}</Hint>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} aria-label={`${label} file`} />
        </div>
      </div>
      {imageUrl ? <FocalPointPicker imageUrl={imageUrl} position={focal} onChange={onFocal} label={label} /> : null}
      <ImageUploadErrorDialog
        open={errorDialog !== null}
        title={errorDialog?.title ?? ""}
        body={errorDialog?.body ?? ""}
        onPrimary={() => {
          setErrorDialog(null);
          inputRef.current?.click();
        }}
        onCancel={() => setErrorDialog(null)}
      />
    </div>
  );
}
