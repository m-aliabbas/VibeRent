import "server-only";
import { randomUUID } from "node:crypto";
import { sqlite } from "@/db/connection";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";

export type ExternalVehicleDto={id:string;supplierName:string;supplierPhone:string;make:string;model:string;year:number;plate:string;color:string;version:number};
const select="SELECT id,supplier_name AS supplierName,supplier_phone AS supplierPhone,make,model,year,plate,coalesce(color,'') AS color,version FROM external_vehicles";

export function listExternalVehicles(context:RequestContext):ExternalVehicleDto[]{
  requireRole(context,["agency_owner","fleet_manager","rental_agent"]);
  return sqlite.prepare(`${select} WHERE agency_id=? AND archived_at IS NULL ORDER BY make,model,plate`).all(context.agencyId) as ExternalVehicleDto[];
}

export function saveExternalVehicle(context:RequestContext,raw:unknown):ExternalVehicleDto{
  requireRole(context,["agency_owner","fleet_manager","rental_agent"]);
  if(!raw||typeof raw!=="object")throw new DomainError("VALIDATION_FAILED","Enter valid source car details.",400);
  const input=raw as Partial<ExternalVehicleDto>;
  const supplierName=input.supplierName?.trim()??"",supplierPhone=input.supplierPhone?.trim()??"",make=input.make?.trim()??"",model=input.model?.trim()??"",plate=input.plate?.trim().toUpperCase()??"",color=input.color?.trim()??"";
  const errors:Record<string,string>={};
  if(supplierName.length<2)errors.supplierName="Enter the supplier name.";
  if(!/^(?:\+?92|0)?3\d{9}$/.test(supplierPhone.replace(/[\s-]/g,"")))errors.supplierPhone="Enter a Pakistani mobile number.";
  if(make.length<2)errors.make="Enter the car make.";
  if(model.length<1)errors.model="Enter the car model.";
  if(!plate)errors.plate="Enter the registration number.";
  if(!Number.isInteger(input.year)||input.year!<1980||input.year!>new Date().getFullYear()+1)errors.year="Enter a valid model year.";
  if(Object.keys(errors).length)throw new DomainError("VALIDATION_FAILED","Review the source car details.",400,errors);
  return sqlite.transaction(()=>{
    const id=input.id?.trim()||`xveh_${randomUUID()}`;
    const current=sqlite.prepare("SELECT id FROM external_vehicles WHERE agency_id=? AND id=? AND archived_at IS NULL").get(context.agencyId,id);
    if(input.id&&!current)throw new DomainError("NOT_FOUND","Source car not found.",404);
    const duplicate=sqlite.prepare("SELECT id FROM external_vehicles WHERE agency_id=? AND plate=? AND id<>?").get(context.agencyId,plate,id);
    if(duplicate)throw new DomainError("VALIDATION_FAILED","This registration number is already saved.",409,{plate:"Use the existing source car or edit it."});
    const now=new Date().toISOString();
    if(current)sqlite.prepare("UPDATE external_vehicles SET supplier_name=?,supplier_phone=?,make=?,model=?,year=?,plate=?,color=?,version=version+1,updated_at=? WHERE agency_id=? AND id=?").run(supplierName,supplierPhone,make,model,input.year,plate,color||null,now,context.agencyId,id);
    else sqlite.prepare("INSERT INTO external_vehicles (id,agency_id,supplier_name,supplier_phone,make,model,year,plate,color,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(id,context.agencyId,supplierName,supplierPhone,make,model,input.year,plate,color||null,now,now);
    sqlite.prepare("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)").run(randomUUID(),context.agencyId,context.userId,current?"external_vehicle.updated":"external_vehicle.created","external_vehicle",id,null,now);
    return sqlite.prepare(`${select} WHERE agency_id=? AND id=?`).get(context.agencyId,id) as ExternalVehicleDto;
  }).immediate();
}

export function archiveExternalVehicle(context:RequestContext,id:string){
  requireRole(context,["agency_owner","fleet_manager"]);
  return sqlite.transaction(()=>{
    const now=new Date().toISOString();
    const result=sqlite.prepare("UPDATE external_vehicles SET archived_at=?,updated_at=? WHERE agency_id=? AND id=? AND archived_at IS NULL").run(now,now,context.agencyId,id);
    if(!result.changes)throw new DomainError("NOT_FOUND","Source car not found.",404);
    sqlite.prepare("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)").run(randomUUID(),context.agencyId,context.userId,"external_vehicle.archived","external_vehicle",id,null,now);
    return {id};
  }).immediate();
}
