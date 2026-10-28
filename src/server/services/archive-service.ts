import "server-only";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { getPrivateFileRoot } from "@/server/desktop/runtime-paths";
import { deleteVehicle, getVehicleDeletionImpact, setVehicleArchived, type VehicleDeletionImpact } from "@/server/services/vehicle-service";

export type ArchiveKind="booking"|"vehicle"|"customer"|"owner"|"driver"|"guarantor";
export const archiveKinds:ArchiveKind[]=["booking","vehicle","customer","owner","driver","guarantor"];
export type ArchiveItem={id:string;kind:ArchiveKind;label:string;detail:string;archivedAt:string;blockedBy:string[];restoreBlockedBy?:string;historyKept?:boolean;deletionImpact?:VehicleDeletionImpact};
type ArchiveRow={id:string;label:string;detail:string|null;archivedAt:string;status?:string|null;reason?:string|null};

// Each kind lists its archived rows with a human label and a secondary detail line.
const listSql:Record<ArchiveKind,string>={
  booking:`SELECT b.id,'Booking #' || coalesce(CAST(b.public_number AS TEXT),b.id) || ' · ' || c.name AS label,
      coalesce(v.make || ' ' || v.model || ' · ' || v.plate,b.external_vehicle_make || ' ' || b.external_vehicle_model,'No vehicle') || ' · ' || substr(b.pickup_at,1,10) AS detail,
      b.archived_at AS archivedAt,b.status,b.cancellation_reason AS reason
    FROM bookings b JOIN customers c ON c.id=b.customer_id AND c.agency_id=b.agency_id LEFT JOIN vehicles v ON v.id=b.vehicle_id AND v.agency_id=b.agency_id
    WHERE b.agency_id=? AND b.archived_at IS NOT NULL`,
  vehicle:"SELECT id,make || ' ' || model || ' · ' || plate AS label,CAST(year AS TEXT) AS detail,archived_at AS archivedAt,status FROM vehicles WHERE agency_id=? AND archived_at IS NOT NULL",
  customer:"SELECT id,name AS label,phone_normalized AS detail,archived_at AS archivedAt FROM customers WHERE agency_id=? AND archived_at IS NOT NULL",
  owner:"SELECT id,name AS label,phone AS detail,updated_at AS archivedAt FROM owners WHERE agency_id=? AND status='archived'",
  driver:"SELECT id,name AS label,phone_normalized AS detail,archived_at AS archivedAt FROM drivers WHERE agency_id=? AND archived_at IS NOT NULL",
  guarantor:"SELECT id,name AS label,phone_normalized AS detail,archived_at AS archivedAt FROM guarantors WHERE agency_id=? AND archived_at IS NOT NULL",
};
function assertKind(kind:ArchiveKind){if(!archiveKinds.includes(kind))throw new DomainError("VALIDATION_FAILED","Choose a valid record type.",400)}
async function count(sql:string,args:unknown[]){return (await queryOne<{total:number}>(sql,args))?.total??0}
async function audit(context:RequestContext,action:string,kind:ArchiveKind,id:string,now:string){
  await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",[randomUUID(),context.agencyId,context.userId,action,kind,id,null,now]);
}
/** Records that must survive, which block permanently deleting the archived row. Vehicles and bookings never block: their delete flows remove or detach history explicitly. */
async function blockers(context:RequestContext,kind:ArchiveKind,id:string){
  const agency=context.agencyId,found:string[]=[];
  const references:Record<ArchiveKind,Array<[string,string,unknown[]]>>={
    booking:[],
    vehicle:[],
    customer:[["bookings","SELECT count(*) AS total FROM bookings WHERE agency_id=? AND customer_id=?",[agency,id]],["expenses","SELECT count(*) AS total FROM expenses WHERE agency_id=? AND customer_id=?",[agency,id]]],
    owner:[["vehicles","SELECT count(*) AS total FROM vehicles WHERE agency_id=? AND owner_id=?",[agency,id]],["owner payouts","SELECT count(*) AS total FROM owner_payouts WHERE agency_id=? AND owner_id=?",[agency,id]],["expenses","SELECT count(*) AS total FROM expenses WHERE agency_id=? AND owner_id=?",[agency,id]],["recurring expenses","SELECT count(*) AS total FROM recurring_expenses WHERE agency_id=? AND owner_id=?",[agency,id]]],
    driver:[["bookings","SELECT count(*) AS total FROM bookings WHERE agency_id=? AND driver_id=?",[agency,id]]],
    guarantor:[],
  };
  for(const [label,sql,args] of references[kind])if(await count(sql,args))found.push(label);
  if(!["booking","vehicle"].includes(kind)&&await count("SELECT count(*) AS total FROM private_files WHERE agency_id=? AND entity_type=? AND entity_id=?",[agency,kind,id]))found.push("stored documents");
  if(kind==="guarantor"){
    const row=await queryOne<{cnic:string|null}>("SELECT cnic_normalized AS cnic FROM guarantors WHERE agency_id=? AND id=?",[agency,id]);
    if(row?.cnic&&await count("SELECT count(*) AS total FROM bookings WHERE agency_id=? AND replace(replace(guarantor_cnic,'-',''),' ','')=?",[agency,row.cnic]))found.push("booking guarantor snapshots");
  }
  return found;
}
function isErroneous(row:{reason?:string|null}){return Boolean(row.reason?.startsWith("Erroneous:"))}

