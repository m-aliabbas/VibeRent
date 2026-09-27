"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Pencil, Plus, UserRound, X } from "lucide-react";
import { createCustomerAction, listCustomersAction, updateCustomerAction } from "@/app/actions/customers";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterSelect } from "@/components/shared/filter-bar";
import { InlineError } from "@/components/shared/inline-error";
import { LoadingState } from "@/components/shared/loading-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Toast } from "@/components/shared/toast";
import { Button } from "@/components/ui/button";

type CustomerRecord = {
  id: string; name: string; phone: string; cnic: string; email: string | null;
  licenseNumber: string | null; licenseExpiresAt: string | null; status: string;
  version: number; updatedAt: string;
};

const displayStatus = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());

export function CustomersModule() {
  const [items, setItems] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [editing, setEditing] = useState<CustomerRecord>();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [now] = useState(() => Date.now());

  async function load() {
    setLoading(true); setLoadError("");
    const result = await listCustomersAction();
    if (result.ok) setItems(result.data);
    else setLoadError(result.error.message);
    setLoading(false);
  }
  useEffect(() => {
    let active = true;
    void listCustomersAction().then(result => {
      if (!active) return;
      if (result.ok) setItems(result.data);
      else setLoadError(result.error.message);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const rows = useMemo(() => items.filter(item => {
    const term = search.trim().toLowerCase();
    return (status === "All" || displayStatus(item.status) === status) && (!term || `${item.name} ${item.phone} ${item.cnic} ${item.email ?? ""}`.toLowerCase().includes(term));
  }), [items, search, status]);
  const metrics = [
    ["Customers", String(items.length)],
    ["Preferred", String(items.filter(item => item.status === "preferred").length)],
    ["Needs review", String(items.filter(item => ["review", "blacklisted"].includes(item.status)).length)],
    ["Updated recently", String(items.filter(item => now - Date.parse(item.updatedAt) < 30 * 86_400_000).length)],
  ];

  return <div className="space-y-6">
    <Toast message={notice} onDismiss={() => setNotice("")} />
    <PageHeader eyebrow="Customer records" title="Customers" description="Manage renter identity, contact details, rental history, and operational warnings." actions={<Button onClick={() => { setEditing(undefined); setOpen(true); }}><Plus size={17}/>Add customer</Button>} />
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">{metrics.map(([label,value]) => <div key={label} className="rounded-xl border border-[#E8ECF2] bg-white p-4"><p className="text-xs text-[#667085]">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></div>)}</section>
    <FilterBar search={search} onSearch={setSearch} placeholder="Search name, phone or CNIC…" hasFilters={Boolean(search || status !== "All")} onClear={() => { setSearch(""); setStatus("All"); }}><FilterSelect label="Status" value={status} onChange={setStatus} options={["Active", "Preferred", "Review", "Blacklisted"]}/></FilterBar>
    {loading ? <LoadingState rows={4}/> : loadError ? <InlineError message={loadError} onRetry={() => void load()}/> : rows.length === 0 ? <EmptyState filtered={Boolean(search || status !== "All")}/> : <div className="overflow-hidden rounded-xl border border-[#E4E7EC] bg-white"><div className="divide-y divide-[#EAECF0]">{rows.map(item => <article key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]"><UserRound size={18}/></span><div className="min-w-0 flex-1"><Link href={`/customers/${item.id}`} className="text-sm font-bold hover:text-[#006FE6]">{item.name}</Link><p className="mt-1 truncate text-xs text-[#667085]">{item.phone} · {item.cnic}{item.email ? ` · ${item.email}` : ""}</p></div><div className="flex items-center gap-2"><StatusBadge status={displayStatus(item.status)}/><Button size="sm" variant="ghost" onClick={() => { setEditing(item); setOpen(true); }}><Pencil size={15}/>Edit</Button><Button asChild size="sm" variant="secondary"><Link href={`/customers/${item.id}`}>View</Link></Button></div></article>)}</div></div>}
    {open && <CustomerDialog
      record={editing}
      onOpenChange={(next) => { setOpen(next); if (!next) setEditing(undefined); }}
      onSaved={(saved) => { setItems(current => current.some(item => item.id === saved.id) ? current.map(item => item.id === saved.id ? saved : item) : [saved, ...current]); setNotice(`${saved.name} ${editing ? "updated" : "added"}.`); setOpen(false); setEditing(undefined); }}
    />}
  </div>;
}

function CustomerDialog({ record, onOpenChange, onSaved }: { record?: CustomerRecord; onOpenChange: (open: boolean) => void; onSaved: (item: CustomerRecord) => void }) {
  const [form, setForm] = useState({ name: record?.name ?? "", phone: record?.phone ?? "", cnic: record?.cnic ?? "", email: record?.email ?? "", licenseNumber: record?.licenseNumber ?? "", licenseExpiresAt: record?.licenseExpiresAt ?? "", status: displayStatus(record?.status ?? "active") });
  const [errors, setErrors] = useState<Record<string,string>>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setMessage(""); setErrors({});
    const input = { ...form, email: form.email || undefined, licenseNumber: form.licenseNumber || undefined, licenseExpiresAt: form.licenseExpiresAt || undefined };
    const result = record ? await updateCustomerAction(record.id, input) : await createCustomerAction(input);
    setPending(false);
    if (!result.ok) { setMessage(result.error.message); setErrors(result.error.fieldErrors); return; }
    onSaved(result.data);
  }
  return <Dialog.Root open onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45"/><Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[calc(100%-32px)] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"><div className="flex justify-between border-b border-[#EAECF0] p-5"><div><Dialog.Title className="font-bold">{record ? "Edit customer" : "Add customer"}</Dialog.Title><Dialog.Description className="mt-1 text-xs text-[#667085]">Saved securely to this agency’s customer records.</Dialog.Description></div><Dialog.Close className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#F2F4F7]"><X size={18}/><span className="sr-only">Close customer form</span></Dialog.Close></div><form onSubmit={submit}><div className="grid gap-4 p-5 sm:grid-cols-2"><FormInput label="Full name" value={form.name} onChange={e => setForm({...form,name:e.target.value})} error={errors.name} required/><FormInput label="Phone" value={form.phone} onChange={e => setForm({...form,phone:e.target.value})} error={errors.phone} required/><FormInput label="CNIC" value={form.cnic} onChange={e => setForm({...form,cnic:e.target.value})} error={errors.cnic} readOnly={Boolean(record)} required/><FormInput label="Email" type="email" value={form.email} onChange={e => setForm({...form,email:e.target.value})} error={errors.email}/><FormInput label="License number" value={form.licenseNumber} onChange={e => setForm({...form,licenseNumber:e.target.value})}/><FormInput label="License expiry" type="date" value={form.licenseExpiresAt} onChange={e => setForm({...form,licenseExpiresAt:e.target.value})} error={errors.licenseExpiresAt}/>{record && <FormSelect label="Status" value={form.status} onChange={e => setForm({...form,status:e.target.value})} options={["Active","Preferred","Review","Blacklisted"]}/>} {message && <div role="alert" className="rounded-lg border border-[#FECDCA] bg-[#FEF3F2] p-3 text-sm text-[#B42318] sm:col-span-2">{message}</div>}</div><div className="flex justify-end gap-2 border-t border-[#EAECF0] p-4"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={pending}>{pending ? "Saving…" : "Save customer"}</Button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
