"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

export type FormComboboxOption = {
  label: string;
  value: string;
  keywords?: string;
};

type FormComboboxProps = {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: FormComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
};

export function FormCombobox({
  label,
  value,
  onValueChange,
  options,
  placeholder = "Select an option",
  searchPlaceholder = "Type to search…",
  emptyText = "No matching options",
  disabled = false,
  required = false,
  error,
}: FormComboboxProps) {
  const inputId = useId();
  const listId = `${inputId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => options.find(option => option.value === value), [options, value]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const displayValue = open ? query : selected?.label ?? "";

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery || normalizedQuery === selected?.label.toLocaleLowerCase()) return options;
    return options.filter(option => `${option.label} ${option.keywords ?? ""}`.toLocaleLowerCase().includes(normalizedQuery));
  }, [options, query, selected?.label]);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  const safeActiveIndex = Math.min(activeIndex, Math.max(filteredOptions.length - 1, 0));

  function choose(option: FormComboboxOption) {
    onValueChange(option.value);
    setQuery(option.label);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(current => Math.min(current + 1, Math.max(filteredOptions.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(current => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && open && filteredOptions[safeActiveIndex]) {
      event.preventDefault();
      choose(filteredOptions[safeActiveIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery(selected?.label ?? "");
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-[#344054]">
        {label}{required && <span className="text-[#D92D20]"> *</span>}
      </label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#667085]" size={16} />
        <input
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          aria-activedescendant={open && filteredOptions[safeActiveIndex] ? `${listId}-${safeActiveIndex}` : undefined}
          aria-invalid={Boolean(error)}
          autoComplete="off"
          disabled={disabled}
          required={required}
          value={displayValue}
          placeholder={open ? searchPlaceholder : placeholder}
          onFocus={event => {
            setOpen(true);
            setActiveIndex(Math.max(0, options.findIndex(option => option.value === value)));
            setQuery(selected?.label ?? "");
            event.currentTarget.select();
          }}
          onChange={event => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className={`h-11 w-full rounded-[9px] border bg-white pl-9 pr-9 text-sm text-[#19191F] outline-none placeholder:text-[#98A2B3] focus:border-[#006FE6] focus:ring-2 focus:ring-[#006FE6]/10 disabled:bg-[#F2F4F7] ${error ? "border-[#F04438]" : "border-[#D0D5DD]"}`}
        />
        <ChevronDown aria-hidden="true" className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#667085] transition-transform ${open ? "rotate-180" : ""}`} size={17} />
      </div>
      {open && !disabled && (
        <div id={listId} role="listbox" className="absolute z-[70] mt-1 max-h-56 w-full overflow-y-auto rounded-[10px] border border-[#D0D5DD] bg-white p-1 shadow-lg">
          {filteredOptions.length ? filteredOptions.map((option, index) => (
            <button
              id={`${listId}-${index}`}
              key={option.value || "__empty"}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={event => event.preventDefault()}
              onClick={() => choose(option)}
              className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${index === safeActiveIndex ? "bg-[#EFF8FF] text-[#0058B8]" : "text-[#344054] hover:bg-[#F8FAFC]"}`}
            >
              <span className="min-w-0 truncate">{option.label}</span>
              {option.value === value && <Check aria-hidden="true" className="shrink-0 text-[#006FE6]" size={16} />}
            </button>
          )) : <p className="px-3 py-5 text-center text-sm text-[#667085]">{emptyText}</p>}
        </div>
      )}
      {error && <span className="mt-1 block text-xs text-[#D92D20]">{error}</span>}
    </div>
  );
}
