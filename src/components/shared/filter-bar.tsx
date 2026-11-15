"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Filter, Search, X } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";

/**
 * Odoo-style control panel: one search box that shows active filters as removable tags,
 * and a "Filters" panel that holds every filter group. Nothing wraps into rows of chips.
 * Backspace in an empty search removes the last tag; "/" focuses the search; "F" opens filters.
 */

type Facet = { label: string; clear: () => void };
type Ctx = { setFacet: (key: string, facet: Facet | null) => void };
const FilterContext = createContext<Ctx | null>(null);

export function FilterBar({
  search,
  onSearch,
  children,
  hasFilters,
  onClear,
  placeholder = "Search…",
  summary,
}: {
  search: string;
  onSearch: (value: string) => void;
  children?: ReactNode;
  hasFilters: boolean;
  onClear: () => void;
  placeholder?: string;
  /** Short result text shown at the right, e.g. "12 vehicles". */
  summary?: ReactNode;
}) {
  const [facets, setFacets] = useState<Record<string, Facet>>({});
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const setFacet = useCallback((key: string, facet: Facet | null) => {
    setFacets(current => {
      if (!facet) { if (!(key in current)) return current; const next = { ...current }; delete next[key]; return next; }
      if (current[key]?.label === facet.label) return { ...current, [key]: facet };
      return { ...current, [key]: facet };
    });
  }, []);
  const ctx = useMemo(() => ({ setFacet }), [setFacet]);
  const list = Object.entries(facets);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement;
      if (event.key.toLowerCase() !== "f" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (!children) return;
      event.preventDefault();
      setOpen(value => !value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [children]);

  return (
    <FilterContext.Provider value={ctx}>
      <div className="relative flex flex-wrap items-center gap-2">
        <label className="flex min-h-9 min-w-0 flex-1 flex-wrap items-center gap-1.5 rounded-[8px] border border-[#D0D5DD] bg-white px-2.5 py-1 focus-within:border-[#006FE6] focus-within:ring-2 focus-within:ring-[#006FE6]/15">
          <Search size={16} className="shrink-0 text-[#667085]" aria-hidden />
          {list.map(([key, facet]) => (
            <span key={key} className="inline-flex h-6 items-center gap-1 rounded-[5px] bg-[#EAF3FF] pl-2 pr-1 text-[13px] font-medium text-[#0058B8]">
              {facet.label}
              <button type="button" onClick={facet.clear} aria-label={`Remove filter ${facet.label}`} className="grid h-5 w-5 place-items-center rounded hover:bg-[#D1E9FF]"><X size={12} /></button>
            </span>
          ))}
          <input
            data-page-search
            type="search"
            aria-label="Search records"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && search) { e.stopPropagation(); onSearch(""); }
              else if (e.key === "Backspace" && !search && list.length) { e.preventDefault(); list[list.length - 1][1].clear(); }
              else if (e.key === "ArrowDown") { const row = document.querySelector<HTMLElement>("[data-row]"); if (row) { e.preventDefault(); row.focus(); } }
            }}
            className="h-7 min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-[#667085]"
            placeholder={list.length ? "" : placeholder}
          />
          <Kbd combo="/" />
        </label>
        {children && (
          <button
            ref={buttonRef}
            type="button"
            aria-expanded={open}
            aria-haspopup="true"
            aria-keyshortcuts="F"
            onClick={() => setOpen(value => !value)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-[8px] border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[#006FE6] ${open || list.length ? "border-[#006FE6] bg-[#EFF8FF] text-[#0058B8]" : "border-[#D0D5DD] bg-white text-[#344054] hover:bg-[#F8FAFC]"}`}
          >
            <Filter size={15} aria-hidden />Filters{list.length ? <span className="tabular-nums">({list.length})</span> : null}<ChevronDown size={14} aria-hidden /><Kbd combo="f" />
          </button>
        )}
        {hasFilters && <button type="button" onClick={onClear} className="h-9 px-2 text-sm font-semibold text-[#475467] hover:text-[#19191F]">Clear</button>}
        {summary && <span className="text-[13px] text-[#475467]" aria-live="polite">{summary}</span>}
        {children && (
          <div
            ref={panelRef}
            hidden={!open}
            className="absolute right-0 top-full z-30 mt-1 w-full max-w-[880px] rounded-[10px] border border-[#D0D5DD] bg-white p-4 shadow-[0_12px_32px_rgba(16,24,40,.14)]"
          >
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">{children}</div>
          </div>
        )}
      </div>
    </FilterContext.Provider>
  );
}

/** One filter group. In a FilterBar it renders as a list in the Filters panel and shows a tag when set. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = "All",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<string | { label: string; value: string }>;
  allLabel?: string;
}) {
  const ctx = useContext(FilterContext);
  const items = options.map(option => typeof option === "string" ? { label: option, value: option } : option);
  const selectedLabel = items.find(item => item.value === value)?.label;
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });
  useEffect(() => {
    if (!ctx) return;
    ctx.setFacet(label, value !== "All" && selectedLabel ? { label: `${label}: ${selectedLabel}`, clear: () => onChangeRef.current("All") } : null);
  }, [ctx, label, value, selectedLabel]);
  useEffect(() => () => ctx?.setFacet(label, null), [ctx, label]);

  const many = items.length > 8;
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-xs font-bold uppercase tracking-[.04em] text-[#475467]">{label}</legend>
      {many ? (
        <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-[8px] border border-[#D0D5DD] bg-white px-2.5 text-sm text-[#344054]">
          <option value="All">{allLabel}</option>
          {items.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      ) : (
        <div role="radiogroup" aria-label={label} className="flex flex-col">
          {[{ label: allLabel, value: "All" }, ...items].map(item => {
            const selected = value === item.value;
            return (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(item.value)}
                className={`flex h-8 items-center gap-2 rounded-[6px] px-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-[#006FE6] ${selected ? "font-semibold text-[#0058B8]" : "text-[#344054] hover:bg-[#F2F4F7]"}`}
              >
                <span className="grid w-4 place-items-center">{selected && <Check size={14} />}</span>
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

/** Register a tag for a filter that is not a FilterSelect (date range, price range). */
export function useFilterFacet(key: string, label: string | null, clear: () => void) {
  const ctx = useContext(FilterContext);
  const clearRef = useRef(clear);
  useEffect(() => { clearRef.current = clear; });
  useEffect(() => { ctx?.setFacet(key, label ? { label, clear: () => clearRef.current() } : null); }, [ctx, key, label]);
  useEffect(() => () => ctx?.setFacet(key, null), [ctx, key]);
}
