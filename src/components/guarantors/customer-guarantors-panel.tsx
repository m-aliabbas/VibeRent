"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, Link2, ShieldCheck, Unlink, UserRound } from "lucide-react";
import { guarantorFromCustomerAction, linkCustomerGuarantorAction, listGuarantorsAction, unlinkCustomerGuarantorAction } from "@/app/actions/guarantors";
import { listCustomersAction } from "@/app/actions/customers";
import { DetailPanel } from "@/components/shared/detail-layout";
import { PersonDocuments } from "@/components/shared/person-documents";
import { Button } from "@/components/ui/button";
import { formatPhone } from "@/lib/utils";
import type { CustomerGuarantorDto, GuarantorDetailDto, GuarantorDto } from "@/server/services/guarantor-service";

type Candidate = { key: string; kind: "guarantor" | "customer"; id: string; name: string; detail: string };

const formatCnic = (value: string) => value.length === 13 ? `${value.slice(0, 5)}-${value.slice(5, 12)}-${value.slice(12)}` : value;

/**
 * Guarantors backing this customer (saved links and the guarantors of their bookings), with each
 * guarantor's CNIC and license images, plus the customers this customer guarantees when they are a guarantor too.
 */
export function CustomerGuarantorsPanel({ customerId, customerCnic, initial, asGuarantor }: { customerId: string; customerCnic: string; initial: CustomerGuarantorDto[]; asGuarantor: GuarantorDetailDto | null }) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState<string>();
  const [picking, setPicking] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const ownCnic = customerCnic.replace(/\D/g, "");

  async function startPicking() {
    setPicking(true); setMessage("");
    if (candidates) return;
    const [guarantors, customers] = await Promise.all([listGuarantorsAction(), listCustomersAction()]);
    const saved: GuarantorDto[] = guarantors.ok ? guarantors.data : [];
    const savedCnics = new Set(saved.map(item => item.cnic).filter(Boolean));
    setCandidates([
      ...saved.filter(item => item.cnic !== ownCnic).map(item => ({ key: `g-${item.id}`, kind: "guarantor" as const, id: item.id, name: item.name, detail: [item.phone && formatPhone(item.phone), item.cnic && formatCnic(item.cnic)].filter(Boolean).join(" · ") || "Saved guarantor" })),
      // Customers who are not yet saved guarantors can be used as one; their details are copied.
      ...(customers.ok ? customers.data : []).filter(item => item.id !== customerId && !savedCnics.has(item.cnic.replace(/\D/g, ""))).map(item => ({ key: `c-${item.id}`, kind: "customer" as const, id: item.id, name: item.name, detail: `Customer · ${[item.phone && formatPhone(item.phone), item.cnic].filter(Boolean).join(" · ")}` })),
    ]);
    if (!guarantors.ok) setMessage(guarantors.error.message);
  }

  async function choose(candidate: Candidate) {
    setBusy(true); setMessage("");
    let guarantorId = candidate.id;
    if (candidate.kind === "customer") {
      const created = await guarantorFromCustomerAction(candidate.id);
      if (!created.ok) { setBusy(false); setMessage(created.error.message); return; }
      guarantorId = created.data.id;
    }
    const result = await linkCustomerGuarantorAction(customerId, guarantorId);
    setBusy(false);
    if (!result.ok) { setMessage(result.error.message); return; }
    setItems(result.data); setPicking(false); setQuery(""); setCandidates(undefined); setMessage(`${candidate.name} linked as a guarantor.`);
  }

  async function unlink(item: CustomerGuarantorDto) {
    setBusy(true); setMessage("");
    const result = await unlinkCustomerGuarantorAction(customerId, item.id);
    setBusy(false);
    if (!result.ok) { setMessage(result.error.message); return; }
    setItems(result.data); setMessage(item.bookingCount ? `${item.name} unlinked. Bookings that used them keep the guarantor.` : `${item.name} unlinked.`);
  }

  const linkedIds = useMemo(() => new Set(items.map(item => item.id)), [items]);
  const search = query.trim().toLowerCase(), digits = query.replace(/\D/g, "");
  const matches = (candidates ?? []).filter(item => !(item.kind === "guarantor" && linkedIds.has(item.id)))
    .filter(item => !search || item.name.toLowerCase().includes(search) || (digits.length > 2 && item.detail.replace(/\D/g, "").includes(digits)))
    .slice(0, 8);

  return <DetailPanel title="Guarantors" action={<Button size="sm" variant="secondary" onClick={() => picking ? setPicking(false) : void startPicking()}><Link2 size={15} />{picking ? "Close" : "Link guarantor"}</Button>}>
    {message && <p role="status" className="mb-3 rounded-lg bg-[#F8FAFC] p-2.5 text-sm text-[#344054]">{message}</p>}
    {picking && <div className="mb-4 rounded-[10px] border border-[#B2DDFF] bg-[#F5FAFF] p-3">
      <label className="text-xs font-semibold text-[#344054]">Find a saved guarantor or a customer
        <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, phone or CNIC" className="mt-1 block h-10 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-sm" />
      </label>
      {!candidates ? <p className="mt-2 text-sm text-[#667085]">Loading…</p> : matches.length ? <ul className="mt-2 divide-y rounded-lg border bg-white">{matches.map(item => <li key={item.key}><button type="button" disabled={busy} onClick={() => void choose(item)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-[#F8FAFC] disabled:opacity-60">
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${item.kind === "guarantor" ? "bg-[#EFF8FF] text-[#006FE6]" : "bg-[#F4F3FF] text-[#5925DC]"}`}>{item.kind === "guarantor" ? <ShieldCheck size={16} /> : <UserRound size={16} />}</span>
        <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.name}</strong><span className="block truncate text-xs text-[#667085]">{item.detail}</span></span>
      </button></li>)}</ul> : <p className="mt-2 text-sm text-[#667085]">No match. Add new guarantors on the Guarantors page or while booking.</p>}
    </div>}
    {items.length ? <ul className="space-y-3">{items.map(item => <li key={item.id} className="rounded-[10px] border border-[#EAECF0]">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]"><ShieldCheck size={17} /></span>
        <div className="min-w-0 flex-1">
          <Link href={`/guarantors/${item.id}`} className="font-semibold text-[#006FE6] hover:underline">{item.name}</Link>
          <p className="text-xs text-[#667085]">{[item.phone && formatPhone(item.phone), item.cnic && `CNIC ${formatCnic(item.cnic)}`, item.licenseNumber && `License ${item.licenseNumber}`].filter(Boolean).join(" · ") || "No contact details"}</p>
          <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
            {item.linked && <span className="rounded-full bg-[#ECFDF3] px-2 py-0.5 font-semibold text-[#067647]">Saved link</span>}
            {item.bookingCount > 0 && <span className="rounded-full bg-[#F2F4F7] px-2 py-0.5 font-semibold text-[#344054]">{item.bookingCount} booking{item.bookingCount === 1 ? "" : "s"}</span>}
            {item.customerId && <Link href={`/customers/${item.customerId}`} className="rounded-full bg-[#F4F3FF] px-2 py-0.5 font-semibold text-[#5925DC] hover:underline">Also a customer</Link>}
          </p>
        </div>
        <Button size="sm" variant="ghost" aria-expanded={open === item.id} onClick={() => setOpen(current => current === item.id ? undefined : item.id)}>Documents<ChevronDown size={15} className={open === item.id ? "rotate-180" : ""} /></Button>
        {item.linked && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void unlink(item)} aria-label={`Unlink ${item.name}`}><Unlink size={15} /></Button>}
      </div>
      {open === item.id && <div className="border-t border-[#EAECF0] p-3"><PersonDocuments owner="guarantor" ownerId={item.id} compact /></div>}
    </li>)}</ul> : <p className="text-sm text-[#667085]">No guarantor is linked to this customer yet. Link one here, or add a guarantor while booking.</p>}
    {asGuarantor && asGuarantor.customers.some(item => item.id !== customerId) && <div className="mt-5 border-t border-[#EAECF0] pt-4">
      <h3 className="text-sm font-bold">Also a guarantor for</h3>
      <p className="mb-2 mt-0.5 text-xs text-[#667085]">This customer is saved as <Link href={`/guarantors/${asGuarantor.id}`} className="font-semibold text-[#006FE6]">a guarantor</Link> for these customers.</p>
      <ul className="flex flex-wrap gap-2">{asGuarantor.customers.filter(item => item.id !== customerId).map(item => <li key={item.id}><Link href={`/customers/${item.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-[#D0D5DD] px-3 py-1 text-sm font-semibold hover:bg-[#F8FAFC]"><UserRound size={14} />{item.name}</Link></li>)}</ul>
    </div>}
  </DetailPanel>;
}
