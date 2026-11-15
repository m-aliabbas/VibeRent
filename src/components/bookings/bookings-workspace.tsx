"use client";

import { formatInZone, zonedDayKey } from "@/lib/timezone";
import { SegmentedControl } from "@/components/forms/segmented-control";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Plus, ShieldAlert, Trash2, X, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import type React from "react";
import { DataTable, moveRowFocus, type DataColumn } from "@/components/shared/data-table";
import { OverflowMenu } from "@/components/shared/action-menu";
import { Kbd } from "@/components/ui/kbd";
import { useHotkey } from "@/lib/hotkeys";
import { createAvailabilityBlockAction, listAvailabilityBlocksAction, listBookingsAction } from "@/app/actions/bookings";
import { listVehiclesAction } from "@/app/actions/vehicles";
import { FormCombobox } from "@/components/forms/form-combobox";
import { FormInput } from "@/components/forms/form-controls";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterSelect } from "@/components/shared/filter-bar";
import { LoadingState } from "@/components/shared/loading-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Toast } from "@/components/shared/toast";
import { Button } from "@/components/ui/button";
import { formatPkr } from "@/lib/utils";
import type { BookingListItem } from "@/server/repositories/contracts";
import type { AvailabilityBlockDto } from "@/server/services/booking-service";
import type { Vehicle } from "@/types/vehicle";
import { AvailabilityCalendar, type CalendarSelection } from "@/components/bookings/availability-calendar";

const bookingStatuses: BookingListItem["status"][] = ["Draft", "Confirmed", "Checked Out", "Completed", "Cancelled", "No Show"];
const paymentStatuses: NonNullable<BookingListItem["paymentStatus"]>[] = ["Unpaid", "Partially paid", "Paid", "Payment reversed"];

