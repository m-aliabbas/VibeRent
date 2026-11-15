"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, CircleDollarSign } from "lucide-react";
import { moveRowFocus } from "@/components/shared/data-table";
import { Toast } from "@/components/shared/toast";
import { formatPkr } from "@/lib/utils";

export type QueueKind = "overdue" | "late-pickup" | "missed-pickup" | "pickup" | "return" | "payment";
export type QueueRow = {
  key: string;
  bookingId: string;
  reference: string;
  kind: QueueKind;
  time: string;
  customer: string;
  vehicle: string;
  plate: string;
  balance: number;
};

const kindMeta: Record<QueueKind, { label: string; tone: string; icon: typeof AlertTriangle; action: string; query: string }> = {
  overdue: { label: "Overdue", tone: "bg-[#FEF3F2] text-[#B42318] ring-[#FECDCA]", icon: AlertTriangle, action: "Check in", query: "?action=return" },
  "late-pickup": { label: "Late", tone: "bg-[#FFFAEB] text-[#B54708] ring-[#FEDF89]", icon: AlertTriangle, action: "Start rental", query: "?action=checkout" },
  "missed-pickup": { label: "Missed pickup", tone: "bg-[#F2F4F7] text-[#475467] ring-[#D0D5DD]", icon: AlertTriangle, action: "Open", query: "" },
  pickup: { label: "Pickup", tone: "bg-[#F2F4F7] text-[#344054] ring-[#D0D5DD]", icon: ArrowUpRight, action: "Start rental", query: "?action=checkout" },
  return: { label: "Return", tone: "bg-[#F2F4F7] text-[#344054] ring-[#D0D5DD]", icon: ArrowDownLeft, action: "Check in", query: "?action=return" },
  payment: { label: "Payment due", tone: "bg-[#FFFAEB] text-[#B54708] ring-[#FEDF89]", icon: CircleDollarSign, action: "Record payment", query: "?action=payment" },
};

type Filter = "all" | "overdue" | "pickup" | "return" | "payment";

