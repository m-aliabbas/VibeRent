"use client";
import { useEffect, useState } from "react";
import { ArchiveRestore, CalendarDays, Car, Contact, ShieldCheck, Trash2, UserRound, UsersRound, type LucideIcon } from "lucide-react";
import { permanentlyDeleteArchivedAction, restoreArchivedAction } from "@/app/actions/archive";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { Toast } from "@/components/shared/toast";
import { Button } from "@/components/ui/button";
import { VehicleDeleteDialog } from "@/components/vehicles/vehicle-delete-dialog";
import type { ArchiveItem, ArchiveKind } from "@/server/services/archive-service";

const kindMeta:Record<ArchiveKind,{label:string;plural:string;icon:LucideIcon}>={
  booking:{label:"Booking",plural:"Bookings",icon:CalendarDays},
  vehicle:{label:"Vehicle",plural:"Vehicles",icon:Car},
  customer:{label:"Customer",plural:"Customers",icon:UserRound},
  owner:{label:"Owner",plural:"Owners",icon:UsersRound},
  driver:{label:"Driver",plural:"Drivers",icon:Contact},
  guarantor:{label:"Guarantor",plural:"Guarantors",icon:ShieldCheck},
};
const kindOrder=Object.keys(kindMeta) as ArchiveKind[];

