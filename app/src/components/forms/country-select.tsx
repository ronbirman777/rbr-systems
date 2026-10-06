"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { findCountry, searchCountries, type Country } from "@/lib/countries";

/**
 * Searchable, valid-only country picker shared by every product and by
 * signup. Two things it deliberately guarantees:
 *
 *   1. Typing never produces a value. The committed value is always an
 *      ISO code chosen from the list, so free text cannot be saved as a
 *      country. The server re-checks with isSupportedCountry regardless.
 *   2. The query is only a filter. Blurring with unmatched text restores
 *      the current selection instead of clearing it, so a stray keystroke
 *      cannot silently wipe a saved country.
 *
 * `variant="phone"` switches the display to the calling code, for the
 * phone-country case where "+972" is what the user is looking for. Both
 * variants search by country name, ISO code, former name and calling
 * code, so "972", "+972", "israel" and "IL" all find Israel.
 *
 * Labels come from the shared dataset and are English today; CP3
 * translates them without touching stored values, because what is stored
 * is the code, never the name.
 */

const MAX_VISIBLE = 60;

export function CountrySelect({
  name,
  value,
  onChange,
  label,
  placeholder = "Search countries…",
  variant = "country",
  required = false,
  disabled = false,
  describedBy,
  id,
}: {
  /** Hidden input name, so this works inside a plain <form> post. */
  name: string;
  /** ISO alpha-2 code, or "" when nothing is chosen. */
  value: string;
  onChange: (code: string) => void;
  label: string;
  placeholder?: string;
  variant?: "country" | "phone";
  required?: boolean;
  disabled?: boolean;
  describedBy?: string;
  id?: string;
}) {
  const reactId = useId();
  const inputId = id ?? `country-${reactId}`;
  const listId = `${inputId}-list`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = findCountry(value);
  const options = useMemo(() => searchCountries(query, MAX_VISIBLE), [query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Keep the active option in view during keyboard navigation.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function close() {
    setOpen(false);
    setQuery("");
    setActive(0);
  }

  function commit(country: Country) {
    onChange(country.code);
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

  const display = selected ? (variant === "phone" ? `${selected.dialCode} ${selected.name}` : selected.name) : "";

  return (
    <div className="flex flex-col gap-1.5" ref={rootRef}>
      <label htmlFor={inputId} className="text-[12.5px] font-semibold text-[#192B21]">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>

      {/* The value that actually posts. Never the visible text. */}
      <input type="hidden" name={name} value={selected?.code ?? ""} />

      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-required={required}
          aria-describedby={describedBy}
          aria-activedescendant={open && options[active] ? `${listId}-${options[active].code}` : undefined}
          disabled={disabled}
          placeholder={selected ? display : placeholder}
          value={open ? query : display}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={(event) => {
            // Only a real outside blur closes; clicking an option keeps focus inside.
            if (!rootRef.current?.contains(event.relatedTarget as Node)) close();
          }}
          className="w-full min-h-11 px-3 rounded-xl border border-[#D9D1C3] bg-white text-[14px] text-[#192B21] placeholder:text-[#8C8A84]"
        />

        {open ? (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[#D9D1C3] bg-white py-1 shadow-lg"
          >
            {options.length === 0 ? (
              <li role="status" className="px-3 py-2 text-[13px] text-[#6F6C66]">
                No countries match “{query}”.
              </li>
            ) : (
              options.map((country, index) => {
                const isActive = index === active;
                const isSelected = country.code === selected?.code;
                return (
                  <li
                    key={country.code}
                    id={`${listId}-${country.code}`}
                    role="option"
                    aria-selected={isSelected}
                    data-active={isActive}
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => commit(country)}
                    className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-[14px] ${
                      isActive ? "bg-[#F3EFE7]" : ""
                    } ${isSelected ? "font-semibold text-[#192B21]" : "text-[#232926]"}`}
                  >
                    <span className="min-w-0 truncate">{country.name}</span>
                    <span className="shrink-0 text-[12.5px] text-[#6F6C66]">{country.dialCode}</span>
                  </li>
                );
              })
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