export function TodayQueue({ rows, paymentsDueTotal }: { rows: QueueRow[]; paymentsDueTotal: number }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [notice, setNotice] = useState("");
  const count = (kinds: QueueKind[]) => rows.filter(row => kinds.includes(row.kind)).length;
  const tiles: Array<{ key: Filter; label: string; value: string; note: string; attention: boolean }> = [
    { key: "overdue", label: "Overdue", value: String(count(["overdue", "late-pickup", "missed-pickup"])), note: "", attention: count(["overdue", "late-pickup", "missed-pickup"]) > 0 },
    { key: "pickup", label: "Pickups today", value: String(count(["pickup"])), note: "Cars going out", attention: false },
    { key: "return", label: "Returns today", value: String(count(["return"])), note: "Cars coming back", attention: false },
    { key: "payment", label: "Payments due", value: formatPkr(paymentsDueTotal), note: `${count(["payment"])} booking${count(["payment"]) === 1 ? "" : "s"} with a balance`, attention: paymentsDueTotal > 0 },
  ];
  const visible = rows.filter(row =>
    filter === "all" ? row.kind !== "payment" :
    filter === "overdue" ? row.kind === "overdue" || row.kind === "late-pickup" || row.kind === "missed-pickup" :
    row.kind === filter,
  );
  const timeFormat = new Intl.DateTimeFormat("en-PK", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" });

  return (
    <div>
      <Toast message={notice} onDismiss={() => setNotice("")} />

      <section className="min-w-0 overflow-hidden rounded-xl border border-[#E4E7EC] bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#EAECF0] px-4 py-3">
          <h2 className="mr-1 whitespace-nowrap font-bold">Today’s work</h2>
          <div role="group" aria-label="Filter today’s work" className="flex flex-wrap gap-1.5">
            {tiles.map(tile => {
              const selected = filter === tile.key;
              return (
                <button key={tile.key} type="button" aria-pressed={selected} onClick={() => setFilter(selected ? "all" : tile.key)} className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#006FE6] ${selected ? "border-[#006FE6] bg-[#EFF8FF] text-[#0058B8]" : tile.attention ? (tile.key === "overdue" ? "border-[#FDA29B] bg-[#FEF3F2] text-[#B42318]" : "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]") : "border-[#D0D5DD] bg-white text-[#344054]"}`}>
                  {tile.label}<span className="tabular-nums">{tile.value}</span>
                </button>
              );
            })}
          </div>
        </div>
        {visible.length ? (
          <div className="overflow-x-auto"><table className="w-full text-left text-[13px]">
            <thead className="sr-only sm:not-sr-only">
              <tr className="border-b border-[#EAECF0] text-xs font-bold uppercase tracking-[.04em] text-[#475467] bg-[#F2F4F7]">
                <th className="px-3 py-2">What</th><th className="px-3 py-1.5">When</th><th className="px-3 py-1.5">Customer</th><th className="hidden px-3 py-1.5 md:table-cell">Vehicle</th><th className="hidden px-3 py-1.5 text-right md:table-cell">Balance</th><th className="px-3 py-1.5 text-right"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAECF0]" onKeyDown={moveRowFocus}>
              {visible.map(row => {
                const meta = kindMeta[row.kind];
                const Icon = meta.icon;
                const href = `/bookings/${row.bookingId}`;
                return (
                  <tr
                    key={row.key}
                    data-row=""
                    tabIndex={0}
                    onClick={event => { if (!(event.target as HTMLElement).closest("a,button")) router.push(href); }}
                    onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); router.push(`${href}${meta.query}`); } }}
                    className="cursor-pointer hover:bg-[#FAFCFF] focus:bg-[#EFF8FF] focus:outline-2 focus:-outline-offset-2 focus:outline-[#006FE6]"
                  >
                    <td className="px-3 py-1.5"><span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${meta.tone}`}><Icon size={13} aria-hidden />{meta.label}</span></td>
                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-[#344054]">{row.kind === "payment" ? "—" : timeFormat.format(new Date(row.time))}</td>
                    <td className="whitespace-nowrap px-3 py-1.5"><span className="font-semibold" title={row.reference || undefined}>{row.customer}</span></td>
                    <td className="hidden px-3 py-1.5 md:table-cell"><span className="block max-w-[160px] truncate text-[#344054]" title={`${row.vehicle} ${row.plate}`}>{row.vehicle} <span className="font-mono text-xs text-[#475467]">{row.plate}</span></span></td>
                    <td className={`hidden whitespace-nowrap px-3 py-1.5 text-right tabular-nums md:table-cell ${row.balance > 0 ? "font-semibold text-[#B54708]" : "text-[#667085]"}`}>{row.balance > 0 ? formatPkr(row.balance) : "Paid"}</td>
                    <td className="px-3 py-1.5 text-right"><span className="inline-flex gap-1.5">{row.kind === "missed-pickup" && <Link href={`${href}?action=cancel`} tabIndex={-1} className="inline-flex h-8 items-center whitespace-nowrap rounded-[8px] border border-[#FDA29B] bg-white px-3 text-[13px] font-semibold text-[#B42318] hover:bg-[#FEF3F2]">Cancel</Link>}<Link href={`${href}${meta.query}`} tabIndex={-1} className="inline-flex h-8 items-center whitespace-nowrap rounded-[8px] border border-[#D0D5DD] bg-white px-3 text-[13px] font-semibold text-[#344054] hover:bg-[#F8FAFC]">{meta.action}</Link></span></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        ) : (
          <p className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-[#475467]"><CheckCircle2 size={18} className="text-[#067647]" aria-hidden />{filter === "all" ? "Nothing scheduled for the rest of today." : "Nothing here right now."}</p>
        )}
        {visible.length > 0 && <p className="border-t border-[#EAECF0] px-3 py-1.5 text-xs text-[#475467]">↑ ↓ to move · Enter to {filter === "payment" ? "record payment" : "open the action"} · click a row to view the booking</p>}
      </section>
    </div>
  );
}
