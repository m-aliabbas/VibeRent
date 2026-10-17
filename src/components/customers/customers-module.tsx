"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2, UserRound, X } from "lucide-react";
import { archiveCustomerAction, createCustomerAction, getCustomerCnicAction, listCustomersAction, startCustomerCnicDraftAction, updateCustomerAction, uploadCustomerCnicAction } from "@/app/actions/customers";
import { CnicDocumentDrawer } from "@/components/customers/cnic-document-drawer";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterSelect } from "@/components/shared/filter-bar";
import { InlineError } from "@/components/shared/inline-error";
import { LoadingState } from "@/components/shared/loading-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Toast } from "@/components/shared/toast";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { cnicExtractionKey, mergeCnicExtraction, type CnicExtractedValues, type CnicIntake } from "@/lib/cnic-intake";
import { formatPkr } from "@/lib/utils";
import type { CustomerCnicTarget } from "@/server/services/customer-cnic-service";

type CustomerRecord = {
  id: string; name: string; fatherName: string | null; phone: string; cnic: string; email: string | null;
  dateOfBirth: string | null; address: string | null; cnicExpiresAt: string | null;
  licenseNumber: string | null; licenseExpiresAt: string | null; status: string;
  version: number; updatedAt: string; bookingCount: number; paidAmount: number; outstanding: number;
};

const displayStatus = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());

