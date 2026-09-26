"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DataColumn<T> = {
  key: string;
  header: string;
  sortable?: boolean;
  value?: (row: T) => string | number;
  cell: (row: T) => ReactNode;
  mobileLabel?: string;
  className?: string;
};

export function DataTable<T>({ rows, columns, rowKey, sort, onSort, page, pageSize, total, onPageChange, mobileCard, empty }: {
  rows: T[]; columns: DataColumn<T>[]; rowKey: (row: T) => string;
  sort?: { key: string; direction: "asc" | "desc" }; onSort?: (key: string) => void;
  page: number; pageSize: number; total: number; onPageChange: (page: number) => void;
  mobileCard: (row: T) => ReactNode; empty: ReactNode;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (!total) return <>{empty}</>;
  return <>
    <div className="hidden overflow-hidden rounded-xl border border-[#E4E7EC] bg-white md:block">
      <table className="w-full border-collapse text-left"><thead><tr className="border-b border-[#E4E7EC] bg-[#F8FAFC]">{columns.map((col) => <th key={col.key} className={`px-4 py-3 text-[11px] font-bold uppercase tracking-[.06em] text-[#667085] ${col.className ?? ""}`}>{col.sortable ? <button className="inline-flex items-center gap-1 hover:text-[#344054]" onClick={() => onSort?.(col.key)}>{col.header}{sort?.key === col.key ? (sort.direction === "asc" ? <ArrowUp size={13}/> : <ArrowDown size={13}/>) : <ArrowUpDown size={13}/>}</button> : col.header}</th>)}</tr></thead><tbody className="divide-y divide-[#EAECF0]">{rows.map((row) => <tr key={rowKey(row)} className="transition-colors hover:bg-[#FAFCFF]">{columns.map((col) => <td key={col.key} className={`px-4 py-4 text-sm ${col.className ?? ""}`}>{col.cell(row)}</td>)}</tr>)}</tbody></table>
    </div>
    <div className="space-y-3 md:hidden">{rows.map((row) => <div key={rowKey(row)} className="rounded-xl border border-[#E4E7EC] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,.03)]">{mobileCard(row)}</div>)}</div>
    <div className="flex items-center justify-between pt-4"><p className="text-xs text-[#667085]">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</p><div className="flex items-center gap-2"><Button variant="secondary" size="icon" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page"><ChevronLeft size={17}/></Button><span className="hidden text-xs font-semibold text-[#475467] sm:block">Page {page} of {pages}</span><Button variant="secondary" size="icon" onClick={() => onPageChange(page + 1)} disabled={page >= pages} aria-label="Next page"><ChevronRight size={17}/></Button></div></div>
  </>;
}