export function ArchiveWorkspace({initial,canRestore,canPurge}:{initial:ArchiveItem[];canRestore:boolean;canPurge:boolean}){
  const [items,setItems]=useState(initial),[search,setSearch]=useState(""),[kind,setKind]=useState<ArchiveKind|"all">("all"),[notice,setNotice]=useState("");
  useEffect(()=>{queueMicrotask(()=>{const params=new URLSearchParams(window.location.search);setSearch(params.get("q")??"");const requested=params.get("type");if(kindOrder.includes(requested as ArchiveKind))setKind(requested as ArchiveKind)})},[]);
  const [deleting,setDeleting]=useState<ArchiveItem>(),[pending,setPending]=useState(false);
  const counts=kindOrder.map(value=>({value,count:items.filter(item=>item.kind===value).length}));
  const rows=items.filter(item=>(kind==="all"||item.kind===kind)&&`${item.label} ${item.detail} ${item.kind}`.toLowerCase().includes(search.toLowerCase()));
  function chooseKind(value:ArchiveKind|"all"){setKind(value);const url=new URL(window.location.href);if(value==="all")url.searchParams.delete("type");else url.searchParams.set("type",value);window.history.replaceState(null,"",url)}
  async function restore(item:ArchiveItem){setPending(true);const result=await restoreArchivedAction(item.kind,item.id);setPending(false);if(result.ok){setItems(current=>current.filter(row=>!(row.kind===item.kind&&row.id===item.id)));setNotice(`${item.label} restored.`)}else setNotice(result.error.message)}
  async function purge(deleteHistory=false){if(!deleting)return;setPending(true);const result=await permanentlyDeleteArchivedAction(deleting.kind,deleting.id,{deleteHistory});setPending(false);if(result.ok){const removed=deleting;setItems(current=>result.data.historyDeleted||removed.kind!=="vehicle"?current.filter(row=>!(row.kind===removed.kind&&row.id===removed.id)):current.map(row=>row.kind===removed.kind&&row.id===removed.id?{...row,historyKept:true}:row));setNotice(removed.kind==="vehicle"&&!result.data.historyDeleted?`${removed.label} deleted. Its history stays in ledgers.`:`${removed.label} permanently deleted.`);setDeleting(undefined)}else setNotice(result.error.message)}
  const filtered=Boolean(search||kind!=="all");
  return <div className="space-y-6"><Toast message={notice} onDismiss={()=>setNotice("")}/><PageHeader eyebrow="Records" title="Archive" description="Archived bookings, vehicles, customers, owners, drivers, and guarantors. Restore them or delete them permanently."/>
    <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Record type">
      <Button size="sm" className="shrink-0" variant={kind==="all"?"primary":"secondary"} aria-pressed={kind==="all"} onClick={()=>chooseKind("all")}>All <span className="tabular-nums opacity-80">{items.length}</span></Button>
      {counts.map(({value,count})=>{const Icon=kindMeta[value].icon;return <Button key={value} size="sm" className="shrink-0" variant={kind===value?"primary":"secondary"} aria-pressed={kind===value} onClick={()=>chooseKind(value)}><Icon size={15}/>{kindMeta[value].plural} <span className="tabular-nums opacity-80">{count}</span></Button>})}
    </div>
    <FilterBar search={search} onSearch={setSearch} placeholder="Search archived records…" hasFilters={filtered} onClear={()=>{setSearch("");chooseKind("all")}}/>
    {rows.length?<section className="divide-y divide-[#EAECF0] overflow-hidden rounded-xl border border-[#E4E7EC] bg-white">{rows.map(item=>{const Icon=kindMeta[item.kind].icon;return <article key={`${item.kind}-${item.id}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <span className="hidden size-10 shrink-0 place-items-center rounded-lg bg-[#F2F4F7] text-[#475467] sm:grid"><Icon size={18}/></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{item.label}</p><span className="rounded-full bg-[#F2F4F7] px-2 py-0.5 text-[11px] font-semibold text-[#475467]">{kindMeta[item.kind].label}</span>{item.historyKept&&<span className="rounded-full bg-[#FFFAEB] px-2 py-0.5 text-[11px] font-semibold text-[#B54708]">Deleted · history kept</span>}</div>
        <p className="mt-0.5 text-xs text-[#667085]">{item.detail?`${item.detail} · `:""}{item.historyKept?"Deleted":"Archived"} {new Date(item.archivedAt).toLocaleDateString("en-PK")}</p>
        {item.blockedBy.length>0&&<p className="mt-1 text-xs text-[#B54708]">Permanent deletion unavailable: linked {item.blockedBy.join(", ")}</p>}
        {item.restoreBlockedBy&&<p className="mt-1 text-xs text-[#B54708]">{item.restoreBlockedBy}</p>}
        {item.deletionImpact&&<p className="mt-1 text-xs text-[#667085]">Linked history: {item.deletionImpact.bookings} bookings, {item.deletionImpact.transactions} payments, {item.deletionImpact.expenses} expenses, {item.deletionImpact.payouts} payouts.</p>}
      </div>
      <div className="flex flex-wrap gap-2">{canRestore&&<Button size="sm" variant="secondary" disabled={pending||Boolean(item.restoreBlockedBy)} title={item.restoreBlockedBy} onClick={()=>void restore(item)}><ArchiveRestore size={15}/>Restore</Button>}{canPurge&&<Button size="sm" variant="danger" disabled={pending||item.blockedBy.length>0} onClick={()=>setDeleting(item)}><Trash2 size={15}/>Delete permanently</Button>}</div>
    </article>})}</section>:<EmptyState filtered={filtered} title={items.length?"No matching records":"Archive is empty"} description={items.length?"Try another record type or clear the search.":"Archived bookings, vehicles, customers, owners, drivers, and guarantors will appear here."}/>}
    {deleting?.kind==="vehicle"
      ?<VehicleDeleteDialog key={deleting.id} open onOpenChange={next=>!next&&setDeleting(undefined)} label={deleting.label} impact={deleting.deletionImpact} canDeleteHistory={canPurge} historyRequired={deleting.historyKept} pending={pending} onConfirm={deleteHistory=>void purge(deleteHistory)}/>
      :<ConfirmDialog open={Boolean(deleting)} onOpenChange={next=>!next&&setDeleting(undefined)} title={`Permanently delete ${deleting?.label??"record"}?`} description={deleting?.kind==="booking"?"This cannot be undone. The booking, its payments, inspections, and notices are removed; linked expenses stay as vehicle costs.":"This cannot be undone. The record has no linked operational or financial history."} onConfirm={()=>void purge()} pending={pending} confirmLabel="Delete permanently" pendingLabel="Deleting…"/>}
  </div>
}
