"use client";

import type { ReactNode } from "react";
import type React from "react";
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

export function DataTable<T>({ rows, columns, rowKey, sort, onSort, page, pageSize, total, onPageChange, mobileCard, empty, onRowClick }: {
  rows: T[]; columns: DataColumn<T>[]; rowKey: (row: T) => string;
  sort?: { key: string; direction: "asc" | "desc" }; onSort?: (key: string) => void;
  page: number; pageSize: number; total: number; onPageChange: (page: number) => void;
  mobileCard: (row: T) => ReactNode; empty: ReactNode; onRowClick?: (row:T)=>void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (!total) return <>{empty}</>;
  return <>
    <div className="hidden rounded-[8px] border border-[#D0D5DD] bg-white md:block">
      <table className="w-full border-separate border-spacing-0 text-left text-[13px]">
        <thead><tr>{columns.map((col) => <th key={col.key} scope="col" className={`sticky top-[72px] z-[1] h-9 border-b border-r border-[#D0D5DD] bg-[#F2F4F7] px-3 font-semibold text-[#344054] first:rounded-tl-[8px] last:rounded-tr-[8px] last:border-r-0 ${col.className ?? ""}`}>{col.sortable ? <button className="inline-flex items-center gap-1 hover:text-[#19191F]" onClick={() => onSort?.(col.key)} aria-label={`Sort by ${col.header}`}>{col.header}{sort?.key === col.key ? (sort.direction === "asc" ? <ArrowUp size={13}/> : <ArrowDown size={13}/>) : <ArrowUpDown size={13} className="text-[#98A2B3]"/>}</button> : col.header}</th>)}</tr></thead>
        <tbody onKeyDown={moveRowFocus}>{rows.map((row) => <tr key={rowKey(row)} data-row={onRowClick?"":undefined} tabIndex={onRowClick?0:undefined} onClick={event=>{if(onRowClick&&!((event.target as HTMLElement).closest("a,button,input,select")))onRowClick(row)}} onKeyDown={event=>{if(onRowClick&&(event.key==="Enter"||event.key===" ")){event.preventDefault();onRowClick(row)}}} className={`group h-9 even:bg-[#FAFBFC] hover:bg-[#EEF4FF] ${onRowClick?"cursor-pointer focus:bg-[#EAF3FF] focus:outline-2 focus:-outline-offset-2 focus:outline-[#006FE6]":""}`}>{columns.map((col) => <td key={col.key} className={`border-b border-r border-[#EAECF0] px-3 py-1 align-middle last:border-r-0 group-last:border-b-0 ${col.className ?? ""}`}>{col.cell(row)}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <div className="space-y-3 md:hidden">{rows.map((row) => <div key={rowKey(row)} className="rounded-xl border border-[#E4E7EC] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,.03)]">{mobileCard(row)}</div>)}</div>
    {pages > 1 && <div className="flex items-center justify-between pt-2"><p className="text-xs text-[#475467]">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</p><div className="flex items-center gap-2"><Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page"><ChevronLeft size={17}/></Button><span className="hidden text-xs font-semibold text-[#475467] sm:block">Page {page} of {pages}</span><Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => onPageChange(page + 1)} disabled={page >= pages} aria-label="Next page"><ChevronRight size={17}/></Button></div></div>}
  </>;
}

/** ↓/J and ↑/K move between focusable rows; Enter opens (handled on the row). */
export function moveRowFocus(event: React.KeyboardEvent<HTMLElement>) {
  const keys: Record<string, number> = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 };
  const step = keys[event.key];
  if (!step || event.metaKey || event.ctrlKey || event.altKey) return;
  const row = (event.target as HTMLElement).closest<HTMLElement>("[data-row]");
  if (!row) return;
  const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-row]"));
  const next = rows[rows.indexOf(row) + step];
  if (next) { event.preventDefault(); next.focus(); }
}