export function CustomersModule() {
  const [items, setItems] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [license, setLicense] = useState("All");
  const [payment, setPayment] = useState("All");
  const [editing, setEditing] = useState<CustomerRecord>();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [removing, setRemoving] = useState<CustomerRecord>();
  const [removingPending, setRemovingPending] = useState(false);
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
    const expiry=item.licenseExpiresAt?Date.parse(`${item.licenseExpiresAt}T23:59:59`):NaN;
    const licenseMatch=license==="All"||(license==="No license"&&!item.licenseNumber)||(license==="Expired"&&Number.isFinite(expiry)&&expiry<now)||(license==="Expiring soon"&&Number.isFinite(expiry)&&expiry>=now&&expiry<now+30*86_400_000);
    const statusMatch=status === "All" || (status==="Needs review"?["review","blacklisted"].includes(item.status):status==="Updated recently"?now-Date.parse(item.updatedAt)<30*86_400_000:displayStatus(item.status) === status);
    const paymentMatch=payment==="All"||(payment==="Outstanding"&&item.outstanding>0)||(payment==="Paid"&&item.bookingCount>0&&item.outstanding===0)||(payment==="No rentals"&&item.bookingCount===0);
    return statusMatch && licenseMatch && paymentMatch && (!term || `${item.name} ${item.fatherName ?? ""} ${item.phone} ${item.cnic} ${item.email ?? ""}`.toLowerCase().includes(term));
  }), [items, search, status, license, payment, now]);
  const metrics = [
    ["Customers", String(items.length)],
    ["Preferred", String(items.filter(item => item.status === "preferred").length)],
    ["Needs review", String(items.filter(item => ["review", "blacklisted"].includes(item.status)).length)],
    ["Updated recently", String(items.filter(item => now - Date.parse(item.updatedAt) < 30 * 86_400_000).length)],
  ];
  const paymentFilters = [
    { value: "All", label: "All", detail: `${items.length} customers` },
    { value: "Paid", label: "Paid", detail: formatPkr(items.filter(item => item.bookingCount > 0 && item.outstanding === 0).reduce((sum,item) => sum + item.paidAmount, 0)) },
    { value: "Outstanding", label: "Outstanding", detail: formatPkr(items.reduce((sum,item) => sum + item.outstanding, 0)) },
    { value: "No rentals", label: "No rentals", detail: `${items.filter(item => item.bookingCount === 0).length} customers` },
  ];

  async function removeCustomer() {
    if(!removing)return;
    setRemovingPending(true);
    const result=await archiveCustomerAction(removing.id);
    setRemovingPending(false);
    if(!result.ok){setNotice(result.error.message);return;}
    setItems(current=>current.filter(item=>item.id!==removing.id));
    setNotice(`${removing.name} deleted from active customer records.`);
    setRemoving(undefined);
  }

  return <div className="space-y-6">
    <Toast message={notice} onDismiss={() => setNotice("")} />
    <PageHeader eyebrow="Customer records" title="Customers" description="Manage renter identity, contact details, rental history, and operational warnings." actions={<Button onClick={() => { setEditing(undefined); setOpen(true); }}><Plus size={17}/>Add customer</Button>} />
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">{metrics.map(([label,value]) => <button type="button" key={label} onClick={()=>{setLicense("All");setPayment("All");setStatus(label==="Customers"?"All":label)}} className="rounded-xl border border-[#E8ECF2] bg-white p-4 text-left transition hover:border-[#84CAFF]"><p className="text-xs text-[#667085]">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></button>)}</section>
    <section className="flex items-center gap-2 overflow-x-auto rounded-xl border border-[#E4E7EC] bg-white p-3" aria-label="Payment status filter">
      <span className="shrink-0 px-1 text-xs font-semibold uppercase tracking-[.08em] text-[#667085]">Payment</span>
      {paymentFilters.map(option => <Button key={option.value} type="button" size="sm" variant={payment===option.value?"primary":"secondary"} className="h-auto shrink-0 gap-2 py-2" aria-pressed={payment===option.value} onClick={()=>setPayment(option.value)}><span>{option.label}</span><span className={payment===option.value?"text-white/80":"text-[#667085]"}>{option.detail}</span></Button>)}
    </section>
    <FilterBar search={search} onSearch={setSearch} placeholder="Search name, phone or CNIC…" hasFilters={Boolean(search || status !== "All" || license!=="All" || payment!=="All")} onClear={() => { setSearch(""); setStatus("All"); setLicense("All"); setPayment("All"); }}><FilterSelect label="Status" value={status} onChange={setStatus} options={["Active", "Preferred", "Needs review", "Updated recently", "Review", "Blacklisted"]}/><FilterSelect label="License" value={license} onChange={setLicense} options={["Expiring soon","Expired","No license"]}/></FilterBar>
    {loading ? <LoadingState rows={4}/> : loadError ? <InlineError message={loadError} onRetry={() => void load()}/> : rows.length === 0 ? <EmptyState filtered={Boolean(search || status !== "All" || license!=="All" || payment!=="All")}/> : <div className="overflow-hidden rounded-xl border border-[#E4E7EC] bg-white"><div className="divide-y divide-[#EAECF0]">{rows.map(item => { const paymentStatus=item.bookingCount===0?"No rentals":item.outstanding>0?"Outstanding":"Paid"; const paymentAmount=paymentStatus==="Outstanding"?`${formatPkr(item.outstanding)} due`:paymentStatus==="Paid"?`${formatPkr(item.paidAmount)} paid`:"No amount"; return <article key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]"><UserRound size={18}/></span><div className="min-w-0 flex-1"><Link href={`/customers/${item.id}`} className="text-sm font-bold hover:text-[#006FE6]">{item.name}</Link><p className="mt-1 text-xs text-[#667085]">{item.phone} · <span className="font-mono">{item.cnic}</span>{item.email ? ` · ${item.email}` : ""}</p></div><div className="flex min-w-[130px] items-center gap-2 sm:flex-col sm:items-end sm:gap-1"><StatusBadge status={paymentStatus}/><span className="text-xs font-semibold text-[#475467]">{paymentAmount}</span></div><div className="flex items-center gap-2"><StatusBadge status={displayStatus(item.status)}/><Button size="sm" variant="ghost" onClick={() => { setEditing(item); setOpen(true); }}><Pencil size={15}/>Edit</Button><Button asChild size="sm" variant="secondary"><Link href={`/customers/${item.id}`}>View</Link></Button><Button size="sm" variant="ghost" aria-label={`Delete ${item.name}`} onClick={()=>setRemoving(item)}><Trash2 size={15}/>Delete</Button></div></article> })}</div></div>}
    {open && <CustomerDialog
      record={editing}
      onOpenChange={(next) => { setOpen(next); if (!next) setEditing(undefined); }}
      onSaved={(saved) => { setItems(current => current.some(item => item.id === saved.id) ? current.map(item => item.id === saved.id ? saved : item) : [saved, ...current]); setNotice(`${saved.name} ${editing ? "updated" : "added"}.`); setOpen(false); setEditing(undefined); }}
    />}
    <ConfirmDialog open={Boolean(removing)} onOpenChange={next=>!next&&setRemoving(undefined)} title={`Delete ${removing?.name??"customer"}?`} description="The customer will leave active records. Completed rental and financial history will be preserved. Active bookings must be cancelled or completed first." onConfirm={()=>void removeCustomer()} pending={removingPending} confirmLabel="Delete customer" pendingLabel="Deleting…"/>
  </div>;
}

function CustomerDialog({ record, onOpenChange, onSaved }: { record?: CustomerRecord; onOpenChange: (open: boolean) => void; onSaved: (item: CustomerRecord) => void }) {
  const [form, setForm] = useState({ name: record?.name ?? "", fatherName: record?.fatherName ?? "", phone: record?.phone ?? "", cnic: record?.cnic ?? "", email: record?.email ?? "", dateOfBirth:record?.dateOfBirth??"", address:record?.address??"", cnicExpiresAt:record?.cnicExpiresAt??"", licenseNumber: record?.licenseNumber ?? "", licenseExpiresAt: record?.licenseExpiresAt ?? "", status: displayStatus(record?.status ?? "active") });
  const [errors, setErrors] = useState<Record<string,string>>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [cnicTarget, setCnicTarget] = useState<CustomerCnicTarget>();
  const [cnicIntake, setCnicIntake] = useState<CnicIntake>();
  const [cnicLoading, setCnicLoading] = useState(true);
  const [cnicUploading, setCnicUploading] = useState<"front"|"back"|null>(null);
  const [cnicError, setCnicError] = useState("");
  const lastExtraction = useRef<CnicExtractedValues | undefined>(undefined);
  const lastExtractionKey = useRef("");

  function applyExtracted(intake: CnicIntake) {
    const key = cnicExtractionKey(intake.extracted);
    if (key === lastExtractionKey.current) return;
    setForm(current => mergeCnicExtraction(current, intake.extracted, lastExtraction.current));
    lastExtraction.current = intake.extracted;
    lastExtractionKey.current = key;
  }

  async function loadCnic(target: CustomerCnicTarget, silent = false) {
    if (!silent) setCnicLoading(true);
    const result = await getCustomerCnicAction(target);
    if (!silent) setCnicLoading(false);
    if (!result.ok) { if (!silent) setCnicError(result.error.message); return; }
    const intake = result.data as CnicIntake;
    setCnicIntake(intake);
    applyExtracted(intake);
  }

  useEffect(() => {
    let active = true;
    async function start() {
      setCnicLoading(true);
      if (record) {
        const target = { type: "customer" as const, id: record.id };
        if (!active) return;
        setCnicTarget(target);
        await loadCnic(target);
        return;
      }
      const result = await startCustomerCnicDraftAction();
      if (!active) return;
      if (!result.ok) { setCnicError(result.error.message); setCnicLoading(false); return; }
      const target = { type: "draft" as const, id: result.data.id };
      setCnicTarget(target);
      await loadCnic(target);
    }
    void start();
    return () => { active = false; };
    // The dialog owns one document target for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  async function uploadCnic(side: "front"|"back", file: File|undefined) {
    if (!file || !cnicTarget || cnicUploading) return;
    setCnicUploading(side); setCnicError("");
    const data = new FormData();
    data.set("targetType", cnicTarget.type); data.set("targetId", cnicTarget.id); data.set("side", side); data.set("image", file);
    const result = await uploadCustomerCnicAction(data);
    setCnicUploading(null);
    if (!result.ok) { setCnicError(result.error.message); return; }
    const intake = result.data as CnicIntake;
    setCnicIntake(intake);
    applyExtracted(intake);
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setMessage(""); setErrors({});
    const input = { ...form, email: form.email || undefined, dateOfBirth:form.dateOfBirth||undefined, address:form.address||undefined, cnicExpiresAt:form.cnicExpiresAt||undefined, licenseNumber: form.licenseNumber || undefined, licenseExpiresAt: form.licenseExpiresAt || undefined, cnicDocumentDraftId: cnicTarget?.type === "draft" ? cnicTarget.id : undefined };
    const result = record ? await updateCustomerAction(record.id, input) : await createCustomerAction(input);
    setPending(false);
    if (!result.ok) { setMessage(result.error.message); setErrors(result.error.fieldErrors); return; }
    onSaved(result.data);
  }
  return <Dialog.Root open onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-[#101828]/45"/><Dialog.Content className="fixed inset-x-0 bottom-0 z-40 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[calc(100%-32px)] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"><div className="flex justify-between border-b border-[#EAECF0] p-5"><div><Dialog.Title className="font-bold">{record ? "Edit customer" : "Add customer"}</Dialog.Title><Dialog.Description className="mt-1 text-xs text-[#667085]">Upload CNIC images once; OCR fills editable identity fields automatically.</Dialog.Description></div><Dialog.Close className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#F2F4F7]"><X size={18}/><span className="sr-only">Close customer form</span></Dialog.Close></div><form onSubmit={submit}><div className="grid gap-4 p-5 sm:grid-cols-2"><div className="sm:col-span-2"><CnicDocumentDrawer intake={cnicIntake} loading={cnicLoading} uploading={cnicUploading} error={cnicError} onRefresh={() => cnicTarget && void loadCnic(cnicTarget)} onUpload={(side,file) => void uploadCnic(side,file)} /></div><FormInput label="Full name" value={form.name} onChange={e => setForm({...form,name:e.target.value})} error={errors.name} required/><FormInput label="Father / husband name" value={form.fatherName} onChange={e => setForm({...form,fatherName:e.target.value})} error={errors.fatherName}/><FormInput label="Phone" value={form.phone} onChange={e => setForm({...form,phone:e.target.value})} error={errors.phone} required/><FormInput label="CNIC" value={form.cnic} onChange={e => setForm({...form,cnic:e.target.value})} error={errors.cnic} readOnly={Boolean(record)} required/><FormInput label="Email" type="email" value={form.email} onChange={e => setForm({...form,email:e.target.value})} error={errors.email}/><FormInput label="Date of birth" type="date" value={form.dateOfBirth} onChange={e=>setForm({...form,dateOfBirth:e.target.value})} error={errors.dateOfBirth}/><FormInput label="CNIC expiry" type="date" value={form.cnicExpiresAt} onChange={e=>setForm({...form,cnicExpiresAt:e.target.value})} error={errors.cnicExpiresAt}/><FormInput label="License number" value={form.licenseNumber} onChange={e => setForm({...form,licenseNumber:e.target.value})}/><FormInput label="License expiry" type="date" value={form.licenseExpiresAt} onChange={e => setForm({...form,licenseExpiresAt:e.target.value})} error={errors.licenseExpiresAt}/><label className="text-sm font-semibold text-[#344054] sm:col-span-2">Address<textarea className="mt-1.5 min-h-20 w-full rounded-[9px] border border-[#D0D5DD] p-3 text-sm font-normal" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label>{record && <FormSelect label="Status" value={form.status} onChange={e => setForm({...form,status:e.target.value})} options={["Active","Preferred","Review","Blacklisted"]}/>} {message && <div role="alert" className="rounded-lg border border-[#FECDCA] bg-[#FEF3F2] p-3 text-sm text-[#B42318] sm:col-span-2">{message}</div>}</div><div className="flex justify-end gap-2 border-t border-[#EAECF0] p-4"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={pending}>{pending ? "Saving…" : "Save customer"}</Button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
