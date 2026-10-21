import "server-only";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { sqlite } from "@/db/connection";
import { getPrivateFileRoot } from "@/server/desktop/runtime-paths";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { setVehicleArchived } from "@/server/services/vehicle-service";

export type ArchiveKind="vehicle"|"customer"|"driver"|"guarantor";
export type ArchiveItem={id:string;kind:ArchiveKind;label:string;archivedAt:string;blockedBy:string[];deletionImpact?:{bookings:number;transactions:number;expenses:number;payouts:number;documents:number}};
const tables:Record<ArchiveKind,string>={vehicle:"vehicles",customer:"customers",driver:"drivers",guarantor:"guarantors"};
const labels:Record<ArchiveKind,string>={vehicle:"make || ' ' || model || ' · ' || plate",customer:"name || ' · ' || cnic_normalized",driver:"name || ' · ' || cnic_normalized",guarantor:"name || coalesce(' · ' || cnic_normalized,'')"};

function blockers(context:RequestContext,kind:ArchiveKind,id:string){
  const table=tables[kind];const found:string[]=[];
  const dependentTables=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {name:string}[];
  for(const dependent of dependentTables){
    const quoted=`"${dependent.name.replaceAll('"','""')}"`;
    const keys=sqlite.prepare(`PRAGMA foreign_key_list(${quoted})`).all() as Array<{table:string;from:string;on_delete:string}>;
    for(const key of keys.filter(item=>item.table===table&&item.on_delete.toUpperCase()!=="CASCADE")){
      const column=`"${key.from.replaceAll('"','""')}"`;
      const row=sqlite.prepare(`SELECT 1 FROM ${quoted} WHERE ${column}=? LIMIT 1`).get(id);
      if(row&&!found.includes(dependent.name.replaceAll("_"," ")))found.push(dependent.name.replaceAll("_"," "));
    }
  }
  const files=sqlite.prepare("SELECT 1 FROM private_files WHERE agency_id=? AND entity_type=? AND entity_id=? LIMIT 1").get(context.agencyId,kind,id);
  if(files)found.push("stored documents");
  if(kind==="guarantor"){
    const guarantor=sqlite.prepare("SELECT cnic_normalized AS cnic FROM guarantors WHERE agency_id=? AND id=?").get(context.agencyId,id) as {cnic:string}|undefined;
    if(guarantor&&sqlite.prepare("SELECT 1 FROM bookings WHERE agency_id=? AND replace(replace(guarantor_cnic,'-',''),' ','')=? LIMIT 1").get(context.agencyId,guarantor.cnic))found.push("booking guarantor snapshots");
  }
  return found;
}

function vehicleDeletionImpact(agencyId:string,id:string){
  const count=(sql:string,...args:string[])=> (sqlite.prepare(sql).get(...args) as {total:number}).total;
  return {
    bookings:count("SELECT count(*) AS total FROM bookings WHERE agency_id=? AND vehicle_id=?",agencyId,id),
    transactions:count("SELECT count(*) AS total FROM financial_transactions WHERE agency_id=? AND booking_id IN (SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=?)",agencyId,agencyId,id),
    expenses:count("SELECT count(*) AS total FROM expenses WHERE agency_id=? AND (vehicle_id=? OR booking_id IN (SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=?))",agencyId,id,agencyId,id),
    payouts:count("SELECT count(*) AS total FROM owner_payouts WHERE agency_id=? AND vehicle_id=?",agencyId,id)+count("SELECT count(*) AS total FROM source_payouts WHERE agency_id=? AND booking_id IN (SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=?)",agencyId,agencyId,id),
    documents:count("SELECT count(*) AS total FROM private_files WHERE agency_id=? AND ((entity_type='vehicle' AND entity_id=?) OR (entity_type='booking' AND entity_id IN (SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=?)))",agencyId,id,agencyId,id),
  };
}

export function listArchive(context:RequestContext):ArchiveItem[]{
  requireRole(context,["agency_owner","fleet_manager","rental_agent","accountant"]);
  return (Object.keys(tables) as ArchiveKind[]).flatMap(kind=>{
    const table=tables[kind];
    const rows=sqlite.prepare(`SELECT id,${labels[kind]} AS label,archived_at AS archivedAt FROM ${table} WHERE agency_id=? AND archived_at IS NOT NULL ORDER BY archived_at DESC`).all(context.agencyId) as Array<{id:string;label:string;archivedAt:string}>;
    return rows.map(row=>({...row,kind,blockedBy:kind==="vehicle"?[]:blockers(context,kind,row.id),deletionImpact:kind==="vehicle"?vehicleDeletionImpact(context.agencyId,row.id):undefined}));
  }).sort((a,b)=>b.archivedAt.localeCompare(a.archivedAt));
}

