"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Link2, ShieldCheck, Unlink, UserRound } from "lucide-react";
import { linkCustomerGuarantorAction, unlinkCustomerGuarantorAction } from "@/app/actions/guarantors";
import { listCustomersAction } from "@/app/actions/customers";
import { DetailPanel } from "@/components/shared/detail-layout";
import { PersonDocuments } from "@/components/shared/person-documents";
import { StatusBadge } from "@/components/shared/status-badge";
import { Toast } from "@/components/shared/toast";
import { Button } from "@/components/ui/button";
import { formatInZone } from "@/lib/timezone";
import { formatPhone, formatPkr } from "@/lib/utils";
import type { GuarantorDetailDto } from "@/server/services/guarantor-service";

const formatCnic = (value: string) => value.length === 13 ? `${value.slice(0, 5)}-${value.slice(5, 12)}-${value.slice(12)}` : value || "Not provided";
const formatDay = (value: string) => formatInZone(value, { day: "2-digit", month: "short", year: "numeric" });
const displayStatus = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());

/** One guarantor: details, CNIC and license images, the customers they back, and the bookings they guaranteed. */
export function GuarantorProfile({ guarantor }: { guarantor: GuarantorDetailDto }) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; phone: string; cnic: string }>>();
  const [query, setQuery] = useState("");

  async function startPicking() {
    setPicking(true);
    if (customers) return;
    const result = await listCustomersAction();
    if (result.ok) setCustomers(result.data); else { setNotice(result.error.message); setCustomers([]); }
  }

  async function link(customerId: string, name: string) {
    setBusy(true);
    const result = await linkCustomerGuarantorAction(customerId, guarantor.id);
    setBusy(false);
    if (!result.ok) { setNotice(result.error.message); return; }
    setNotice(`${guarantor.name} now backs ${name}.`); setPicking(false); setQuery(""); router.refresh();
  }

  async function unlink(customerId: string, name: string) {
    setBusy(true);
    const result = await unlinkCustomerGuarantorAction(customerId, guarantor.id);
    setBusy(false);
    if (!result.ok) { setNotice(result.error.message); return; }
    setNotice(`${name} unlinked.`); router.refresh();
  }

  const linked = new Set(guarantor.customers.map(item => item.id));
  const search = query.trim().toLowerCase(), digits = query.replace(/\D/g, "");
  const matches = (customers ?? [])
    .filter(item => !linked.has(item.id) && item.cnic.replace(/\D/g, "") !== guarantor.cnic)
    .filter(item => !search || item.name.toLowerCase().includes(search) || (digits.length > 2 && `${item.phone}${item.cnic}`.replace(/\D/g, "").includes(digits)))
    .slice(0, 8);

  return <div className="space-y-6">
    <Toast message={notice} onDismiss={() => setNotice("")} />
    <Link href="/guarantors" className="inline-flex items-center gap-2 text-sm font-semibold text-[#475467]"><ArrowLeft size={17} />Guarantors</Link>
    <section className="flex flex-col gap-4 rounded-xl border border-[#E8ECF2] bg-white p-5 sm:flex-row sm:items-center">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#EFF8FF] text-[#006FE6]"><ShieldCheck size={22} /></span>
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold">{guarantor.name}</h1>
        <p className="mt-1 text-sm text-[#475467]">{[guarantor.phone && formatPhone(guarantor.phone), guarantor.cnic && `CNIC ${formatCnic(guarantor.cnic)}`].filter(Boolean).join(" · ") || "No contact details"}</p>
      </div>
      {guarantor.customerId && <Button asChild variant="secondary"><Link href={`/customers/${guarantor.customerId}`}><UserRound size={16} />Also a customer — open profile</Link></Button>}
    </section>
    <div className="grid gap-5 lg:grid-cols-2">
      <DetailPanel title="Guarantor information">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <Fact label="Parentage" value={guarantor.parentage || "Not provided"} />
          <Fact label="CNIC" value={formatCnic(guarantor.cnic)} />
          <Fact label="Driving license" value={guarantor.licenseNumber || "Not provided"} />
          <Fact label="License expiry" value={guarantor.licenseExpiresAt ? formatDay(guarantor.licenseExpiresAt) : "Not provided"} />
          <Fact label="Car amount" value={guarantor.carAmount ? formatPkr(guarantor.carAmount) : "Not provided"} />
          <Fact label="Address" value={guarantor.address || "Not provided"} />
        </dl>
        <p className="mt-4 text-xs text-[#667085]">Edit these details from the Guarantors list.</p>
      </DetailPanel>
      <DetailPanel title="CNIC &amp; driving license images"><PersonDocuments owner="guarantor" ownerId={guarantor.id} /></DetailPanel>
    </div>
    <DetailPanel title={`Customers backed (${guarantor.customers.length})`} action={<Button size="sm" variant="secondary" onClick={() => picking ? setPicking(false) : void startPicking()}><Link2 size={15} />{picking ? "Close" : "Link customer"}</Button>}>
      {picking && <div className="mb-4 rounded-[10px] border border-[#B2DDFF] bg-[#F5FAFF] p-3">
        <label className="text-xs font-semibold text-[#344054]">Find a customer
          <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, phone or CNIC" className="mt-1 block h-10 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-sm" />
        </label>
        {!customers ? <p className="mt-2 text-sm text-[#667085]">Loading…</p> : matches.length ? <ul className="mt-2 divide-y rounded-lg border bg-white">{matches.map(item => <li key={item.id}><button type="button" disabled={busy} onClick={() => void link(item.id, item.name)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-[#F8FAFC] disabled:opacity-60"><UserRound size={16} className="text-[#667085]" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.name}</strong><span className="block truncate text-xs text-[#667085]">{[item.phone && formatPhone(item.phone), item.cnic].filter(Boolean).join(" · ")}</span></span></button></li>)}</ul> : <p className="mt-2 text-sm text-[#667085]">No matching customer.</p>}
      </div>}
      {guarantor.customers.length ? <ul className="divide-y">{guarantor.customers.map(item => <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <Link href={`/customers/${item.id}`} className="font-semibold text-[#006FE6] hover:underline">{item.name}</Link>
          <p className="text-xs text-[#667085]">{[item.phone && formatPhone(item.phone), item.cnic].filter(Boolean).join(" · ")}</p>
        </div>
        <span className="text-xs text-[#475467]">{item.linked ? "Saved link" : "Via booking"}{item.bookingCount ? ` · ${item.bookingCount} booking${item.bookingCount === 1 ? "" : "s"}` : ""}</span>
        {item.linked && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void unlink(item.id, item.name)} aria-label={`Unlink ${item.name}`}><Unlink size={15} /></Button>}
      </li>)}</ul> : <p className="text-sm text-[#667085]">Not linked to any customer yet.</p>}
    </DetailPanel>
    <DetailPanel title={`Bookings guaranteed (${guarantor.bookings.length})`}>
      {guarantor.bookings.length ? <ul className="divide-y">{guarantor.bookings.map(item => <li key={item.id}><Link href={`/bookings/${item.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:bg-[#F8FAFC]">
        <strong className="text-sm text-[#006FE6]">#{item.publicNumber ?? item.id}</strong>
        <span className="min-w-0 flex-1 text-sm"><span className="font-semibold">{item.customerName}</span><span className="block text-xs text-[#667085]">{item.vehicle} · {formatDay(item.pickupAt)} – {formatDay(item.returnAt)}</span></span>
        <StatusBadge status={displayStatus(item.status)} />
      </Link></li>)}</ul> : <p className="text-sm text-[#667085]">No bookings use this guarantor yet.</p>}
    </DetailPanel>
  </div>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-[#667085]">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>; }
