"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export type FormMultiSelectOption = {
  label: string;
  value: string;
  description?: string;
  keywords?: string;
  disabled?: boolean;
};

type FormMultiSelectProps = {
  label: string;
  value: string[];
  onValueChange: (value: string[]) => void;
  options: FormMultiSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
};

export function FormMultiSelect({
  label,
  value,
  onValueChange,
  options,
  placeholder = "Select options",
  searchPlaceholder = "Search…",
  emptyText = "No matching options",
  disabled = false,
}: FormMultiSelectProps) {
  const triggerId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedOptions = useMemo(() => options.filter(option => value.includes(option.value)), [options, value]);
  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return options;
    return options.filter(option => `${option.label} ${option.description ?? ""} ${option.keywords ?? ""}`.toLocaleLowerCase().includes(normalized));
  }, [options, query]);
  const enabledFilteredValues = filteredOptions.filter(option => !option.disabled).map(option => option.value);
  const allFilteredSelected = enabledFilteredValues.length > 0 && enabledFilteredValues.every(optionValue => value.includes(optionValue));

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  function toggle(optionValue: string) {
    onValueChange(value.includes(optionValue) ? value.filter(item => item !== optionValue) : [...value, optionValue]);
  }

  function toggleAllFiltered() {
    if (allFilteredSelected) {
      onValueChange(value.filter(item => !enabledFilteredValues.includes(item)));
      return;
    }
    onValueChange([...new Set([...value, ...enabledFilteredValues])]);
  }

  const summary = selectedOptions.length === 0
    ? placeholder
    : selectedOptions.length === 1
      ? selectedOptions[0].label
      : `${selectedOptions.length} selected`;

  return (
    <div ref={rootRef} className="relative">
      <label id={`${triggerId}-label`} className="mb-1.5 block text-sm font-semibold text-[#344054]">{label}</label>
      <button
        id={triggerId}
        type="button"
        aria-labelledby={`${triggerId}-label ${triggerId}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
        onKeyDown={event => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="flex h-11 w-full items-center justify-between gap-3 rounded-[9px] border border-[#D0D5DD] bg-white px-3 text-left text-sm outline-none transition-colors hover:border-[#98A2B3] focus:border-[#006FE6] focus:ring-2 focus:ring-[#006FE6]/10 disabled:cursor-not-allowed disabled:bg-[#F2F4F7] disabled:text-[#98A2B3]"
      >
        <span className={`min-w-0 truncate ${selectedOptions.length ? "font-medium text-[#19191F]" : "text-[#667085]"}`}>{summary}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {selectedOptions.length > 0 && <span className="rounded-full bg-[#EFF8FF] px-2 py-0.5 text-xs font-bold text-[#175CD3]">{selectedOptions.length}</span>}
          <ChevronDown aria-hidden="true" size={17} className={`text-[#667085] transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && !disabled && (
        <div className="absolute z-[70] mt-1 w-full min-w-[280px] overflow-hidden rounded-xl border border-[#D0D5DD] bg-white shadow-xl">
          <div className="border-b p-2">
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#667085]" size={16} />
              <input
                autoFocus
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => event.key === "Escape" && setOpen(false)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="h-10 w-full rounded-lg border border-[#D0D5DD] bg-white pl-9 pr-8 text-sm outline-none placeholder:text-[#98A2B3] focus:border-[#006FE6] focus:ring-2 focus:ring-[#006FE6]/10"
              />
              {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#667085] hover:bg-[#F2F4F7]"><X size={14} /></button>}
            </div>
          </div>
          <div role="listbox" aria-multiselectable="true" aria-labelledby={`${triggerId}-label`} className="max-h-64 overflow-y-auto p-1.5">
            {filteredOptions.length ? filteredOptions.map(option => {
              const selected = value.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={option.disabled}
                  onClick={() => toggle(option.value)}
                  className={`flex min-h-11 w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${selected ? "bg-[#EFF8FF]" : "hover:bg-[#F8FAFC]"}`}
                >
                  <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border ${selected ? "border-[#006FE6] bg-[#006FE6] text-white" : "border-[#98A2B3] bg-white"}`}>{selected && <Check aria-hidden="true" size={14} strokeWidth={3} />}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[#344054]">{option.label}</span>
                    {option.description && <span className="mt-0.5 block truncate text-xs text-[#667085]">{option.description}</span>}
                  </span>
                </button>
              );
            }) : <p className="px-3 py-7 text-center text-sm text-[#667085]">{emptyText}</p>}
          </div>
          <div className="flex items-center justify-between gap-2 border-t bg-[#F8FAFC] px-3 py-2">
            <span className="text-xs text-[#667085]">{value.length} selected</span>
            <div className="flex gap-1">
              <button type="button" disabled={!enabledFilteredValues.length} onClick={toggleAllFiltered} className="rounded-md px-2 py-1 text-xs font-semibold text-[#175CD3] hover:bg-[#E0F2FE] disabled:opacity-40">{allFilteredSelected ? "Clear shown" : "Select shown"}</button>
              {value.length > 0 && <button type="button" onClick={() => onValueChange([])} className="rounded-md px-2 py-1 text-xs font-semibold text-[#475467] hover:bg-[#EAECF0]">Clear all</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
