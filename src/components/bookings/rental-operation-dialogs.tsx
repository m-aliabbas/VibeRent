"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { CalendarCheck2, CalendarClock, ClockAlert, CreditCard, X } from "lucide-react";
import { checkInRentalAction, extendRentalAction } from "@/app/actions/bookings";
import { Button } from "@/components/ui/button";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { getVehicleConflicts } from "@/lib/booking-data";
import { formatPkr } from "@/lib/utils";
import { calculateEarlyReturn, calculateLateReturn, formatLateReturnDuration } from "@/lib/rental-time";
import type { BookingListItem } from "@/server/repositories/contracts";
import type { PaymentMethod } from "@/server/validation/booking";

function Shell({title,description,onClose,children}:{title:string;description:string;onClose:()=>void;children:React.ReactNode}) {
  return <Dialog.Root open onOpenChange={open=>!open&&onClose()}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45"/><Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[94vh] overflow-y-auto rounded-t-2xl bg-white p-5 sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[calc(100%-32px)] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"><div className="flex justify-between"><div><Dialog.Title className="font-bold">{title}</Dialog.Title><Dialog.Description className="mt-1 text-xs text-[#667085]">{description}</Dialog.Description></div><Dialog.Close aria-label="Close dialog" className="grid h-10 w-10 place-items-center rounded-lg"><X/></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function ExtensionDialog({booking,onClose,onSave}:{booking:BookingListItem;onClose:()=>void;onSave:(next:BookingListItem,charge:number)=>void}) {
  const [to,setTo]=useState(toLocal(booking.returnAt));
  const conflicts=booking.fulfillmentType==="fleet"?getVehicleConflicts(booking.vehicleId,booking.returnAt,to,booking.id):[];
  const addedDays=Math.max(0,Math.ceil((new Date(to).getTime()-new Date(booking.returnAt).getTime())/86400000));
  const charge=addedDays*booking.dailyRate;
  const [pending,setPending]=useState(false);const [error,setError]=useState("");
  async function save(){if(!addedDays||conflicts.length||pending)return;setPending(true);setError("");const result=await extendRentalAction(booking.id,{returnAt:to,version:booking.version});setPending(false);if(result.ok)onSave(result.data,result.data.extensionCharge);else setError(result.error.message)}
  return <Shell title="Extend active rental" description="The extension is saved to the rental ledger after the server rechecks availability." onClose={onClose}><div className="mt-5 space-y-4"><FormInput label="Proposed return" type="datetime-local" value={to} onChange={e=>setTo(e.target.value)}/><div className="rounded-lg bg-[#F8FAFC] p-3 text-sm"><strong>{addedDays} additional day(s) · {formatPkr(charge)}</strong><p className="mt-1 text-xs text-[#667085]">The booking total and outstanding balance update immediately after confirmation.</p></div>{conflicts.length>0&&<div className="rounded-lg bg-[#FEF3F2] p-3 text-sm text-[#B42318]">Blocked by {conflicts[0].reason}.</div>}{error&&<div role="alert" className="rounded-lg bg-[#FEF3F2] p-3 text-sm text-[#B42318]">{error}</div>}<div className="flex justify-end gap-2"><Button variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button><Button disabled={!addedDays||conflicts.length>0||pending} onClick={()=>void save()}>{pending?"Extending…":"Confirm extension"}</Button></div></div></Shell>;
}

function toLocal(value:string){const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16)}

