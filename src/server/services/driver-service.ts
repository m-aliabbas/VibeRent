import "server-only";

import { randomUUID } from "node:crypto";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { normalizePakistanPhone } from "@/server/whatsapp/pakistan-phone";
import { listAccountExpenses } from "@/server/services/expense-service";
import { summarizeAccount, type AccountExpense, type AccountSummary } from "@/lib/reports/account-summary";

export type DriverDto={id:string;name:string;phone:string;cnic:string;address:string;licenseNumber:string;licenseExpiresAt:string|null;status:string};
export type DriverLedgerBooking={id:string;plate:string;customer:string;destination:string;pickupAt:string;returnAt:string;status:string;totalAmount:number;paid:number};
export type DriverSummaryDto=AccountSummary&{driverId:string;trips:number;days:number};

const paidSql=`coalesce((SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal','payment_adjustment_decrease') THEN -ft.amount ELSE ft.amount END) FROM financial_transactions ft WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted' AND lower(ft.kind) IN ('payment','late_return_charge','deposit_applied','payment_adjustment_increase','payment_adjustment_decrease','reversal','refund')),0)`;
const rentalDays=(row:{pickupAt:string;returnAt:string})=>Math.max(1,Math.ceil((Date.parse(row.returnAt)-Date.parse(row.pickupAt))/86_400_000));

/** Income (rent on with-driver bookings) and expenses (incurred on those bookings) per driver, net of recoveries. */
export async function listDriverSummaries(context:RequestContext):Promise<DriverSummaryDto[]>{
  requireRole(context,["agency_owner","fleet_manager","rental_agent","accountant"]);
  const [bookings,expenses]=await Promise.all([
    queryAll<{driverId:string;status:string;totalAmount:number;paid:number;pickupAt:string;returnAt:string}>(`SELECT bk.driver_id AS driverId,bk.status,bk.total_amount AS totalAmount,${paidSql} AS paid,bk.pickup_at AS pickupAt,bk.return_at AS returnAt FROM bookings bk WHERE bk.agency_id=? AND bk.driver_id IS NOT NULL AND bk.archived_at IS NULL AND bk.status NOT IN ('draft','cancelled','no_show')`,[context.agencyId]),
    queryAll<{driverId:string;amount:number;recovered:number|string}>(`SELECT b.driver_id AS driverId,e.amount,coalesce((SELECT sum(r.amount) FROM expense_recoveries r WHERE r.agency_id=e.agency_id AND r.expense_id=e.id AND r.status='posted'),0) AS recovered FROM expenses e JOIN bookings b ON b.id=e.booking_id AND b.agency_id=e.agency_id WHERE e.agency_id=? AND e.status='approved' AND b.driver_id IS NOT NULL AND b.archived_at IS NULL`,[context.agencyId]),
  ]);
  const ids=new Set([...bookings.map(row=>row.driverId),...expenses.map(row=>row.driverId)]);
  return [...ids].map(driverId=>{
    const own=bookings.filter(row=>row.driverId===driverId);
    const costs=expenses.filter(row=>row.driverId===driverId).map(row=>({id:"",date:"",head:"",description:"",plate:null,bookingId:null,amount:row.amount,recovered:Number(row.recovered)||0}));
    return {driverId,trips:own.length,days:own.reduce((sum,row)=>sum+rentalDays(row),0),...summarizeAccount(own,costs)};
  });
}

export async function listDrivers(context:RequestContext):Promise<DriverDto[]>{
  requireRole(context,["agency_owner","fleet_manager","rental_agent"]);
  return queryAll<DriverDto>(`SELECT id,name,phone_normalized AS phone,cnic_normalized AS cnic,address,license_number AS licenseNumber,license_expires_at AS licenseExpiresAt,status FROM drivers WHERE agency_id=? AND archived_at IS NULL ORDER BY status,name`,[context.agencyId]);
}

export async function getDriverLedger(context:RequestContext,id:string,from:string,to:string):Promise<{driver:DriverDto;bookings:DriverLedgerBooking[];expenses:AccountExpense[];summary:DriverSummaryDto}>{
  requireRole(context,["agency_owner","fleet_manager","rental_agent","accountant"]);
  const driver=await queryOne<DriverDto>(`SELECT id,name,phone_normalized AS phone,cnic_normalized AS cnic,address,license_number AS licenseNumber,license_expires_at AS licenseExpiresAt,status FROM drivers WHERE agency_id=? AND id=? LIMIT 1`,[context.agencyId,id]);
  if(!driver)throw new DomainError("NOT_FOUND","Driver not found.",404);
  const bookings=await queryAll<DriverLedgerBooking>(`SELECT bk.id,coalesce(bk.external_vehicle_plate,v.plate,'—') AS plate,coalesce(c.name,'') AS customer,bk.destination_city AS destination,bk.pickup_at AS pickupAt,bk.return_at AS returnAt,bk.status,bk.total_amount AS totalAmount,${paidSql} AS paid FROM bookings bk LEFT JOIN vehicles v ON v.id=bk.vehicle_id AND v.agency_id=bk.agency_id LEFT JOIN customers c ON c.id=bk.customer_id AND c.agency_id=bk.agency_id WHERE bk.agency_id=? AND bk.driver_id=? AND bk.archived_at IS NULL AND bk.pickup_at<=? AND bk.return_at>=? AND bk.status NOT IN ('draft','cancelled','no_show') ORDER BY bk.pickup_at,bk.id`,[context.agencyId,id,`${to}T23:59:59`,`${from}T00:00:00`]);
  const expenses=(await listAccountExpenses(context.agencyId,{driverId:id})).filter(row=>row.date>=from&&row.date<=to);
  return {driver,bookings,expenses,summary:{driverId:id,trips:bookings.length,days:bookings.reduce((sum,row)=>sum+rentalDays(row),0),...summarizeAccount(bookings,expenses)}};
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
