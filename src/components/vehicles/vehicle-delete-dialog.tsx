"use client";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { VehicleDeletionImpact } from "@/server/services/vehicle-service";

/**
 * Confirms deleting a vehicle and asks whether its linked history goes too.
 * Unchecked keeps bookings, payments, expenses, and payouts in ledgers while hiding the vehicle.
 */
export function VehicleDeleteDialog({open,onOpenChange,label,impact,canDeleteHistory,historyRequired=false,pending,onConfirm}:{open:boolean;onOpenChange:(open:boolean)=>void;label:string;impact?:VehicleDeletionImpact;canDeleteHistory:boolean;historyRequired?:boolean;pending:boolean;onConfirm:(deleteHistory:boolean)=>void}){
  const [deleteHistory,setDeleteHistory]=useState(false);
  const withHistory=historyRequired||deleteHistory;
  const summary=impact?`${impact.bookings} bookings, ${impact.transactions} payments, ${impact.expenses} expenses, ${impact.payouts} owner payouts, and ${impact.documents} documents`:"its bookings, payments, expenses, owner payouts, and documents";
  const description=withHistory
    ?`This permanently deletes ${label} together with ${summary}. Ledgers and reports will no longer include them. This cannot be undone.`
    :`${label} will disappear from the fleet, booking pickers, and reports filters. Its bookings, payments, expenses, and payouts stay in ledgers and booking history.`;
  return <ConfirmDialog open={open} onOpenChange={next=>{if(!next)setDeleteHistory(false);onOpenChange(next)}} title={`Delete ${label}?`} description={description} onConfirm={()=>onConfirm(withHistory)} pending={pending} confirmLabel={withHistory?"Delete vehicle and data":"Delete vehicle"} pendingLabel="Deleting…" confirmDisabled={withHistory&&!canDeleteHistory}>
    {!historyRequired&&<label className={`mt-4 flex gap-3 rounded-xl border p-3 text-sm ${deleteHistory?"border-[#FDA29B] bg-[#FEF3F2]":"border-[#EAECF0] bg-[#F8FAFC]"} ${canDeleteHistory?"cursor-pointer":"cursor-not-allowed opacity-70"}`}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[#D92D20]" checked={deleteHistory} disabled={!canDeleteHistory||pending} onChange={event=>setDeleteHistory(event.target.checked)}/>
      <span><strong className="block text-[#19191F]">Also delete associated data</strong><span className="mt-0.5 block text-xs leading-5 text-[#667085]">{canDeleteHistory?`Removes ${summary} linked to this vehicle.`:"Only the agency owner can delete a vehicle's history."}</span></span>
    </label>}
    {historyRequired&&!canDeleteHistory&&<p className="mt-4 rounded-lg bg-[#FFFAEB] p-3 text-xs text-[#93370D]">Only the agency owner can delete a vehicle’s history.</p>}
  </ConfirmDialog>
}