export async function listArchive(context:RequestContext):Promise<ArchiveItem[]>{
  requireRole(context,["agency_owner","fleet_manager","rental_agent","accountant"]);
  const groups=await Promise.all(archiveKinds.map(async kind=>{
    const rows=await queryAll<ArchiveRow>(listSql[kind],[context.agencyId]);
    return Promise.all(rows.map(async (row):Promise<ArchiveItem>=>({
      id:row.id,kind,label:row.label,detail:row.detail??"",archivedAt:row.archivedAt,
      blockedBy:await blockers(context,kind,row.id),
      restoreBlockedBy:kind==="booking"&&isErroneous(row)?"Marked erroneous: its payments were reversed in the ledger.":undefined,
      historyKept:kind==="vehicle"&&row.status==="deleted"?true:undefined,
      deletionImpact:kind==="vehicle"?await getVehicleDeletionImpact(context.agencyId,row.id):undefined,
    })));
  }));
  return groups.flat().sort((a,b)=>b.archivedAt.localeCompare(a.archivedAt));
}

export async function restoreArchived(context:RequestContext,kind:ArchiveKind,id:string){
  requireRole(context,["agency_owner","fleet_manager"]);
  assertKind(kind);
  if(kind==="vehicle")return setVehicleArchived(context,id,false);
  return inTransaction(async()=>{
    const now=new Date().toISOString();
    let changes=0;
    if(kind==="booking"){
      const booking=await queryOne<{reason:string|null}>("SELECT cancellation_reason AS reason FROM bookings WHERE agency_id=? AND id=? AND archived_at IS NOT NULL",[context.agencyId,id]);
      if(booking&&isErroneous(booking))throw new DomainError("INVALID_STATUS_TRANSITION","This booking was marked erroneous and its payments were reversed, so it cannot be restored.",409);
      changes=(await execute("UPDATE bookings SET archived_at=NULL,version=version+1,updated_at=? WHERE agency_id=? AND id=? AND archived_at IS NOT NULL",[now,context.agencyId,id])).changes;
    }else if(kind==="owner"){
      changes=(await execute("UPDATE owners SET status='active',version=version+1,updated_at=? WHERE agency_id=? AND id=? AND status='archived'",[now,context.agencyId,id])).changes;
    }else{
      const table={customer:"customers",driver:"drivers",guarantor:"guarantors"}[kind];
      const status=kind==="guarantor"?"":"status='active',";
      changes=(await execute(`UPDATE ${table} SET archived_at=NULL,${status}updated_at=? WHERE agency_id=? AND id=? AND archived_at IS NOT NULL`,[now,context.agencyId,id])).changes;
    }
    if(!changes)throw new DomainError("NOT_FOUND","Archived record not found.",404);
    await audit(context,`${kind}.restored`,kind,id,now);
    return {id};
  },{immediate:true});
}

