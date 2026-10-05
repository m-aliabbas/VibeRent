"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CarFront,
  FileText,
  Gauge,
  Search,
  ScanText,
  UsersRound,
  X,
} from "lucide-react";
import { bookings, customers } from "@/lib/operations-data";
import { vehicles } from "@/lib/mock-data";

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
const records = [
  ...vehicles.map((item) => ({
    label: `${item.make} ${item.model}`,
    detail: `${item.plate} · ${item.city} · ${item.status}`,
    href: `/vehicles/${item.id}`,
    icon: CarFront,
  })),
  ...bookings.map((item) => ({
    label: `${item.id} · ${item.customer}`,
    detail: `${item.vehicle} · ${item.status}`,
    href: "/bookings",
    icon: CalendarDays,
  })),
  ...customers.map((item) => ({
    label: item.name,
    detail: `${item.id} · ${item.phone}`,
    href: "/customers",
    icon: UsersRound,
  })),
];
const entries = [
  ...pages.map(([label, detail, href, icon]) => ({
    label,
    detail,
    href,
    icon,
  })),
  ...records,
];

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (!open) queueMicrotask(() => setQuery(""));
  }, [open]);
  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return entries
      .filter(
        (item) =>
          !term || `${item.label} ${item.detail}`.toLowerCase().includes(term),
      )
      .slice(0, 10);
  }, [query]);
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
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-24px)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-2xl border border-[#E4E7EC] bg-white shadow-2xl"
        >
          <Dialog.Title className="sr-only">Global search</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search pages, vehicles, bookings, and customers.
          </Dialog.Description>
          <div className="flex items-center gap-3 border-b border-[#EAECF0] px-4">
            <Search size={20} className="text-[#667085]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search pages, vehicles, bookings, customers…"
              aria-label="Search VibeRent"
              className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[#98A2B3]"
            />
            <Dialog.Close className="grid h-9 w-9 place-items-center rounded-lg text-[#667085] hover:bg-[#F2F4F7]">
              <X size={18} />
              <span className="sr-only">Close search</span>
            </Dialog.Close>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {results.length ? (
              <ul aria-label="Search results">
                {results.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <li key={`${item.href}-${item.label}`}>
                      <button
                        onClick={() => choose(item.href)}
                        className="flex w-full items-center gap-3 rounded-[10px] px-3 py-3 text-left hover:bg-[#F5F9FF] focus:bg-[#F5F9FF]"
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
                        {index === 0 && (
                          <kbd className="hidden text-xs text-[#98A2B3] sm:block">
                            Enter
                          </kbd>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="px-4 py-10 text-center">
                <p className="font-semibold">No results found</p>
                <p className="mt-1 text-sm text-[#667085]">
                  Try a plate, booking number, customer, or module name.
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-[#EAECF0] bg-[#F8FAFC] px-4 py-2.5 text-xs text-[#667085]">
            <span>
              {results.length} result{results.length === 1 ? "" : "s"}
            </span>
            <span>Esc to close</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