export function BookingsWorkspace() {
  const [view,setView]=useState<"list"|"calendar"|"balances">("list"); const [search,setSearch]=useState(""); const [status,setStatus]=useState("All"); const [paymentStatus,setPaymentStatus]=useState("All"); const [notice,setNotice]=useState(""); const [blockOpen,setBlockOpen]=useState(false); const [blockSelection,setBlockSelection]=useState<CalendarSelection>(); const [loading,setLoading]=useState(true);
  const [items,setItems]=useState<BookingListItem[]>([]); const [vehicles,setVehicles]=useState<Vehicle[]>([]); const [blocks,setBlocks]=useState<AvailabilityBlockDto[]>([]);
  useEffect(()=>{const params=new URLSearchParams(window.location.search);const requested=params.get("status");const requestedPayment=params.get("payment");queueMicrotask(()=>{if(bookingStatuses.includes(requested as BookingListItem["status"]))setStatus(requested!);if(paymentStatuses.includes(requestedPayment as NonNullable<BookingListItem["paymentStatus"]>))setPaymentStatus(requestedPayment!);setSearch(params.get("q")??"")})},[]);
  useEffect(()=>{let active=true;void Promise.all([listBookingsAction(),listVehiclesAction(),listAvailabilityBlocksAction()]).then(([bookingResult,vehicleResult,blockResult])=>{if(!active)return;const errors:string[]=[];if(bookingResult.ok)setItems(bookingResult.data);else errors.push(bookingResult.error.message);if(vehicleResult.ok)setVehicles(vehicleResult.data);else errors.push(vehicleResult.error.message);if(blockResult.ok)setBlocks(blockResult.data);else errors.push(blockResult.error.message);if(errors.length)setNotice(errors.join(" · "));setLoading(false)});return()=>{active=false}},[]);
  const router=useRouter(); const [page,setPage]=useState(1); const pageSize=50;
  useEffect(()=>{queueMicrotask(()=>setPage(1))},[search,status,paymentStatus]);
  const columns:DataColumn<BookingListItem>[]=[
    {key:"ref",header:"Booking",cell:item=><span className="whitespace-nowrap font-mono text-[13px] font-semibold text-[#344054]">{bookingRef(item)||"—"}</span>},
    {key:"customer",header:"Customer",cell:item=><Link href={`/bookings/${item.id}`} className="whitespace-nowrap font-semibold text-[#19191F] hover:text-[#006FE6] hover:underline">{item.customer}</Link>},
    {key:"vehicle",header:"Vehicle",cell:item=><span className="block max-w-[260px] truncate text-[#344054]" title={`${item.vehicle} ${item.plate}`}>{item.vehicle} <span className="font-mono text-xs text-[#475467]">{item.plate}</span></span>},
    {key:"dates",header:"Pickup → Return",cell:item=><span className="whitespace-nowrap text-[#344054] tabular-nums">{formatDate(item.pickupAt)} → {formatDate(item.returnAt)}</span>},
    {key:"amount",header:"Total",className:"text-right",cell:item=><span className="font-semibold tabular-nums">{formatPkr(bookingTotal(item))}</span>},
    {key:"status",header:"Status",cell:item=><StatusBadge status={item.status}/>},
    {key:"payment",header:"Payment",cell:item=><StatusBadge status={item.paymentStatus??"Unpaid"}/>},
    {key:"actions",header:"",className:"w-12 text-right",cell:item=><OverflowMenu label={`More actions for ${bookingRef(item)}`} items={[{label:"Open booking",icon:<ArrowRight size={15}/>,href:`/bookings/${item.id}`},...(["Confirmed","Checked Out"].includes(item.status)?[{label:"Cancel booking…",icon:<XCircle size={15}/>,href:`/bookings/${item.id}?action=cancel`}]:[]),...(["Confirmed","Cancelled","No Show"].includes(item.status)?[{label:"Delete booking…",icon:<Trash2 size={15}/>,href:`/bookings/${item.id}?action=delete`,danger:true,separatorBefore:true}]:[])]}/>},
  ];
  const rows=useMemo(()=>items.filter(item=>(status==="All"||item.status===status)&&(paymentStatus==="All"||(item.paymentStatus??"Unpaid")===paymentStatus)&&JSON.stringify(item).toLowerCase().includes(search.toLowerCase())),[items,search,status,paymentStatus]);
  const active=items.filter(item=>item.status==="Checked Out").length; const confirmed=items.filter(item=>item.status==="Confirmed").length; const billable=items.filter(item=>!["Cancelled","No Show","Draft"].includes(item.status)); const outstanding=billable.reduce((sum,item)=>sum+Math.max(0,item.dailyRate*item.days+item.extras-item.discount-item.paid),0);
  return <div className="space-y-6"><Toast message={notice} onDismiss={()=>setNotice("")}/><PageHeader eyebrow="Rental operations" title="Bookings" description="Manage availability, reservations, handovers, returns, and booking balances." actions={<div className="flex flex-wrap gap-2"><OverflowMenu label="More booking actions" items={[{label:"Block a car (maintenance, private use)…",icon:<ShieldAlert size={15}/>,disabled:!vehicles.length,onSelect:()=>{setBlockSelection(undefined);setBlockOpen(true)}}]}/><Button asChild shortcut="n"><Link href="/bookings/new"><Plus size={17}/>New booking</Link></Button></div>}/><BookingPeriodSummary items={items} loading={loading}/><div className="flex flex-wrap items-end justify-between gap-2 border-b border-[#E4E7EC]"><div role="tablist" aria-label="Booking view" className="flex gap-1">{(["list","calendar","balances"] as const).map((item,index)=><ViewTab key={item} selected={view===item} combo={String(index+1)} onSelect={()=>setView(item)}>{item==="balances"?`Balances · ${formatPkr(outstanding)}`:item[0].toUpperCase()+item.slice(1)}</ViewTab>)}</div>{view==="list"&&<div role="group" aria-label="Quick filters" className="flex gap-1.5 pb-1.5">{([["Checked Out","Out now",active],["Confirmed","Upcoming",confirmed]] as const).map(([key,label,count])=><button key={key} type="button" aria-pressed={status===key} onClick={()=>setStatus(status===key?"All":key)} className={`h-7 rounded-full border px-2.5 text-[13px] font-semibold ${status===key?"border-[#006FE6] bg-[#EFF8FF] text-[#0058B8]":"border-[#D0D5DD] bg-white text-[#344054] hover:bg-[#F8FAFC]"}`}>{label} <span className="tabular-nums">{count}</span></button>)}</div>}</div>{loading?<LoadingState rows={4}/>:view==="list"?<><FilterBar search={search} onSearch={setSearch} placeholder="Search booking, customer or vehicle…" hasFilters={Boolean(search||status!=="All"||paymentStatus!=="All")} onClear={()=>{setSearch("");setStatus("All");setPaymentStatus("All")}}><FilterSelect label="Booking status" value={status} onChange={setStatus} options={bookingStatuses}/><FilterSelect label="Payments" value={paymentStatus} onChange={setPaymentStatus} options={paymentStatuses}/></FilterBar><DataTable rows={rows.slice((page-1)*pageSize,page*pageSize)} columns={columns} rowKey={item=>item.id} page={page} pageSize={pageSize} total={rows.length} onPageChange={setPage} onRowClick={item=>router.push(`/bookings/${item.id}`)} empty={<EmptyState filtered={Boolean(search||status!=="All"||paymentStatus!=="All")}/>} mobileCard={item=><Link href={`/bookings/${item.id}`} className="block"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-bold">{item.customer}</p><p className="mt-0.5 text-xs text-[#475467]">{bookingRef(item)} · {item.vehicle} · <span className="font-mono">{item.plate}</span></p><p className="mt-0.5 text-xs text-[#475467]">{formatDate(item.pickupAt)} – {formatDate(item.returnAt)}</p></div><strong className="shrink-0 text-sm tabular-nums">{formatPkr(bookingTotal(item))}</strong></div><div className="mt-2 flex gap-1.5"><StatusBadge status={item.status}/><StatusBadge status={item.paymentStatus??"Unpaid"}/></div></Link>}/></>:view==="calendar"?<AvailabilityCalendar bookings={items} vehicles={vehicles} blocks={blocks} onCreateBlock={selection=>{setBlockSelection(selection);setBlockOpen(true)}}/>:<OutstandingBalances bookings={items}/>} {blockOpen&&<BlockDialog initial={blockSelection} bookings={items} vehicles={vehicles} blocks={blocks} onClose={()=>{setBlockOpen(false);setBlockSelection(undefined)}} onSaved={block=>{setBlocks(current=>[...current,block]);setBlockOpen(false);setBlockSelection(undefined);setNotice("Availability block saved.")}}/>}</div>;
}

function BlockDialog({initial,bookings,vehicles,blocks,onClose,onSaved}:{initial?:CalendarSelection;bookings:BookingListItem[];vehicles:Vehicle[];blocks:AvailabilityBlockDto[];onClose:()=>void;onSaved:(block:AvailabilityBlockDto)=>void}){const initialFrom=initial?toLocalInput(initial.date,9):"";const initialTo=initial?toLocalInput(initial.date,18):"";const [vehicleId,setVehicleId]=useState(initial?.vehicleId??vehicles[0]?.id??"");const [from,setFrom]=useState(initialFrom);const [to,setTo]=useState(initialTo);const [reason,setReason]=useState("");const [error,setError]=useState("");const conflicts=[...bookings.filter(item=>item.vehicleId===vehicleId&&!["Cancelled","No Show","Completed"].includes(item.status)&&new Date(item.pickupAt)<new Date(to)&&new Date(item.returnAt)>new Date(from)),...blocks.filter(item=>item.vehicleId===vehicleId&&new Date(item.from)<new Date(to)&&new Date(item.to)>new Date(from))];async function submit(event:FormEvent){event.preventDefault();if(conflicts.length)return;const result=await createAvailabilityBlockAction({vehicleId,from,to,reason});if(result.ok)onSaved(result.data);else setError(result.error.message)}return <Dialog.Root open onOpenChange={open=>!open&&onClose()}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45"/><Dialog.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white p-5 sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"><div className="flex justify-between"><div><Dialog.Title className="font-bold">Block availability</Dialog.Title><Dialog.Description className="mt-1 text-xs text-[#667085]">Create a persistent operational hold.</Dialog.Description></div><Dialog.Close aria-label="Close dialog"><X/></Dialog.Close></div><form onSubmit={submit} className="mt-5 space-y-4"><FormCombobox label="Vehicle" value={vehicleId} onValueChange={setVehicleId} options={vehicles.map(item=>({label:`${item.make} ${item.model} ${item.year} · ${item.plate}`,value:item.id,keywords:item.city}))} searchPlaceholder="Search make, model or plate…" required/><div className="grid gap-4 sm:grid-cols-2"><FormInput label="From" type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)} required/><FormInput label="To" type="datetime-local" value={to} onChange={e=>setTo(e.target.value)} required/></div><FormInput label="Reason" value={reason} onChange={e=>setReason(e.target.value)} required/>{(conflicts.length>0||error)&&<div role="alert" className="rounded-lg border border-[#FDA29B] bg-[#FEF3F2] p-3 text-sm text-[#B42318]"><ShieldAlert size={16} className="mr-2 inline"/>{error||"This period overlaps an existing booking or block."}</div>}<div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!reason.trim()||!from||!to||conflicts.length>0}>Create block</Button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>}

