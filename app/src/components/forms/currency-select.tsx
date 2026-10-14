"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { currencyDisplayName, currencyPickerOptions, findCurrency, type Currency } from "@/lib/currencies";
import { useHasMounted } from "@/lib/currencies/useFormattedPrice";
import { createTranslator, type Locale } from "@/lib/i18n";

/**
 * Searchable, valid-only ISO 4217 currency picker (TASK 033, plan §4.2.2).
 * Same interaction contract as CountrySelect:
 *
 *   1. Typing never produces a value - the committed value is always an ISO
 *      code chosen from the list. Servers re-check with isoCurrencySchema.
 *   2. The query is only a filter. Blurring with unmatched text restores the
 *      current selection instead of clearing it.
 *
 * Search matches the code, the English name and the localized name. With an
 * empty query a pinned "common" group sits above the full list.
 *
 * A legacy stored value that is not an ISO code ("€", "BAHT", "EURO") is
 * shown as-is in a notice and is never rewritten until the organizer picks
 * a real code.
 *
 * Localized names come from Intl.DisplayNames, whose output varies by ICU
 * version, so they are used only after mount (English before), keeping the
 * server render and hydration identical.
 */

export function CurrencySelect({
  value,
  onChange,
  label,
  locale,
  name,
  required = false,
  disabled = false,
  describedBy,
  id,
}: {
  /** Stored value: an ISO code, a legacy raw string, or null/"" when unset. */
  value: string | null;
  onChange: (code: string) => void;
  label: string;
  /** The Studio UI language (labels, localized currency names). */
  locale: Locale;
  /** Optional hidden input name for plain <form> posts. */
  name?: string;
  required?: boolean;
  disabled?: boolean;
  describedBy?: string;
  id?: string;
}) {
  const { t } = createTranslator(locale);
  const mounted = useHasMounted();
  const nameLocale: Locale = mounted ? locale : "en";

  const reactId = useId();
  const inputId = id ?? `currency-${reactId}`;
  const listId = `${inputId}-list`;
  const noticeId = `${inputId}-notice`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = findCurrency(value);
  const raw = typeof value === "string" ? value.trim() : "";
  const unrecognised = raw !== "" && !selected;

  const { common, rest } = useMemo(() => currencyPickerOptions(query, nameLocale), [query, nameLocale]);
  const options = useMemo(() => [...common, ...rest], [common, rest]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  function close() {
    setOpen(false);
    setQuery("");
    setActive(0);
  }

  function commit(currency: Currency) {
    onChange(currency.code);
    close();
    inputRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      setOpen(true);
      event.preventDefault();
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(Math.max(options.length - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = options[active];
      if (option) commit(option);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  const display = selected ? `${selected.code} — ${currencyDisplayName(selected.code, nameLocale)}` : "";
  const describedByIds = [describedBy, unrecognised ? noticeId : null].filter(Boolean).join(" ") || undefined;

  function renderOption(currency: Currency, index: number) {
    const isActive = index === active;
    const isSelected = currency.code === selected?.code;
    return (
      <li
        key={currency.code}
        id={`${listId}-${currency.code}`}
        role="option"
        aria-selected={isSelected}
        data-active={isActive}
        data-code={currency.code}
        onMouseEnter={() => setActive(index)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => commit(currency)}
        className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-[14px] ${isActive ? "bg-[#F3EFE7]" : ""} ${
          isSelected ? "font-semibold text-[#192B21]" : "text-[#232926]"
        }`}
      >
        <span dir="ltr" className="w-11 shrink-0 font-semibold tabular-nums">
          {currency.code}
        </span>
        <span className="min-w-0 truncate">{currencyDisplayName(currency.code, nameLocale)}</span>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-1.5" ref={rootRef} data-testid="currency-select">
      <label htmlFor={inputId} className="text-[12.5px] font-semibold text-[#192B21]">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>

      {name ? <input type="hidden" name={name} value={selected?.code ?? ""} /> : null}

      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          dir="auto"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-required={required}
          aria-invalid={unrecognised || undefined}
          aria-describedby={describedByIds}
          aria-activedescendant={open && options[active] ? `${listId}-${options[active].code}` : undefined}
          disabled={disabled}
          placeholder={selected ? display : t("studio", "currencySearchPlaceholder")}
          value={open ? query : display}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={(event) => {
            if (!rootRef.current?.contains(event.relatedTarget as Node)) close();
          }}
          className="w-full min-h-11 px-3 rounded-xl border border-[#D9D1C3] bg-white text-base sm:text-[14px] text-[#192B21] placeholder:text-[#8C8A84]"
        />

        {open ? (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[#D9D1C3] bg-white py-1 shadow-lg text-start"
          >
            {options.length === 0 ? (
              <li role="status" className="px-3 py-2 text-[13px] text-[#6F6C66]">
                {t("studio", "currencyNoMatch", { query })}
              </li>
            ) : (
              <>
                {common.length > 0 ? (
                  <li role="presentation" className="px-3 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#8C8A84]">
                    {t("studio", "currencyCommonGroup")}
                  </li>
                ) : null}
                {common.map((c, i) => renderOption(c, i))}
                {common.length > 0 ? (
                  <li role="presentation" className="px-3 pt-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#8C8A84]">
                    {t("studio", "currencyAllGroup")}
                  </li>
                ) : null}
                {rest.map((c, i) => renderOption(c, common.length + i))}
              </>
            )}
          </ul>
        ) : null}
      </div>

      {unrecognised ? (
        <p id={noticeId} role="alert" className="text-[12px] text-[#8F3B3B]" data-testid="currency-unrecognised">
          {t("studio", "currencyUnrecognised", { value: raw })}
        </p>
      ) : null}
    </div>
  );
}
