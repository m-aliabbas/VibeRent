import "server-only";
import { randomUUID } from "node:crypto";
import { execute, inTransaction, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { getLastVehicleOdometer } from "@/server/services/booking-service";

export async function updateVehicleOdometer(context:RequestContext,vehicleId:string,input:{odometer:number;note?:string}) {
  requireRole(context,["agency_owner","fleet_manager","rental_agent"]);
  if(!input||!Number.isSafeInteger(input.odometer)||input.odometer<0)throw new DomainError("VALIDATION_FAILED","Enter a valid whole odometer reading.",400);
  return inTransaction(async()=>{
    const vehicle=await queryOne("SELECT id FROM vehicles WHERE agency_id=? AND id=? AND archived_at IS NULL",[context.agencyId,vehicleId]);
    if(!vehicle)throw new DomainError("NOT_FOUND","Vehicle not found.",404);
    const previous=await getLastVehicleOdometer(context.agencyId,vehicleId);
    if(previous!==undefined&&input.odometer<previous)throw new DomainError("VALIDATION_FAILED",`Reading cannot be below the latest ${previous.toLocaleString("en-PK")} km.`,400);
    const now=new Date().toISOString(),id=`ODO-${randomUUID().slice(0,8).toUpperCase()}`;
    await execute("INSERT INTO vehicle_service_records (id,agency_id,vehicle_id,kind,serviced_on,odometer,cost,workshop,notes,actor_id,created_at,updated_at) VALUES (?,?,?,'odometer_update',?,?,0,'Manual update',?,?,?,?)",[id,context.agencyId,vehicleId,now.slice(0,10),input.odometer,input.note?.trim()||null,context.userId,now,now]);
    await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",[randomUUID(),context.agencyId,context.userId,"vehicle.odometer_updated","vehicle",vehicleId,JSON.stringify({recordId:id,previous,odometer:input.odometer,note:input.note?.trim()||""}),now]);
    return {id,odometer:input.odometer};
  },{immediate:true});
}
