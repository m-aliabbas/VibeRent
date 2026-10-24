import "server-only";

import { randomUUID } from "node:crypto";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { normalizePakistanPhone } from "@/server/whatsapp/pakistan-phone";

export type DriverDto={id:string;name:string;phone:string;cnic:string;address:string;licenseNumber:string;licenseExpiresAt:string|null;status:string};

export async function listDrivers(context:RequestContext):Promise<DriverDto[]>{
  requireRole(context,["agency_owner","fleet_manager","rental_agent"]);
  return queryAll<DriverDto>(`SELECT id,name,phone_normalized AS phone,cnic_normalized AS cnic,address,license_number AS licenseNumber,license_expires_at AS licenseExpiresAt,status FROM drivers WHERE agency_id=? AND archived_at IS NULL ORDER BY status,name`,[context.agencyId]);
}

export async function saveDriver(context:RequestContext,raw:unknown):Promise<DriverDto>{
  requireRole(context,["agency_owner","fleet_manager"]);
  const input=raw as Partial<DriverDto>;const errors:Record<string,string>={};
  const name=input.name?.trim()??"",address=input.address?.trim()??"",licenseNumber=input.licenseNumber?.trim().toUpperCase()??"",cnic=(input.cnic??"").replace(/\D/g,"");
  let phone="";if(input.phone?.trim())try{phone=normalizePakistanPhone(input.phone)}catch{errors.phone="Enter a valid Pakistani mobile number."}
  if(name.length<2)errors.name="Enter the driver's full name.";
  if(cnic.length!==0&&cnic.length!==13)errors.cnic="Enter a 13-digit CNIC, or leave it blank.";
  if(address&&address.length<5)errors.address="Enter at least 5 address characters, or leave it blank.";
  if(Object.keys(errors).length)throw new DomainError("VALIDATION_FAILED","Review the driver details.",400,errors);
  const now=new Date().toISOString(),id=input.id?.trim()||`drv_${randomUUID()}`;
  const current=input.id?await queryOne("SELECT id FROM drivers WHERE agency_id=? AND id=? AND archived_at IS NULL",[context.agencyId,id]):null;
  if(input.id&&!current)throw new DomainError("NOT_FOUND","Driver not found.",404);
  const duplicate=cnic?await queryOne(`SELECT id FROM drivers WHERE agency_id=? AND cnic_normalized=? AND id<>?`,[context.agencyId,cnic,id]):undefined;
  if(duplicate)throw new DomainError("VALIDATION_FAILED","A driver with this CNIC already exists.",409,{cnic:"CNIC must be unique."});
  await inTransaction(async()=>{
    if(current)await execute("UPDATE drivers SET name=?,phone_normalized=?,cnic_normalized=?,address=?,license_number=?,license_expires_at=?,status=?,version=version+1,updated_at=? WHERE agency_id=? AND id=? AND archived_at IS NULL",[name,phone,cnic,address,licenseNumber,input.licenseExpiresAt||null,input.status==="inactive"?"inactive":"active",now,context.agencyId,id]);
    else await execute("INSERT INTO drivers (id,agency_id,name,phone_normalized,cnic_normalized,address,license_number,license_expires_at,status,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)",[id,context.agencyId,name,phone,cnic,address,licenseNumber,input.licenseExpiresAt||null,input.status==="inactive"?"inactive":"active",now,now]);
    await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,[randomUUID(),context.agencyId,context.userId,"driver.saved","driver",id,JSON.stringify({status:input.status??"active"}),now]);
  });
  return (await listDrivers(context)).find(item=>item.id===id)!;
}

export async function archiveDriver(context:RequestContext,id:string){
  requireRole(context,["agency_owner","fleet_manager"]);
  return inTransaction(async()=>{
    const driver=await queryOne<{id:string;name:string}>("SELECT id,name FROM drivers WHERE agency_id=? AND id=? AND archived_at IS NULL LIMIT 1",[context.agencyId,id]);
    if(!driver)throw new DomainError("NOT_FOUND","Driver not found.",404);
    const activeBooking=await queryOne("SELECT id FROM bookings WHERE agency_id=? AND driver_id=? AND archived_at IS NULL AND status IN ('confirmed','checked_out') LIMIT 1",[context.agencyId,id]);
    if(activeBooking)throw new DomainError("INVALID_STATUS_TRANSITION","Cancel, complete, or reassign the driver's active booking before deleting this driver.",409);
    const now=new Date().toISOString();
    await execute("UPDATE drivers SET status='archived',archived_at=?,version=version+1,updated_at=? WHERE agency_id=? AND id=?",[now,now,context.agencyId,id]);
    await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",[randomUUID(),context.agencyId,context.userId,"driver.archived","driver",id,JSON.stringify({name:driver.name}),now]);
    return {id};
  },{immediate:true});
}
