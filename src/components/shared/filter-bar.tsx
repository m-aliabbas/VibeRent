import type { ReactNode } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FilterBar({
  search,
  onSearch,
  children,
  hasFilters,
  onClear,
  placeholder = "Search by plate, make or model…",
}: {
  search: string;
  onSearch: (value: string) => void;
  children: ReactNode;
  hasFilters: boolean;
  onClear: () => void;
  placeholder?: string;
}) {
  return (
    <div className="rounded-xl border border-[#E4E7EC] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,.03)]">
      <div className="flex flex-col gap-3 xl:flex-row">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[9px] border border-[#D0D5DD] px-3 focus-within:border-[#006FE6] focus-within:ring-2 focus-within:ring-[#006FE6]/10">
          <Search size={17} className="shrink-0 text-[#98A2B3]" />
          <input
            aria-label="Search records"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full bg-transparent text-sm outline-none placeholder:text-[#98A2B3]"
            placeholder={placeholder}
          />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <span className="hidden h-10 items-center px-1 text-[#667085] xl:flex">
            <SlidersHorizontal size={17} />
          </span>
          {children}
          {hasFilters && (
            <Button variant="ghost" onClick={onClear} className="col-span-2">
              <X size={16} />
              Clear filters
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<string | { label:string; value:string }>;
}) {
  return (
    <label className="sr-only">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 min-w-0 rounded-[9px] border border-[#D0D5DD] bg-white px-3 text-sm font-medium text-[#344054] outline-none focus:border-[#006FE6] sm:min-w-[130px]"
      >
        <option value="All">All {label.toLowerCase()}</option>
        {options.map((option) => { const item=typeof option==="string"?{label:option,value:option}:option;return <option key={item.value} value={item.value}>{item.label}</option> })}
      </select>
    </label>
  );
}