/** Removes an archived booking with its own payments, inspections, and notices. Linked expenses stay as unlinked vehicle costs. */
async function deleteArchivedBooking(context:RequestContext,id:string){
  const agency=context.agencyId;
  const deliveries="SELECT id FROM notification_deliveries WHERE agency_id=? AND entity_type='booking' AND entity_id=?";
  const files=await queryAll<{id:string;storageKey:string}>(`SELECT id,storage_key AS storageKey FROM private_files WHERE agency_id=? AND ((entity_type='booking' AND entity_id=?) OR (entity_type='notification' AND entity_id IN (${deliveries})))`,[agency,id,agency,id]);
  for(const file of files)await execute("DELETE FROM private_files WHERE agency_id=? AND id=?",[agency,file.id]);
  await execute(`DELETE FROM notification_deliveries WHERE id IN (${deliveries})`,[agency,id]);
  await execute("UPDATE expenses SET booking_id=NULL,updated_at=? WHERE agency_id=? AND booking_id=?",[new Date().toISOString(),agency,id]);
  await execute("DELETE FROM source_payouts WHERE agency_id=? AND booking_id=?",[agency,id]);
  await execute("DELETE FROM rental_inspections WHERE agency_id=? AND booking_id=?",[agency,id]);
  await execute("UPDATE financial_transactions SET linked_transaction_id=NULL WHERE agency_id=? AND booking_id=?",[agency,id]);
  await execute("DELETE FROM financial_transactions WHERE agency_id=? AND booking_id=?",[agency,id]);
  const changes=(await execute("DELETE FROM bookings WHERE agency_id=? AND id=? AND archived_at IS NOT NULL",[agency,id])).changes;
  return {changes,storageKeys:files.map(file=>file.storageKey)};
}

export async function permanentlyDeleteArchived(context:RequestContext,kind:ArchiveKind,id:string,options:{deleteHistory?:boolean}={}){
  requireRole(context,["agency_owner"]);
  assertKind(kind);
  if(kind==="vehicle"){
    const vehicle=await queryOne<{status:string}>("SELECT status FROM vehicles WHERE agency_id=? AND id=? AND archived_at IS NOT NULL",[context.agencyId,id]);
    if(!vehicle)throw new DomainError("NOT_FOUND","Archived record not found.",404);
    const result=await deleteVehicle(context,id,{deleteHistory:vehicle.status==="deleted"||Boolean(options.deleteHistory)});
    return {id,filesNotRemoved:0,historyDeleted:result.historyDeleted};
  }
  const result=await inTransaction(async()=>{
    const references=await blockers(context,kind,id);
    if(references.length)throw new DomainError("INVALID_STATUS_TRANSITION",`This record still has ${references.join(", ")} history. Keep it archived to preserve those records.`,409);
    let changes=0,storageKeys:string[]=[];
    if(kind==="booking")({changes,storageKeys}=await deleteArchivedBooking(context,id));
    else if(kind==="owner"){
      if(await queryOne("SELECT id FROM owners WHERE agency_id=? AND id=? AND status='archived'",[context.agencyId,id]))await execute("DELETE FROM management_agreements WHERE agency_id=? AND owner_id=?",[context.agencyId,id]);
      changes=(await execute("DELETE FROM owners WHERE agency_id=? AND id=? AND status='archived'",[context.agencyId,id])).changes;
    }else{
      const table={customer:"customers",driver:"drivers",guarantor:"guarantors"}[kind];
      changes=(await execute(`DELETE FROM ${table} WHERE agency_id=? AND id=? AND archived_at IS NOT NULL`,[context.agencyId,id])).changes;
    }
    if(!changes)throw new DomainError("NOT_FOUND","Archived record not found.",404);
    await execute("UPDATE audit_events SET metadata=NULL WHERE agency_id=? AND entity_type=? AND entity_id=?",[context.agencyId,kind,id]);
    await audit(context,`${kind}.permanently_deleted`,kind,id,new Date().toISOString());
    return storageKeys;
  },{immediate:true});
  const root=getPrivateFileRoot();
  await Promise.all(result.map(key=>unlink(path.join(root,key)).catch(()=>undefined)));
  return {id,filesNotRemoved:0,historyDeleted:false};
}
