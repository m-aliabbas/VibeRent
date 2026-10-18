"use client";
import { useState } from "react";
import { Plus, Trash2, UserRound } from "lucide-react";
import { archiveGuarantorAction, saveGuarantorAction } from "@/app/actions/guarantors";
import { FormInput } from "@/components/forms/form-controls";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { Toast } from "@/components/shared/toast";
import { Button } from "@/components/ui/button";
import type { GuarantorDto } from "@/server/services/guarantor-service";

const blank:GuarantorDto={id:"",name:"",parentage:"",cnic:"",phone:"",address:"",carAmount:0};
export function GuarantorsWorkspace({initial}:{initial:GuarantorDto[]}){
  const [items,setItems]=useState(initial),[form,setForm]=useState<GuarantorDto>(),[removing,setRemoving]=useState<GuarantorDto>();
  const [search,setSearch]=useState(""),[notice,setNotice]=useState(""),[saving,setSaving]=useState(false),[deleting,setDeleting]=useState(false);
  const [errors,setErrors]=useState<Record<string,string>>({});
  const rows=items.filter(item=>`${item.name} ${item.parentage} ${item.cnic} ${item.phone}`.toLowerCase().includes(search.trim().toLowerCase()));
  async function save(){if(!form)return;setSaving(true);setErrors({});const result=await saveGuarantorAction(form);setSaving(false);if(!result.ok){setErrors(result.error.fieldErrors);setNotice(result.error.message);return}setItems(current=>[result.data,...current.filter(item=>item.id!==result.data.id)]);setNotice(`${result.data.name} saved.`);setForm(undefined)}
  async function remove(){if(!removing)return;setDeleting(true);const result=await archiveGuarantorAction(removing.id);setDeleting(false);if(!result.ok){setNotice(result.error.message);return}setItems(current=>current.filter(item=>item.id!==removing.id));setNotice(`${removing.name} archived.`);setRemoving(undefined)}
  return <div className="space-y-6"><Toast message={notice} onDismiss={()=>setNotice("")}/><PageHeader eyebrow="Rental records" title="Guarantors" description="Find and maintain guarantors for future bookings." actions={<Button onClick={()=>setForm({...blank})}><Plus size={16}/>Add guarantor</Button>}/>
    {form&&<section className="rounded-xl border bg-white p-5"><h2 className="font-bold">{form.id?"Edit guarantor":"New guarantor"}</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><FormInput label="Full name" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} error={errors.name}/><FormInput label="Parentage" required value={form.parentage} onChange={e=>setForm({...form,parentage:e.target.value})} error={errors.parentage}/><FormInput label="CNIC (optional)" value={form.cnic} onChange={e=>setForm({...form,cnic:e.target.value})} error={errors.cnic}/><FormInput label="Phone" required value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} error={errors.phone}/><FormInput label="Car amount (PKR)" required type="number" min={1} value={form.carAmount||""} onChange={e=>setForm({...form,carAmount:Number(e.target.value)})} error={errors.carAmount}/><label className="text-sm font-semibold text-[#344054] sm:col-span-2">Address<textarea className="field mt-1.5 min-h-20 py-2" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/>{errors.address&&<span className="text-xs text-[#B42318]">{errors.address}</span>}</label></div><div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={()=>setForm(undefined)}>Cancel</Button><Button disabled={saving} onClick={()=>void save()}>{saving?"Saving…":"Save guarantor"}</Button></div></section>}
    <FilterBar search={search} onSearch={setSearch} placeholder="Search name, phone or CNIC…" hasFilters={Boolean(search)} onClear={()=>setSearch("")}>{null}</FilterBar>
    {rows.length?<section className="divide-y overflow-hidden rounded-xl border bg-white">{rows.map(item=><article key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]"><UserRound size={18}/></span><div className="min-w-0 flex-1"><p className="font-semibold">{item.name}</p><p className="text-xs text-[#667085]">{item.phone} · {item.cnic}</p></div><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={()=>setForm(item)}>Edit</Button><Button size="sm" variant="ghost" onClick={()=>setRemoving(item)}><Trash2 size={15}/>Delete</Button></div></article>)}</section>:<EmptyState filtered={Boolean(search)} title={search?"No matching guarantors":"No guarantors added yet"}/>}
    <ConfirmDialog open={Boolean(removing)} onOpenChange={next=>!next&&setRemoving(undefined)} title={`Archive ${removing?.name??"guarantor"}?`} description="The guarantor will leave active search. Existing bookings retain their saved guarantor details." onConfirm={()=>void remove()} pending={deleting} confirmLabel="Archive guarantor" pendingLabel="Archiving…"/>
  </div>
}
