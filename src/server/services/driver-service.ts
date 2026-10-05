import "server-only";

import { randomUUID } from "node:crypto";
import { sqlite } from "@/db/connection";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { normalizePakistanPhone } from "@/server/whatsapp/pakistan-phone";

export type DriverDto={id:string;name:string;phone:string;cnic:string;address:string;licenseNumber:string;licenseExpiresAt:string|null;status:string};

export function listDrivers(context:RequestContext):DriverDto[]{
  requireRole(context,["agency_owner","fleet_manager","rental_agent"]);
  return sqlite.prepare(`SELECT id,name,phone_normalized AS phone,cnic_normalized AS cnic,address,license_number AS licenseNumber,license_expires_at AS licenseExpiresAt,status FROM drivers WHERE agency_id=? AND archived_at IS NULL ORDER BY status,name`).all(context.agencyId) as DriverDto[];
}

export function saveDriver(context:RequestContext,raw:unknown):DriverDto{
  requireRole(context,["agency_owner","fleet_manager"]);
  const input=raw as Partial<DriverDto>;const errors:Record<string,string>={};
  const name=input.name?.trim()??"",address=input.address?.trim()??"",licenseNumber=input.licenseNumber?.trim().toUpperCase()??"",cnic=(input.cnic??"").replace(/\D/g,"");
  let phone="";try{phone=normalizePakistanPhone(input.phone??"")}catch{errors.phone="Enter a valid Pakistani mobile number."}
  if(name.length<2)errors.name="Enter the driver's full name.";
  if(cnic.length!==13)errors.cnic="Enter a 13-digit CNIC.";
  if(address.length<5)errors.address="Enter the driver's address.";
  if(!licenseNumber)errors.licenseNumber="Driving licence number is required.";
  if(Object.keys(errors).length)throw new DomainError("VALIDATION_FAILED","Review the driver details.",400,errors);
  const now=new Date().toISOString(),id=input.id?.trim()||`drv_${randomUUID()}`;
  const duplicate=sqlite.prepare(`SELECT id FROM drivers WHERE agency_id=? AND cnic_normalized=? AND id<>?`).get(context.agencyId,cnic,id);
  if(duplicate)throw new DomainError("VALIDATION_FAILED","A driver with this CNIC already exists.",409,{cnic:"CNIC must be unique."});
  sqlite.transaction(()=>{
    sqlite.prepare(`INSERT INTO drivers (id,agency_id,name,phone_normalized,cnic_normalized,address,license_number,license_expires_at,status,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,phone_normalized=excluded.phone_normalized,cnic_normalized=excluded.cnic_normalized,address=excluded.address,license_number=excluded.license_number,license_expires_at=excluded.license_expires_at,status=excluded.status,version=drivers.version+1,updated_at=excluded.updated_at`).run(id,context.agencyId,name,phone,cnic,address,licenseNumber,input.licenseExpiresAt||null,input.status==="inactive"?"inactive":"active",now,now);
    sqlite.prepare(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(),context.agencyId,context.userId,"driver.saved","driver",id,JSON.stringify({status:input.status??"active"}),now);
  })();
  return listDrivers(context).find(item=>item.id===id)!;
}
