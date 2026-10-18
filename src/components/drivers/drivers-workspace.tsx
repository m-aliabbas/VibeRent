"use client";

import { useState } from "react";
import { Plus, Trash2, UserRound } from "lucide-react";
import { archiveDriverAction, saveDriverAction } from "@/app/actions/drivers";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { FilterBar } from "@/components/shared/filter-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Toast } from "@/components/shared/toast";
import { Button } from "@/components/ui/button";
import type { DriverDto } from "@/server/services/driver-service";

const blank:DriverDto={id:"",name:"",phone:"",cnic:"",address:"",licenseNumber:"",licenseExpiresAt:"",status:"active"};

export function DriversWorkspace({initial}:{initial:DriverDto[]}){
  const [items,setItems]=useState(initial);
  const [search,setSearch]=useState("");
  const rows=items.filter(item=>`${item.name} ${item.phone} ${item.cnic} ${item.licenseNumber}`.toLowerCase().includes(search.trim().toLowerCase()));
  const [form,setForm]=useState<DriverDto>();
  const [removing,setRemoving]=useState<DriverDto>();
  const [errors,setErrors]=useState<Record<string,string>>({});
  const [notice,setNotice]=useState("");
  const [saving,setSaving]=useState(false);
  const [removingPending,setRemovingPending]=useState(false);

  async function save(){
    if(!form)return;
    setSaving(true);setErrors({});
    const result=await saveDriverAction(form);
    setSaving(false);
    if(!result.ok){setErrors(result.error.fieldErrors);setNotice(result.error.message);return;}
    setItems(current=>[result.data,...current.filter(item=>item.id!==result.data.id)]);
    setNotice(`${result.data.name} saved.`);
    setForm(undefined);
  }

  async function remove(){
    if(!removing)return;
    setRemovingPending(true);
    const result=await archiveDriverAction(removing.id);
    setRemovingPending(false);
    if(!result.ok){setNotice(result.error.message);return;}
    setItems(current=>current.filter(item=>item.id!==removing.id));
    setNotice(`${removing.name} deleted from active driver records.`);
    setRemoving(undefined);
  }

  return <div className="space-y-6">
    <Toast message={notice} onDismiss={()=>setNotice("")}/>
    <PageHeader eyebrow="Operations" title="Drivers" description="Manage drivers used for with-driver rentals." actions={<Button onClick={()=>setForm({...blank})}><Plus size={16}/>Add driver</Button>}/>
    {form&&<section className="rounded-xl border bg-white p-5"><h2 className="font-bold">{form.id?"Edit driver":"New driver"}</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><FormInput label="Full name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} error={errors.name}/><FormInput label="Phone" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} error={errors.phone}/><FormInput label="CNIC" value={form.cnic} onChange={e=>setForm({...form,cnic:e.target.value})} error={errors.cnic}/><FormInput label="Driving licence" value={form.licenseNumber} onChange={e=>setForm({...form,licenseNumber:e.target.value})} error={errors.licenseNumber}/><FormInput label="Licence expiry" type="date" value={form.licenseExpiresAt??""} onChange={e=>setForm({...form,licenseExpiresAt:e.target.value})}/><FormSelect label="Status" value={form.status} onChange={e=>setForm({...form,status:e.target.value})} options={["active","inactive"]}/><label className="text-sm font-semibold text-[#344054] sm:col-span-2">Address<textarea className="field mt-1.5 min-h-20 py-2" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/>{errors.address&&<span className="mt-1 block text-xs text-[#B42318]">{errors.address}</span>}</label></div><div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={()=>setForm(undefined)}>Cancel</Button><Button disabled={saving} onClick={()=>void save()}>{saving?"Saving…":"Save driver"}</Button></div></section>}
    <FilterBar search={search} onSearch={setSearch} placeholder="Search name, phone, CNIC or licence…" hasFilters={Boolean(search)} onClear={()=>setSearch("")}>{null}</FilterBar>
    {rows.length?<section className="divide-y overflow-hidden rounded-xl border bg-white">{rows.map(item=><article key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]"><UserRound size={18}/></span><div className="min-w-0 flex-1"><p className="font-semibold">{item.name}</p><p className="text-xs text-[#667085]">{item.phone} · {item.cnic} · Licence {item.licenseNumber}</p></div><StatusBadge status={item.status}/><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={()=>setForm(item)}>Edit</Button><Button size="sm" variant="ghost" onClick={()=>setRemoving(item)}><Trash2 size={15}/>Delete</Button></div></article>)}</section>:<EmptyState filtered={Boolean(search)} title={search?"No matching drivers":"No drivers added yet"} />}
    <ConfirmDialog open={Boolean(removing)} onOpenChange={next=>!next&&setRemoving(undefined)} title={`Delete ${removing?.name??"driver"}?`} description="The driver will leave active records while completed booking history is preserved. Active bookings must be cancelled, completed, or reassigned first." onConfirm={()=>void remove()} pending={removingPending} confirmLabel="Delete driver" pendingLabel="Deleting…"/>
  </div>;
}