function OutstandingBalances({bookings}:{bookings:BookingListItem[]}){
  const router=useRouter();
  const items=bookings.filter(item=>!["Cancelled","No Show","Draft"].includes(item.status)).map(item=>({...item,balance:item.dailyRate*item.days+item.extras-item.discount-item.paid})).filter(item=>item.balance>0).sort((a,b)=>b.balance-a.balance);
  const total=items.reduce((sum,item)=>sum+item.balance,0);
  if(!items.length)return <EmptyState title="Nothing to collect" description="Every booking is fully paid."/>;
  return <div className="rounded-[8px] border border-[#D0D5DD] bg-white">
    <table className="w-full text-left text-[13px]">
      <thead className="bg-[#F2F4F7] text-[#344054]"><tr><th className="px-3 py-2 font-semibold">Customer</th><th className="px-3 py-2 font-semibold">Booking</th><th className="px-3 py-2 font-semibold">Car</th><th className="px-3 py-2 font-semibold">Returned / due back</th><th className="px-3 py-2 font-semibold">Status</th><th className="px-3 py-2 text-right font-semibold">Balance</th><th className="px-3 py-2"><span className="sr-only">Action</span></th></tr></thead>
      <tbody onKeyDown={moveRowFocus}>{items.map(item=><tr key={item.id} data-row="" tabIndex={0} onClick={event=>{if(!(event.target as HTMLElement).closest("a,button"))router.push(`/bookings/${item.id}`)}} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();router.push(`/bookings/${item.id}?action=payment`)}}} className="h-9 cursor-pointer border-t border-[#EAECF0] even:bg-[#FAFBFC] hover:bg-[#EEF4FF] focus:bg-[#EAF3FF] focus:outline-2 focus:-outline-offset-2 focus:outline-[#006FE6]">
        <td className="whitespace-nowrap px-3 py-1 font-semibold">{item.customer}</td>
        <td className="whitespace-nowrap px-3 py-1 font-mono text-xs text-[#475467]">{bookingRef(item)||"—"}</td>
        <td className="px-3 py-1"><span className="block max-w-[220px] truncate">{item.vehicle} <span className="font-mono text-xs text-[#475467]">{item.plate}</span></span></td>
        <td className="whitespace-nowrap px-3 py-1 tabular-nums">{formatDate(item.returnAt)}</td>
        <td className="px-3 py-1"><StatusBadge status={item.status}/></td>
        <td className="whitespace-nowrap px-3 py-1 text-right font-semibold tabular-nums text-[#B54708]">{formatPkr(item.balance)}</td>
        <td className="px-3 py-1 text-right"><Link href={`/bookings/${item.id}?action=payment`} tabIndex={-1} className="inline-flex h-8 items-center whitespace-nowrap rounded-[8px] border border-[#D0D5DD] bg-white px-3 text-[13px] font-semibold text-[#344054] hover:bg-[#F8FAFC]">Record payment</Link></td>
      </tr>)}</tbody>
      <tfoot><tr className="border-t border-[#D0D5DD] bg-[#F8FAFC]"><td className="px-3 py-2 font-semibold" colSpan={5}>{items.length} bookings with a balance</td><td className="px-3 py-2 text-right font-bold tabular-nums text-[#B54708]">{formatPkr(total)}</td><td/></tr></tfoot>
    </table>
  </div>;
}
type SummaryPeriod="this_month"|"last_month"|"all";
const summaryPeriods:Array<{value:SummaryPeriod;label:string}>=[{value:"this_month",label:"This month"},{value:"last_month",label:"Last month"},{value:"all",label:"All time"}];
/** Month keys ("YYYY-MM") in the agency zone, so a 11:30 pm pickup on the 31st stays in its own month. */
function monthKeys(){const today=zonedDayKey();const [year,month]=today.split("-").map(Number);const previous=month===1?`${year-1}-12`:`${year}-${String(month-1).padStart(2,"0")}`;return {current:today.slice(0,7),previous}}
function BookingPeriodSummary({items,loading}:{items:BookingListItem[];loading:boolean}){
  const [period,setPeriod]=useState<SummaryPeriod>("this_month");
  const {current,previous}=monthKeys();
  const inPeriod=items.filter(item=>period==="all"||zonedDayKey(item.pickupAt).slice(0,7)===(period==="this_month"?current:previous));
  const billable=inPeriod.filter(item=>!["Cancelled","No Show","Draft"].includes(item.status));
  const value=billable.reduce((sum,item)=>sum+bookingTotal(item),0);
  const collected=billable.reduce((sum,item)=>sum+Math.min(item.paid,bookingTotal(item)),0);
  const outstanding=billable.reduce((sum,item)=>sum+Math.max(0,bookingTotal(item)-item.paid),0);
  const discount=billable.reduce((sum,item)=>sum+item.discount,0);
  const periodLabel=period==="all"?"All bookings":formatInZone(`${period==="this_month"?current:previous}-01T12:00`,{month:"long",year:"numeric"});
  const cards:Array<[string,string,string]>=[
    ["Bookings",String(billable.length),`${inPeriod.filter(item=>item.status==="Checked Out").length} out now · ${inPeriod.filter(item=>item.status==="Confirmed").length} upcoming`],
    ["Booking value",formatPkr(value),discount?`After ${formatPkr(discount)} discount`:"Rent + extras"],
    ["Collected",formatPkr(collected),value?`${Math.round(collected/value*100)}% of value`:"No billable bookings"],
    ["Outstanding",formatPkr(outstanding),"Open booking balances"],
  ];
  return <section aria-label="Booking summary" className="rounded-xl border border-[#E4E7EC] bg-white p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-[#344054]">{periodLabel}<span className="ml-1.5 text-xs font-normal text-[#667085]">by pickup date</span></p><div className="w-full sm:w-auto"><SegmentedControl label="Summary period" hideLabel value={period} onChange={setPeriod} options={summaryPeriods}/></div></div>
    <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">{cards.map(([label,val,note])=><div key={label} className="rounded-[10px] border border-[#EAECF0] bg-[#FCFCFD] p-3"><p className="text-xs text-[#667085]">{label}</p><p className="mt-1 text-lg font-bold tabular-nums text-[#19191F]">{loading?"—":val}</p><p className="mt-0.5 truncate text-xs text-[#667085]" title={note}>{loading?"Loading…":note}</p></div>)}</div>
  </section>;
}
function bookingRef(item:BookingListItem){return item.publicNumber?`#${item.publicNumber}`:item.id.startsWith("BKG-")?item.id:""}
function bookingTotal(item:BookingListItem){return item.dailyRate*item.days+item.extras-item.discount}
function ViewTab({selected,combo,onSelect,children}:{selected:boolean;combo:string;onSelect:()=>void;children:React.ReactNode}){useHotkey(`alt+${combo}`,onSelect);return <button type="button" role="tab" aria-selected={selected} aria-keyshortcuts={`Alt+${combo}`} onClick={onSelect} className={`group -mb-px inline-flex h-10 items-center gap-2 border-b-2 px-3 text-sm font-semibold ${selected?"border-[#006FE6] text-[#0058B8]":"border-transparent text-[#475467] hover:text-[#19191F]"}`}>{children}<Kbd combo={`alt+${combo}`} className="invisible group-hover:visible group-focus-visible:visible"/></button>}
function formatDate(value:string){return formatInZone(value,{day:"2-digit",month:"short",hour:"numeric",minute:"2-digit"})}
function toLocalInput(value:Date,hour:number){const date=new Date(value);date.setHours(hour,0,0,0);const offset=date.getTimezoneOffset();return new Date(date.getTime()-offset*60_000).toISOString().slice(0,16)}