export function ReturnDialog({booking,onClose,onComplete}:{booking:BookingListItem;onClose:()=>void;onComplete:(updated:BookingListItem)=>void}) {
  const total=booking.dailyRate*booking.days+booking.mileageRate*booking.estimatedKm+booking.extras-booking.discount;
  const checkoutInspection=booking.inspections?.find(inspection=>inspection.kind==="checkout");
  const checkoutOdometer=checkoutInspection?.odometer??0;
  const [odometer,setOdometer]=useState(checkoutOdometer);
  const [fuel,setFuel]=useState("Full");
  const [conditionNotes,setConditionNotes]=useState("Returned without new damage");
  const [recordPayment,setRecordPayment]=useState(true);
  const [amountInput,setAmountInput]=useState<number|null>(null);
  const [method,setMethod]=useState<PaymentMethod>("Cash");
  const [reference,setReference]=useState("");
  const [currentTime,setCurrentTime]=useState(()=>Date.now());
  const [useCurrentTime,setUseCurrentTime]=useState(true);
  const [manualReturn,setManualReturn]=useState(()=>toLocal(new Date().toISOString()));
  const [addLateCharge,setAddLateCharge]=useState(false);
  const [lateCharge,setLateCharge]=useState(0);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{const timer=window.setInterval(()=>setCurrentTime(Date.now()),60_000);return()=>window.clearInterval(timer)},[]);
  const returnedAt=useCurrentTime?new Date(currentTime):new Date(manualReturn);
  const returnTimeError=useCurrentTime?undefined
    : !Number.isFinite(returnedAt.getTime())
      ? "Enter a valid return time."
      : returnedAt.getTime()>currentTime+5*60_000
        ? "The return time cannot be in the future."
        : checkoutInspection&&returnedAt.getTime()<Date.parse(checkoutInspection.occurredAt)
          ? "The return time cannot be before the check-out."
          : undefined;
  const lateDuration=calculateLateReturn(booking.returnAt,returnedAt);
  const earlyReturn=calculateEarlyReturn({...booking,totalAmount:total,returnedAt});
  const effectiveTotal=earlyReturn.totalAmount;
  const balance=Math.max(0,effectiveTotal-booking.paid);
  const overpaid=Math.max(0,booking.paid-effectiveTotal);
  const hasOutstandingBalance=balance>0;
  const amount=amountInput??balance;
  const shouldRecordPayment=hasOutstandingBalance&&recordPayment;
  const amountError=shouldRecordPayment
    ? !Number.isInteger(amount)||amount<0
      ? "Enter a whole PKR amount of 0 or more."
      : amount>balance
        ? `Amount cannot exceed the outstanding balance of ${formatPkr(balance)}.`
        : undefined
    : undefined;
  const paymentValid=!shouldRecordPayment||!amountError;
  const odometerValid=Number.isInteger(odometer)&&odometer>=checkoutOdometer;
  const lateChargeValid=!addLateCharge||(lateDuration.late&&Number.isInteger(lateCharge)&&lateCharge>0);
  const valid=odometerValid&&Boolean(conditionNotes.trim())&&paymentValid&&lateChargeValid&&!returnTimeError;
  const leftOnBalance=shouldRecordPayment?Math.max(0,balance-amount):balance;

  async function complete() {
    if (!valid||pending) return;
    setPending(true); setError("");
    const result=await checkInRentalAction(booking.id,{
      odometer,fuelLevel:fuel,conditionNotes,version:booking.version,
      returnedAt:useCurrentTime?undefined:returnedAt.toISOString(),
      payment:shouldRecordPayment&&amount>0?{amount,method,reference:reference.trim(),account:"Check-in counter",note:"Recorded during vehicle check-in"}:undefined,
      lateReturnCharge:addLateCharge&&lateDuration.late?{amount:lateCharge,method:"Cash",reference:`Late return · ${formatLateReturnDuration(lateDuration)} after agreed time`}:undefined,
    });
    setPending(false);
    if (!result.ok) { setError(result.error.message); return; }
    onComplete(result.data);
  }

  return <Shell title="Check in vehicle" description="Complete the return inspection, review any lateness, and post final cash movements." onClose={onClose}><div className="mt-5 grid gap-4 sm:grid-cols-2"><FormInput label="Return odometer (km)" type="number" min={checkoutOdometer} value={odometer||""} error={!odometerValid?`Enter a reading at or above the checkout reading (${checkoutOdometer.toLocaleString("en-PK")} km).`:undefined} onChange={e=>setOdometer(Number(e.target.value))}/><FormSelect label="Return fuel" value={fuel} onChange={e=>setFuel(e.target.value)} options={["Full","3/4","1/2","1/4","Empty"]}/><label className="sm:col-span-2 text-sm font-semibold text-[#344054]">Condition notes<textarea className="mt-1.5 min-h-24 w-full rounded-[9px] border border-[#D0D5DD] p-3 text-sm outline-none focus:border-[#006FE6] focus:ring-2 focus:ring-[#006FE6]/10" value={conditionNotes} onChange={e=>setConditionNotes(e.target.value)}/></label></div>
    <div className="mt-5 rounded-xl border border-[#E4E7EC] bg-[#F8FAFC] p-4"><div className="flex items-start gap-3"><CalendarClock className="mt-0.5 shrink-0 text-[#006FE6]" size={19}/><div className="min-w-0 flex-1"><p className="text-sm font-bold text-[#344054]">Actual return time</p><p className="mt-1 text-xs text-[#667085]">Agreed return: {new Date(booking.returnAt).toLocaleString("en-PK")}</p></div></div><div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-[#EEF2F6] p-1" role="group" aria-label="Return time source"><button type="button" aria-pressed={useCurrentTime} onClick={()=>setUseCurrentTime(true)} className={`min-h-10 rounded-md px-3 text-sm font-semibold ${useCurrentTime?"bg-white text-[#0058B8] shadow-sm":"text-[#667085]"}`}>Now (system time)</button><button type="button" aria-pressed={!useCurrentTime} onClick={()=>setUseCurrentTime(false)} className={`min-h-10 rounded-md px-3 text-sm font-semibold ${!useCurrentTime?"bg-white text-[#0058B8] shadow-sm":"text-[#667085]"}`}>Enter manually</button></div>{useCurrentTime?<p className="mt-3 text-sm font-semibold text-[#344054]">{new Date(currentTime).toLocaleString("en-PK")}</p>:<div className="mt-3"><FormInput label="Returned at" type="datetime-local" value={manualReturn} max={toLocal(new Date(currentTime).toISOString())} error={returnTimeError} onChange={e=>setManualReturn(e.target.value)}/></div>}</div>
    {earlyReturn.early&&<div className="mt-5 rounded-xl border border-[#ABEFC6] bg-[#ECFDF3] p-4"><div className="flex items-start gap-3"><CalendarCheck2 className="mt-0.5 shrink-0 text-[#067647]" size={19}/><div><p className="text-sm font-bold text-[#05603A]">Early return · {earlyReturn.usedDays} of {earlyReturn.bookedDays} day(s) used</p><p className="mt-1 text-xs text-[#475467]">The bill is reduced by {formatPkr(earlyReturn.reduction)} for {earlyReturn.unusedDays} unused day(s). New total: <strong>{formatPkr(effectiveTotal)}</strong> (was {formatPkr(total)}).</p>{overpaid>0&&<p className="mt-2 text-xs font-semibold text-[#93370D]">The customer has paid {formatPkr(overpaid)} more than the new total. Refund it from Finance after check-in.</p>}</div></div></div>}
    {lateDuration.late&&<div className="mt-5 rounded-xl border border-[#FEDF89] bg-[#FFFAEB] p-4"><div className="flex items-start gap-3"><ClockAlert className="mt-0.5 shrink-0 text-[#B54708]" size={19}/><div><p className="text-sm font-bold text-[#93370D]">Vehicle is late by {formatLateReturnDuration(lateDuration)}</p><p className="mt-1 text-xs text-[#667085]">Calculated from the actual return time above.</p></div></div><label className="mt-4 flex items-start gap-3"><input type="checkbox" className="mt-1" checked={addLateCharge} onChange={e=>setAddLateCharge(e.target.checked)}/><span><span className="block text-sm font-bold">Add a late-return cash charge</span><span className="mt-1 block text-xs text-[#667085]">This is added to booking extras and recorded as a separate income entry.</span></span></label>{addLateCharge&&<div className="mt-4"><FormInput label="Late charge (PKR)" type="number" min={1} value={lateCharge||""} error={lateChargeValid?undefined:"Enter a positive whole PKR amount."} onChange={e=>setLateCharge(Number(e.target.value))}/></div>}</div>}
    <div className="mt-5 rounded-xl border border-[#B2DDFF] bg-[#F5FAFF] p-4">{hasOutstandingBalance?<><label className="flex items-start gap-3"><input type="checkbox" className="mt-1" checked={recordPayment} onChange={e=>setRecordPayment(e.target.checked)}/><span><span className="flex items-center gap-2 text-sm font-bold"><CreditCard size={16}/>Record existing balance payment</span><span className="mt-1 block text-xs text-[#667085]">Optional. Outstanding before any late charge: {formatPkr(balance)}.</span></span></label>{recordPayment&&<div className="mt-4 grid gap-4 sm:grid-cols-2"><FormInput label="Amount (PKR)" type="number" min={0} max={balance} value={Number.isNaN(amount)?"":amount} error={amountError} aria-invalid={Boolean(amountError)} onChange={e=>setAmountInput(e.target.value===""?Number.NaN:Number(e.target.value))}/><FormSelect label="Method" value={method} onChange={e=>setMethod(e.target.value as PaymentMethod)} options={["Cash","Bank transfer","Card terminal","JazzCash","Easypaisa","Other wallet"]}/><div className="sm:col-span-2"><FormInput label="External reference (optional)" value={reference} onChange={e=>setReference(e.target.value)} placeholder="e.g. IBFT-90418"/></div></div>}{!amountError&&leftOnBalance>0&&<p role="status" className="mt-3 text-xs font-semibold text-[#175CD3]">{formatPkr(leftOnBalance)} will remain on {booking.customer}&apos;s balance.</p>}</>:<div className="flex items-start gap-3"><CreditCard className="mt-0.5 shrink-0 text-[#006FE6]" size={18}/><div><p className="text-sm font-bold text-[#344054]">Booking is fully paid</p><p className="mt-1 text-xs text-[#667085]">No existing balance is due. A selected late charge will still be posted separately.</p></div></div>}</div>{error&&<p role="alert" className="mt-4 rounded-lg bg-[#FEF3F2] p-3 text-sm text-[#B42318]">{error}</p>}<div className="mt-5 flex justify-end gap-2"><Button variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button><Button disabled={!valid||pending} onClick={()=>void complete()}>{pending?"Completing…":"Complete check-in"}</Button></div></Shell>;
}
