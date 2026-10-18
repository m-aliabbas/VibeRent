"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CarFront,
  FileText,
  Gauge,
  HandCoins,
  Search,
  ScanText,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { searchAgencyRecordsAction } from "@/app/actions/search";
import type { GlobalSearchResult, GlobalSearchScope } from "@/server/services/search-service";

const pages = [
  ["Dashboard", "Operational overview", "/", Gauge],
  ["Vehicles", "Fleet records and availability", "/vehicles", CarFront],
  ["Bookings", "Reservations and rentals", "/bookings", CalendarDays],
  ["Customers", "Renter profiles and history", "/customers", UsersRound],
  ["Expenses", "Fleet costs and receipts", "/expenses", FileText],
  ["Reports", "Profitability and utilization", "/reports", FileText],
  ["Owners", "Managed fleet and payouts", "/owners", UsersRound],
  ["CNIC OCR", "Extract identity fields from a CNIC image", "/cnic-ocr", ScanText],
] as const;
const pageEntries = pages.map(([label, detail, href, icon]) => ({ label, detail, href, icon }));
const recordIcons = { vehicle: CarFront, booking: CalendarDays, customer: UsersRound, owner: HandCoins, expense: FileText } as const;
const searchScopes: Array<{ value: GlobalSearchScope; label: string; icon: LucideIcon; hint: string; placeholder: string }> = [
  { value: "all", label: "All", icon: Search, hint: "Search every page and agency record.", placeholder: "Search VibeRent…" },
  { value: "booking", label: "Bookings", icon: CalendarDays, hint: "Try a booking number, customer, vehicle, or status.", placeholder: "Search booking number, customer or vehicle…" },
  { value: "vehicle", label: "Vehicles", icon: CarFront, hint: "Try a plate number, make, model, city, or status.", placeholder: "Search plate, make, model or city…" },
  { value: "customer", label: "Customers", icon: UsersRound, hint: "Try a customer name, phone number, or status.", placeholder: "Search customer name or phone…" },
  { value: "owner", label: "Owners", icon: HandCoins, hint: "Try an owner name, phone number, agreement, or balance status.", placeholder: "Search owner name, phone or agreement…" },
  { value: "expense", label: "Expenses", icon: FileText, hint: "Try an expense description, category, amount, vehicle, or customer.", placeholder: "Search expenses…" },
  { value: "pages", label: "Pages", icon: FileText, hint: "Jump directly to a VibeRent module.", placeholder: "Search dashboard pages and modules…" },
];

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<GlobalSearchScope>("all");
  const [activeIndex, setActiveIndex] = useState(0);
  const [records, setRecords] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const selectedScope = searchScopes.find((item) => item.value === scope) ?? searchScopes[0];
  const SelectedScopeIcon = selectedScope.icon;
  useEffect(() => {
    if (!open) queueMicrotask(() => {
      setQuery("");
      setActiveIndex(0);
      setRecords([]);
      setSearchError("");
    });
  }, [open]);
  useEffect(() => {
    const term = query.trim();
    if (scope === "pages" || term.length < 2) {
      queueMicrotask(() => {
        setRecords([]);
        setLoading(false);
        setSearchError("");
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true);
        setSearchError("");
      }
    });
    const timer = window.setTimeout(async () => {
      const result = await searchAgencyRecordsAction(term, scope);
      if (cancelled) return;
      setLoading(false);
      if (result.ok) setRecords(result.data);
      else {
        setRecords([]);
        setSearchError(result.error.message);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, scope]);
  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matchingPages = scope === "all" || scope === "pages" ? pageEntries.filter((item) => !term || `${item.label} ${item.detail}`.toLowerCase().includes(term)) : [];
    const recordEntries = records.map((item) => ({ ...item, icon: recordIcons[item.kind] }));
    return [...matchingPages, ...recordEntries].slice(0, 12);
  }, [query, records, scope]);
  const choose = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45 backdrop-blur-[2px]" />
        <Dialog.Content
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
          className="fixed left-1/2 top-[8vh] z-50 w-[calc(100%-24px)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-2xl border border-[#DDE3EA] bg-white shadow-[0_24px_80px_rgba(16,24,40,.24)] sm:top-[12vh]"
        >
          <Dialog.Title className="sr-only">Global search</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search pages, vehicles, bookings, customers, and owners.
          </Dialog.Description>
          <div className="flex items-center gap-3 border-b border-[#EAECF0] px-4 sm:px-5">
            <Search size={21} className="shrink-0 text-[#475467]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveIndex((current) => Math.min(current + 1, results.length - 1));
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex((current) => Math.max(current - 1, 0));
                }
                if (event.key === "Enter" && results[activeIndex]) {
                  event.preventDefault();
                  choose(results[activeIndex].href);
                }
              }}
              placeholder={selectedScope.placeholder}
              aria-label="Search VibeRent"
              className="h-16 min-w-0 flex-1 bg-transparent text-base font-medium text-[#101828] outline-none placeholder:font-normal placeholder:text-[#98A2B3]"
            />
            <Dialog.Close className="grid h-9 w-9 place-items-center rounded-lg text-[#667085] hover:bg-[#F2F4F7]">
              <X size={18} />
              <span className="sr-only">Close search</span>
            </Dialog.Close>
          </div>
          <div className="border-b border-[#EAECF0] bg-[#F8FAFC] px-3 py-3 sm:px-4">
            <div className="flex gap-1.5 overflow-x-auto" role="radiogroup" aria-label="Search in">
              {searchScopes.map((item) => {
                const Icon = item.icon;
                const selected = scope === item.value;
                return <button
                  key={item.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setScope(item.value);
                    setActiveIndex(0);
                    inputRef.current?.focus();
                  }}
                  className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition focus:outline-2 focus:outline-offset-1 focus:outline-[#006FE6] ${selected ? "border-[#84CAFF] bg-white text-[#006FE6] shadow-sm" : "border-transparent text-[#667085] hover:border-[#D0D5DD] hover:bg-white hover:text-[#344054]"}`}
                >
                  <Icon size={16}/>{item.label}
                </button>;
              })}
            </div>
          </div>
          <div className="min-h-64 max-h-[56vh] overflow-y-auto p-2">
            {loading ? (
              <div className="flex min-h-60 items-center justify-center gap-2 px-4 py-10 text-sm font-medium text-[#667085]"><span className="size-4 animate-spin rounded-full border-2 border-[#B2DDFF] border-t-[#006FE6]"/>Searching {selectedScope.label.toLowerCase()}…</div>
            ) : results.length ? (
              <ul aria-label="Search results">
                {results.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <li key={`${item.href}-${item.label}`}>
                      <button
                        onClick={() => choose(item.href)}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-3 text-left focus:outline-none ${activeIndex === index ? "bg-[#F5F9FF]" : "hover:bg-[#F8FAFC]"}`}
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]">
                          <Icon size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[#344054]">
                            {item.label}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-[#667085]">
                            {item.detail}
                          </span>
                        </span>
                        {activeIndex === index && (
                          <kbd className="hidden text-xs text-[#98A2B3] sm:block">
                            Enter
                          </kbd>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : searchError ? (
              <div className="flex min-h-60 flex-col items-center justify-center px-4 py-10 text-center"><span className="grid h-12 w-12 place-items-center rounded-xl bg-[#FEF3F2] text-[#B42318]"><X size={22}/></span><p className="mt-4 font-semibold text-[#B42318]">Search is unavailable</p><p className="mt-1 max-w-sm text-sm text-[#667085]">{searchError}</p></div>
            ) : (
              <div className="flex min-h-60 flex-col items-center justify-center px-4 py-10 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#EFF8FF] text-[#006FE6]"><SelectedScopeIcon size={22}/></span>
                <p className="mt-4 font-semibold text-[#101828]">{query.trim().length < 2 ? `Search ${selectedScope.label.toLowerCase()}` : `No ${selectedScope.label.toLowerCase()} found`}</p>
                <p className="mt-1 max-w-sm text-sm leading-6 text-[#667085]">
                  {query.trim().length === 1 ? "Enter one more character to start searching." : selectedScope.hint}
                </p>
              </div>
            )}
          </div>
          <div className="flex min-h-11 items-center justify-between gap-3 border-t border-[#EAECF0] bg-[#F8FAFC] px-4 py-2.5 text-xs text-[#667085]">
            <span>
              {results.length} result{results.length === 1 ? "" : "s"}
            </span>
            <span className="hidden items-center gap-2 sm:flex"><ArrowUp size={12}/><ArrowDown size={12}/> navigate <span aria-hidden>·</span> Enter open <span aria-hidden>·</span> Esc close</span>
            <span className="sm:hidden">Tap a result to open</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
