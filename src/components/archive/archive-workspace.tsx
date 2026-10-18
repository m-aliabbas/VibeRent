"use client";
import { useEffect, useState } from "react";
import { ArchiveRestore, Trash2 } from "lucide-react";
import { permanentlyDeleteArchivedAction, restoreArchivedAction } from "@/app/actions/archive";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterSelect } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { Toast } from "@/components/shared/toast";
import { Button } from "@/components/ui/button";
import type { ArchiveItem } from "@/server/services/archive-service";

export function ArchiveWorkspace({initial,canRestore,canPurge}:{initial:ArchiveItem[];canRestore:boolean;canPurge:boolean}){
  const [items,setItems]=useState(initial),[search,setSearch]=useState(""),[kind,setKind]=useState("All"),[notice,setNotice]=useState("");
  useEffect(()=>{queueMicrotask(()=>setSearch(new URLSearchParams(window.location.search).get("q")??""))},[]);
  const [deleting,setDeleting]=useState<ArchiveItem>(),[pending,setPending]=useState(false);
  const rows=items.filter(item=>(kind==="All"||item.kind===kind)&&`${item.label} ${item.kind}`.toLowerCase().includes(search.toLowerCase()));
  async function restore(item:ArchiveItem){setPending(true);const result=await restoreArchivedAction(item.kind,item.id);setPending(false);if(result.ok){setItems(current=>current.filter(row=>row.id!==item.id));setNotice(`${item.label} restored.`)}else setNotice(result.error.message)}
  async function purge(){if(!deleting)return;setPending(true);const result=await permanentlyDeleteArchivedAction(deleting.kind,deleting.id);setPending(false);if(result.ok){setItems(current=>current.filter(row=>row.id!==deleting.id));setNotice(`${deleting.label} permanently deleted.${result.data.filesNotRemoved?` ${result.data.filesNotRemoved} stored files still need cleanup.`:""}`);setDeleting(undefined)}else setNotice(result.error.message)}
  const impact=deleting?.deletionImpact;
  return <div className="space-y-6"><Toast message={notice} onDismiss={()=>setNotice("")}/><PageHeader eyebrow="Records" title="Archive" description="Restore archived records or permanently delete records without linked history."/>
    <FilterBar search={search} onSearch={setSearch} placeholder="Search archived records…" hasFilters={Boolean(search||kind!=="All")} onClear={()=>{setSearch("");setKind("All")}}><FilterSelect label="Type" value={kind} onChange={setKind} options={[{label:"Vehicles",value:"vehicle"},{label:"Customers",value:"customer"},{label:"Drivers",value:"driver"},{label:"Guarantors",value:"guarantor"}]}/></FilterBar>
    {rows.length?<section className="divide-y overflow-hidden rounded-xl border bg-white">{rows.map(item=><article key={`${item.kind}-${item.id}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-semibold">{item.label}</p><p className="text-xs capitalize text-[#667085]">{item.kind} · Archived {new Date(item.archivedAt).toLocaleDateString("en-PK")}</p>{item.blockedBy.length>0&&<p className="mt-1 text-xs text-[#B54708]">Permanent deletion unavailable: linked {item.blockedBy.join(", ")}</p>}{item.deletionImpact&&<p className="mt-1 text-xs text-[#B54708]">This vehicle has {item.deletionImpact.bookings} bookings, {item.deletionImpact.transactions} income transactions, {item.deletionImpact.expenses} expenses, {item.deletionImpact.payouts} payouts, and {item.deletionImpact.documents} documents. Linked records prevent permanent deletion.</p>}</div><div className="flex gap-2">{canRestore&&<Button size="sm" variant="secondary" disabled={pending} onClick={()=>void restore(item)}><ArchiveRestore size={15}/>Restore</Button>}{canPurge&&<Button size="sm" variant="danger" disabled={pending||item.blockedBy.length>0} onClick={()=>setDeleting(item)}><Trash2 size={15}/>Delete permanently</Button>}</div></article>)}</section>:<EmptyState filtered={Boolean(search||kind!=="All")} title={items.length?"No matching records":"Archive is empty"}/>}
    <ConfirmDialog open={Boolean(deleting)} onOpenChange={next=>!next&&setDeleting(undefined)} title={`Permanently delete ${deleting?.label??"record"}?`} description={impact?`This cannot be undone. This vehicle has no linked records; ${impact.bookings} bookings, ${impact.transactions} transactions, ${impact.expenses} expenses, ${impact.payouts} payouts, and ${impact.documents} documents.`:"This cannot be undone. The record has no linked operational or financial history."} onConfirm={()=>void purge()} pending={pending} confirmLabel="Delete permanently" pendingLabel="Deleting…"/>
  </div>
}
