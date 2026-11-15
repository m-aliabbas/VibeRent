"use client";

import { Check } from "lucide-react";
import { useFilterFacet } from "@/components/shared/filter-bar";

/** Date range as presets first (one click), with typed dates for anything else. Values are YYYY-MM-DD. */
const toIso = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

function presets() {
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 6);
  return [
    { label: "Any time", from: "", to: "" },
    { label: "Today", from: toIso(today), to: toIso(today) },
    { label: "Last 7 days", from: toIso(weekAgo), to: toIso(today) },
    { label: "This month", from: toIso(startOfMonth), to: toIso(today) },
    { label: "Last month", from: toIso(lastMonthStart), to: toIso(lastMonthEnd) },
  ];
}

export function DateRangeFilter({ from, to, onChange, label = "Date" }: { from: string; to: string; onChange: (from: string, to: string) => void; label?: string }) {
  const options = presets();
  const active = options.find(option => option.from === from && option.to === to);
  useFilterFacet(`range:${label}`, from || to ? `${label}: ${active && active.label !== "Any time" ? active.label : `${from || "…"} – ${to || "…"}`}` : null, () => onChange("", ""));
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-xs font-bold uppercase tracking-[.04em] text-[#475467]">{label}</legend>
      <div role="radiogroup" aria-label={`${label} range`} className="flex flex-col">
        {options.map(option => {
          const selected = active?.label === option.label;
          return (
            <button key={option.label} type="button" role="radio" aria-checked={selected} onClick={() => onChange(option.from, option.to)} className={`flex h-8 items-center gap-2 rounded-[6px] px-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-[#006FE6] ${selected ? "font-semibold text-[#0058B8]" : "text-[#344054] hover:bg-[#F2F4F7]"}`}>
              <span className="grid w-4 place-items-center">{selected && <Check size={14} />}</span>{option.label}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex items-center gap-1">
        <input aria-label={`${label} from`} type="date" value={from} max={to || undefined} onChange={event => onChange(event.target.value, to)} className="h-8 min-w-0 flex-1 rounded-[6px] border border-[#D0D5DD] px-1.5 text-[13px] tabular-nums" />
        <span className="text-[#667085]">–</span>
        <input aria-label={`${label} to`} type="date" value={to} min={from || undefined} onChange={event => onChange(from, event.target.value)} className="h-8 min-w-0 flex-1 rounded-[6px] border border-[#D0D5DD] px-1.5 text-[13px] tabular-nums" />
      </div>
    </fieldset>
  );
}
