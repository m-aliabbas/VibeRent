import "server-only";
import { randomUUID } from "node:crypto";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { setVehicleArchived } from "@/server/services/vehicle-service";

export type ArchiveKind="vehicle"|"customer"|"driver"|"guarantor";
export type ArchiveItem={id:string;kind:ArchiveKind;label:string;archivedAt:string;blockedBy:string[];deletionImpact?:{bookings:number;transactions:number;expenses:number;payouts:number;documents:number}};
const tables:Record<ArchiveKind,string>={vehicle:"vehicles",customer:"customers",driver:"drivers",guarantor:"guarantors"};
const labels:Record<ArchiveKind,string>={vehicle:"make || ' ' || model || ' · ' || plate",customer:"name || ' · ' || cnic_normalized",driver:"name || ' · ' || cnic_normalized",guarantor:"name || coalesce(' · ' || cnic_normalized,'')"};
const kinds=Object.keys(tables) as ArchiveKind[];
function tableFor(kind:ArchiveKind){if(!kinds.includes(kind))throw new DomainError("VALIDATION_FAILED","Choose a valid record type.",400);return tables[kind]}
async function count(sql:string,args:unknown[]){return (await queryOne<{total:number}>(sql,args))?.total??0}
async function blockers(context:RequestContext,kind:ArchiveKind,id:string){
  const agency=context.agencyId,found:string[]=[];
  const references:Record<ArchiveKind,Array<[string,string,unknown[]]>>={
    vehicle:[["bookings","SELECT count(*) AS total FROM bookings WHERE agency_id=? AND vehicle_id=?",[agency,id]],["expenses","SELECT count(*) AS total FROM expenses WHERE agency_id=? AND vehicle_id=?",[agency,id]],["owner payouts","SELECT count(*) AS total FROM owner_payouts WHERE agency_id=? AND vehicle_id=?",[agency,id]],["availability blocks","SELECT count(*) AS total FROM availability_blocks WHERE agency_id=? AND vehicle_id=?",[agency,id]],["rate rules","SELECT count(*) AS total FROM vehicle_rate_rules WHERE agency_id=? AND vehicle_id=?",[agency,id]]],
    customer:[["bookings","SELECT count(*) AS total FROM bookings WHERE agency_id=? AND customer_id=?",[agency,id]],["expenses","SELECT count(*) AS total FROM expenses WHERE agency_id=? AND customer_id=?",[agency,id]]],
    driver:[["bookings","SELECT count(*) AS total FROM bookings WHERE agency_id=? AND driver_id=?",[agency,id]]],
    guarantor:[],
  };
  for(const [label,sql,args] of references[kind])if(await count(sql,args))found.push(label);
  if(await count("SELECT count(*) AS total FROM private_files WHERE agency_id=? AND entity_type=? AND entity_id=?",[agency,kind,id]))found.push("stored documents");
  if(kind==="guarantor"){
    const row=await queryOne<{cnic:string|null}>("SELECT cnic_normalized AS cnic FROM guarantors WHERE agency_id=? AND id=?",[agency,id]);
    if(row?.cnic&&await count("SELECT count(*) AS total FROM bookings WHERE agency_id=? AND replace(replace(guarantor_cnic,'-',''),' ','')=?",[agency,row.cnic]))found.push("booking guarantor snapshots");
  }
  return found;
}
async function vehicleDeletionImpact(agency:string,id:string){
  const bookings=await count("SELECT count(*) AS total FROM bookings WHERE agency_id=? AND vehicle_id=?",[agency,id]);
  const transactions=await count("SELECT count(*) AS total FROM financial_transactions WHERE agency_id=? AND booking_id IN (SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=?)",[agency,agency,id]);
  const expenses=await count("SELECT count(*) AS total FROM expenses WHERE agency_id=? AND vehicle_id=?",[agency,id]);
  const payouts=await count("SELECT count(*) AS total FROM owner_payouts WHERE agency_id=? AND vehicle_id=?",[agency,id]);
  const documents=await count("SELECT count(*) AS total FROM private_files WHERE agency_id=? AND entity_type='vehicle' AND entity_id=?",[agency,id]);
  return {bookings,transactions,expenses,payouts,documents};
}
export async function listArchive(context:RequestContext):Promise<ArchiveItem[]>{
  requireRole(context,["agency_owner","fleet_manager","rental_agent","accountant"]);
  const groups=await Promise.all(kinds.map(async kind=>{
    const rows=await queryAll<{id:string;label:string;archivedAt:string}>(`SELECT id,${labels[kind]} AS label,archived_at AS archivedAt FROM ${tables[kind]} WHERE agency_id=? AND archived_at IS NOT NULL ORDER BY archived_at DESC`,[context.agencyId]);
    return Promise.all(rows.map(async row=>({...row,kind,blockedBy:await blockers(context,kind,row.id),deletionImpact:kind==="vehicle"?await vehicleDeletionImpact(context.agencyId,row.id):undefined})));
  }));
  return groups.flat().sort((a,b)=>b.archivedAt.localeCompare(a.archivedAt));
}
export async function restoreArchived(context:RequestContext,kind:ArchiveKind,id:string){
  requireRole(context,["agency_owner","fleet_manager"]);
  const table=tableFor(kind);
  if(kind==="vehicle")return setVehicleArchived(context,id,false);
  return inTransaction(async()=>{
    const now=new Date().toISOString();
    const status=kind==="guarantor"?"":"status='active',";
    const result=await execute(`UPDATE ${table} SET archived_at=NULL,${status}updated_at=? WHERE agency_id=? AND id=? AND archived_at IS NOT NULL`,[now,context.agencyId,id]);
    if(!result.changes)throw new DomainError("NOT_FOUND","Archived record not found.",404);
    await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",[randomUUID(),context.agencyId,context.userId,`${kind}.restored`,kind,id,null,now]);
    return {id};
  },{immediate:true});
}
export async function permanentlyDeleteArchived(context:RequestContext,kind:ArchiveKind,id:string){
  requireRole(context,["agency_owner"]);
  const table=tableFor(kind);
  return inTransaction(async()=>{
    const row=await queryOne(`SELECT id FROM ${table} WHERE agency_id=? AND id=? AND archived_at IS NOT NULL`,[context.agencyId,id]);
    if(!row)throw new DomainError("NOT_FOUND","Archived record not found.",404);
    const references=await blockers(context,kind,id);
    if(references.length)throw new DomainError("INVALID_STATUS_TRANSITION",`This record still has ${references.join(", ")} history. Keep it archived to preserve those records.`,409);
    const result=await execute(`DELETE FROM ${table} WHERE agency_id=? AND id=? AND archived_at IS NOT NULL`,[context.agencyId,id]);
    if(!result.changes)throw new DomainError("NOT_FOUND","Archived record not found.",404);
    await execute("UPDATE audit_events SET metadata=NULL WHERE agency_id=? AND entity_type=? AND entity_id=?",[context.agencyId,kind,id]);
    await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",[randomUUID(),context.agencyId,context.userId,`${kind}.permanently_deleted`,kind,id,null,new Date().toISOString()]);
    return {id,filesNotRemoved:0};
  },{immediate:true});
}
