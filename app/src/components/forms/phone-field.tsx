"use client";

import { useId, useState } from "react";
import { CountrySelect } from "./country-select";
import { isValidPhone, parsePhone, suggestedPhoneCountry } from "@/lib/phone";

/**
 * Phone entry shared by signup and both Studios: a searchable phone
 * country plus a national number, validated through the one parser in
 * lib/phone.
 *
 * Behaviours that matter and are easy to get wrong:
 *
 *   - Pasting an international number ("+49 170 …", "0049 170 …") keeps
 *     the pasted country and re-points the selector at it. It is never
 *     reinterpreted as a national number of whatever was selected.
 *   - A Space's country only SUGGESTS a phone country. Changing the Space
 *     country never rewrites a number the organizer already entered;
 *     `suggestedCountry` is applied only while the field is still empty.
 *   - Validation runs on blur and on submit, not on every keystroke, so
 *     the field does not shout at someone halfway through typing.
 *   - The error is a localisation-ready key + English default. CP3 swaps
 *     the text; nothing stored changes.
 */

export type PhoneFieldValue = {
  /** ISO alpha-2 of the phone country. */
  country: string;
  /** Exactly what the person typed. Canonicalisation happens on save. */
  number: string;
};

export const PHONE_ERROR_KEY = "form.phone.invalid";
export const PHONE_ERROR_DEFAULT = "Enter a valid phone number for the selected country.";

export function PhoneField({
  countryName,
  numberName,
  value,
  onChange,
  label = "Phone",
  countryLabel = "Phone country",
  required = false,
  suggestedCountry,
  disabled = false,
}: {
  countryName: string;
  numberName: string;
  value: PhoneFieldValue;
  onChange: (next: PhoneFieldValue) => void;
  label?: string;
  countryLabel?: string;
  required?: boolean;
  /** Usually the Space country. A suggestion, never a rewrite. */
  suggestedCountry?: string | null;
  disabled?: boolean;
}) {
  const reactId = useId();
  const errorId = `${reactId}-error`;
  const [touched, setTouched] = useState(false);

  const effectiveCountry = value.country || (value.number ? "" : (suggestedPhoneCountry(suggestedCountry) ?? ""));
  const filled = value.number.trim().length > 0;
  const invalid = touched && filled && !isValidPhone(value.number, { defaultCountry: effectiveCountry });
  const missing = touched && required && !filled;

  function onNumberChange(raw: string) {
    // An international paste identifies its own country - follow it.
    const parsed = /^\s*(\+|00)/.test(raw) ? parsePhone(raw) : null;
    if (parsed?.country) {
      onChange({ country: parsed.country, number: parsed.nationalNumber });
      return;
    }
    onChange({ country: effectiveCountry, number: raw });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
        <CountrySelect
          name={countryName}
          value={effectiveCountry}
          onChange={(code) => onChange({ ...value, country: code })}
          label={countryLabel}
          variant="phone"
          placeholder="Search or +code"
          required={required}
          disabled={disabled}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${reactId}-number`} className="text-[12.5px] font-semibold text-[#192B21]">
            {label}
            {required ? <span aria-hidden="true"> *</span> : null}
          </label>
          <input
            id={`${reactId}-number`}
            name={numberName}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            disabled={disabled}
            aria-required={required}
            aria-invalid={invalid || missing}
            aria-describedby={invalid || missing ? errorId : undefined}
            value={value.number}
            onChange={(event) => onNumberChange(event.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="50 123 4567"
            className="w-full min-h-11 px-3 rounded-xl border border-[#D9D1C3] bg-white text-[14px] text-[#192B21] placeholder:text-[#8C8A84]"
          />
        </div>
      </div>

      {invalid || missing ? (
        <p id={errorId} role="alert" data-i18n-key={PHONE_ERROR_KEY} className="text-[12.5px] text-[#8F3B3B]">
          {PHONE_ERROR_DEFAULT}
        </p>
      ) : null}
    </div>
  );
}
