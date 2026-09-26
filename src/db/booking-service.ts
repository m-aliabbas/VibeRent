import { randomUUID } from "node:crypto";
import { sqlite } from "@/db/connection";

export type ConfirmBookingInput = { agencyId:string; branchId:string; vehicleId:string; customerId:string; pickupAt:string; returnAt:string; dailyRate:number; totalAmount:number; depositRequired:number; source:string; notes?:string };
export class AvailabilityConflictError extends Error { constructor(public conflict:string){super(`Vehicle is unavailable: ${conflict}`);this.name="AvailabilityConflictError"} }

export function confirmBooking(input:ConfirmBookingInput){
  if(new Date(input.returnAt)<=new Date(input.pickupAt)) throw new Error("Return time must be after pickup time.");
  return sqlite.transaction((value:ConfirmBookingInput)=>{
    const bookingConflict=sqlite.prepare(`SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=? AND status IN ('confirmed','checked_out') AND pickup_at < ? AND return_at > ? LIMIT 1`).get(value.agencyId,value.vehicleId,value.returnAt,value.pickupAt) as {id:string}|undefined;
    if(bookingConflict) throw new AvailabilityConflictError(bookingConflict.id);
    const blockConflict=sqlite.prepare(`SELECT id, reason FROM availability_blocks WHERE agency_id=? AND vehicle_id=? AND start_at < ? AND end_at > ? LIMIT 1`).get(value.agencyId,value.vehicleId,value.returnAt,value.pickupAt) as {id:string;reason:string}|undefined;
    if(blockConflict) throw new AvailabilityConflictError(`${blockConflict.id} · ${blockConflict.reason}`);
    const id=`BKG-${randomUUID().slice(0,8).toUpperCase()}`;
    const now=new Date().toISOString();
    sqlite.prepare(`INSERT INTO bookings (id,agency_id,branch_id,vehicle_id,customer_id,pickup_at,return_at,status,daily_rate,total_amount,deposit_required,source,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'confirmed',?,?,?,?,?,?,?)`).run(id,value.agencyId,value.branchId,value.vehicleId,value.customerId,value.pickupAt,value.returnAt,value.dailyRate,value.totalAmount,value.depositRequired,value.source,value.notes??null,now,now);
    sqlite.prepare(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(),value.agencyId,null,"booking.confirmed","booking",id,JSON.stringify({vehicleId:value.vehicleId,pickupAt:value.pickupAt,returnAt:value.returnAt}),now);
    return {id,status:"confirmed" as const};
  }).immediate(input);
}