export function restoreArchived(context:RequestContext,kind:ArchiveKind,id:string){
  requireRole(context,["agency_owner","fleet_manager"]);
  if(!tables[kind])throw new DomainError("VALIDATION_FAILED","Choose a valid record type.",400);
  if(kind==="vehicle")return setVehicleArchived(context,id,false);
  return sqlite.transaction(()=>{
    const now=new Date().toISOString(),table=tables[kind];
    const result=sqlite.prepare(`UPDATE ${table} SET archived_at=NULL,${kind==="guarantor"?"":"status='active',"}updated_at=? WHERE agency_id=? AND id=? AND archived_at IS NOT NULL`).run(now,context.agencyId,id);
    if(!result.changes)throw new DomainError("NOT_FOUND","Archived record not found.",404);
    sqlite.prepare("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)").run(randomUUID(),context.agencyId,context.userId,`${kind}.restored`,kind,id,null,now);
    return {id};
  })();
}

export async function permanentlyDeleteArchived(context:RequestContext,kind:ArchiveKind,id:string){
  requireRole(context,["agency_owner"]);
  if(!tables[kind])throw new DomainError("VALIDATION_FAILED","Choose a valid record type.",400);
  const result=sqlite.transaction(()=>{
    const table=tables[kind];
    const row=sqlite.prepare(`SELECT id FROM ${table} WHERE agency_id=? AND id=? AND archived_at IS NOT NULL`).get(context.agencyId,id);
    if(!row)throw new DomainError("NOT_FOUND","Archived record not found.",404);
    const references=kind==="vehicle"?[]:blockers(context,kind,id);
    if(references.length)throw new DomainError("INVALID_STATUS_TRANSITION",`This record still has ${references.join(", ")} history. Keep it archived to preserve those records.`,409);
    let fileKeys:string[]=[];
    if(kind==="vehicle"){
      sqlite.prepare("UPDATE audit_events SET metadata=NULL WHERE agency_id=? AND entity_type='booking' AND entity_id IN (SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=?)").run(context.agencyId,context.agencyId,id);
      fileKeys=(sqlite.prepare("SELECT storage_key AS storageKey FROM private_files WHERE agency_id=? AND ((entity_type='vehicle' AND entity_id=?) OR (entity_type='booking' AND entity_id IN (SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=?)))").all(context.agencyId,id,context.agencyId,id) as Array<{storageKey:string}>).map(row=>row.storageKey);
      sqlite.prepare("DELETE FROM private_files WHERE agency_id=? AND ((entity_type='vehicle' AND entity_id=?) OR (entity_type='booking' AND entity_id IN (SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=?)))").run(context.agencyId,id,context.agencyId,id);
      for(const table of ["financial_transactions","source_payouts","rental_inspections"]){
        sqlite.prepare(`DELETE FROM ${table} WHERE agency_id=? AND booking_id IN (SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=?)`).run(context.agencyId,context.agencyId,id);
      }
      sqlite.prepare("DELETE FROM vehicle_service_records WHERE agency_id=? AND vehicle_id=?").run(context.agencyId,id);
      sqlite.prepare("DELETE FROM expenses WHERE agency_id=? AND (vehicle_id=? OR booking_id IN (SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=?))").run(context.agencyId,id,context.agencyId,id);
      sqlite.prepare("DELETE FROM recurring_expenses WHERE agency_id=? AND vehicle_id=?").run(context.agencyId,id);
      sqlite.prepare("DELETE FROM owner_payouts WHERE agency_id=? AND vehicle_id=?").run(context.agencyId,id);
      sqlite.prepare("DELETE FROM availability_blocks WHERE agency_id=? AND vehicle_id=?").run(context.agencyId,id);
      sqlite.prepare("DELETE FROM bookings WHERE agency_id=? AND vehicle_id=?").run(context.agencyId,id);
    }
    sqlite.prepare(`DELETE FROM ${table} WHERE agency_id=? AND id=? AND archived_at IS NOT NULL`).run(context.agencyId,id);
    sqlite.prepare("UPDATE audit_events SET metadata=NULL WHERE agency_id=? AND entity_type=? AND entity_id=?").run(context.agencyId,kind,id);
    sqlite.prepare("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)").run(randomUUID(),context.agencyId,context.userId,`${kind}.permanently_deleted`,kind,id,null,new Date().toISOString());
    return {id,fileKeys};
  }).immediate();
  const root=path.resolve(getPrivateFileRoot());
  const cleanup=await Promise.allSettled(result.fileKeys.map(key=>{
    const target=path.resolve(root,key);
    if(!target.startsWith(`${root}${path.sep}`))return Promise.reject(new Error("Invalid file path"));
    return unlink(target);
  }));
  return {id,filesNotRemoved:cleanup.filter(item=>item.status==="rejected"&&!(item.reason instanceof Error&&"code" in item.reason&&item.reason.code==="ENOENT")).length};
}
