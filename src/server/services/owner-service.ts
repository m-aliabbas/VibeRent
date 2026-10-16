import "server-only";
import { randomUUID } from "node:crypto";
import { sqlite } from "@/db/connection";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";

type AgreementRow={id:string;version:number;effectiveFrom:string;effectiveTo:string|null;shareBasis:string;ownerSharePercent:number|null;ownerShareAmount:number|null;expenseResponsibility:string;payoutFrequency:string;createdAt:string};
type RevenueRow={id:string;date:string;totalAmount:number;vehicle:string;plate:string;agreementId:string|null;agreementVersion:number|null;shareBasis:string|null;ownerSharePercent:number|null;ownerShareAmount:number|null};
type ExpenseRow={id:string;date:string;amount:number;description:string};
type PayoutRow={id:string;vehicleId:string|null;vehicle:string|null;plate:string|null;periodFrom:string;periodTo:string;paidAt:string;amount:number;method:string;reference:string;status:string};
export type OwnerPayoutDto={id:string;vehicleId:string|null;vehicle:string|null;plate:string|null;periodFrom:string;periodTo:string;paidAt:string;amount:number;method:string;reference:string;status:string};
export type OwnerStatementLine={id:string;kind:"Rental revenue"|"Owner expense"|"Payout";source:string;description:string;date:string;amount:number;agreementVersion:string};
export type OwnerStatementDto={id:string;period:string;periodFrom:string;periodTo:string;status:"Open"|"Paid";lines:OwnerStatementLine[];rentalRevenue:number;expenses:number;payouts:number;closing:number};
export type OwnerListItem={id:string;name:string;phone:string;email:string|null;status:string;version:number;vehicleCount:number;share:string;payable:number;balanceStatus:"Due"|"Settled"|"Inactive"};
export type OwnerDetailDto=OwnerListItem&{vehicles:Array<{id:string;name:string;plate:string;status:string}>;agreements:AgreementRow[];statements:OwnerStatementDto[];payoutHistory:OwnerPayoutDto[]};
export type OwnerWorkspaceData={owners:OwnerListItem[];summary:{activeOwners:number;managedVehicles:number;ownerShare:number;payable:number}};

const ownerBase=`SELECT o.id,o.name,o.phone,o.email,o.status,o.version,
  (SELECT count(*) FROM vehicles v WHERE v.agency_id=o.agency_id AND v.owner_id=o.id AND v.archived_at IS NULL) AS vehicleCount
  FROM owners o WHERE o.agency_id=? AND o.status<>'archived'`;

function shareAmount(total:number,row:{shareBasis:string|null;ownerSharePercent:number|null;ownerShareAmount:number|null}){
  if(row.shareBasis==="percentage") return Math.round(total*(row.ownerSharePercent??0)/100);
  return row.ownerShareAmount??0;
}
function totalShare(rows:RevenueRow[]){const fixed=new Set<string>();return rows.reduce((sum,row)=>{if(row.shareBasis!=="fixed_monthly")return sum+shareAmount(row.totalAmount,row);const key=row.agreementId??row.id;if(fixed.has(key))return sum;fixed.add(key);return sum+(row.ownerShareAmount??0)},0)}
function shareLabel(row:AgreementRow|undefined){if(!row)return "No agreement";return row.shareBasis==="percentage"?`${row.ownerSharePercent??0}% owner`:`${(row.ownerShareAmount??0).toLocaleString("en-PK")} PKR fixed`;}
function monthBounds(date:string){const value=new Date(date);const from=new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth(),1));const to=new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth()+1,1));return {from:from.toISOString().slice(0,10),to:to.toISOString().slice(0,10)};}
function listAgreements(agencyId:string,ownerId:string){return sqlite.prepare(`SELECT id,version,effective_from AS effectiveFrom,effective_to AS effectiveTo,share_basis AS shareBasis,owner_share_percent AS ownerSharePercent,owner_share_amount AS ownerShareAmount,expense_responsibility AS expenseResponsibility,payout_frequency AS payoutFrequency,created_at AS createdAt FROM management_agreements WHERE agency_id=? AND owner_id=? ORDER BY version DESC`).all(agencyId,ownerId) as AgreementRow[];}
function latestAgreement(agencyId:string,ownerId:string){return listAgreements(agencyId,ownerId)[0];}

function ledger(context:RequestContext,ownerId:string){
  const revenue=sqlite.prepare(`SELECT b.id,substr(coalesce(b.completed_at,b.return_at),1,10) AS date,b.total_amount AS totalAmount,v.make||' '||v.model AS vehicle,v.plate,a.id AS agreementId,a.version AS agreementVersion,a.share_basis AS shareBasis,a.owner_share_percent AS ownerSharePercent,a.owner_share_amount AS ownerShareAmount FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id AND v.agency_id=b.agency_id LEFT JOIN management_agreements a ON a.id=v.agreement_id AND a.agency_id=v.agency_id WHERE b.agency_id=? AND v.owner_id=? AND b.status='completed' ORDER BY date DESC`).all(context.agencyId,ownerId) as RevenueRow[];
  const expenses=sqlite.prepare(`SELECT id,occurred_on AS date,amount,description FROM expenses WHERE agency_id=? AND owner_id=? AND status='approved' ORDER BY occurred_on DESC`).all(context.agencyId,ownerId) as ExpenseRow[];
  const payouts=sqlite.prepare(`SELECT p.id,p.vehicle_id AS vehicleId,CASE WHEN v.id IS NULL THEN NULL ELSE v.make||' '||v.model END AS vehicle,v.plate,p.period_from AS periodFrom,p.period_to AS periodTo,p.paid_at AS paidAt,p.amount,p.method,p.reference,p.status FROM owner_payouts p LEFT JOIN vehicles v ON v.id=p.vehicle_id AND v.agency_id=p.agency_id WHERE p.agency_id=? AND p.owner_id=? AND p.status='posted' ORDER BY p.paid_at DESC`).all(context.agencyId,ownerId) as PayoutRow[];
  return {revenue,expenses,payouts};
}

function buildStatements(context:RequestContext,ownerId:string):OwnerStatementDto[]{
  const data=ledger(context,ownerId); const dates=[...data.revenue.map(x=>x.date),...data.expenses.map(x=>x.date),...data.payouts.map(x=>x.periodFrom)];
  const periods=[...new Set((dates.length?dates:[new Date().toISOString().slice(0,10)]).map(d=>d.slice(0,7)))].sort().reverse();
  return periods.map(period=>{const {from,to}=monthBounds(`${period}-01`); const lines:OwnerStatementLine[]=[];
    const fixed=new Set<string>();for(const row of data.revenue.filter(x=>x.date>=from&&x.date<to)){const key=row.agreementId??row.id;if(row.shareBasis==="fixed_monthly"&&fixed.has(key))continue;if(row.shareBasis==="fixed_monthly")fixed.add(key);lines.push({id:`REV-${row.id}`,kind:"Rental revenue",source:row.id,description:`${row.vehicle} · ${row.plate} owner share`,date:row.date,amount:shareAmount(row.totalAmount,row),agreementVersion:row.agreementVersion?`v${row.agreementVersion}`:"Unversioned"});}
    for(const row of data.expenses.filter(x=>x.date>=from&&x.date<to)) lines.push({id:`COST-${row.id}`,kind:"Owner expense",source:row.id,description:row.description,date:row.date,amount:-row.amount,agreementVersion:"Allocated expense"});
    for(const row of data.payouts.filter(x=>x.periodFrom>=from&&x.periodFrom<to)) lines.push({id:`PAY-${row.id}`,kind:"Payout",source:row.reference,description:`Payout · ${row.vehicle?`${row.vehicle} · ${row.plate}`:"Unallocated vehicle"} · ${row.method}`,date:row.paidAt,amount:-row.amount,agreementVersion:"Posted payout"});
    lines.sort((a,b)=>b.date.localeCompare(a.date)); const rentalRevenue=lines.filter(x=>x.kind==="Rental revenue").reduce((s,x)=>s+x.amount,0);const expenses=Math.abs(lines.filter(x=>x.kind==="Owner expense").reduce((s,x)=>s+x.amount,0));const payouts=Math.abs(lines.filter(x=>x.kind==="Payout").reduce((s,x)=>s+x.amount,0));const closing=rentalRevenue-expenses-payouts;
    return {id:`STM-${ownerId}-${period}`,period:new Intl.DateTimeFormat("en-PK",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${period}-01T00:00:00Z`)),periodFrom:from,periodTo:to,status:closing<=0?"Paid":"Open",lines,rentalRevenue,expenses,payouts,closing};
  });
}

export function listOwners(context:RequestContext):OwnerWorkspaceData{
  requireRole(context,["agency_owner","fleet_manager","rental_agent","accountant"]);
  const base=sqlite.prepare(`${ownerBase} ORDER BY o.name`).all(context.agencyId) as Array<Omit<OwnerListItem,"share"|"payable"|"balanceStatus">>;
  const owners=base.map(row=>{const entries=ledger(context,row.id);const payable=Math.max(0,totalShare(entries.revenue)-entries.expenses.reduce((s,x)=>s+x.amount,0)-entries.payouts.reduce((s,x)=>s+x.amount,0));return {...row,share:shareLabel(latestAgreement(context.agencyId,row.id)),payable,balanceStatus:row.status!=="active"?"Inactive" as const:payable>0?"Due" as const:"Settled" as const};});
  return {owners,summary:{activeOwners:owners.filter(x=>x.status==="active").length,managedVehicles:owners.reduce((s,x)=>s+x.vehicleCount,0),ownerShare:owners.reduce((s,x)=>s+x.payable,0),payable:owners.reduce((s,x)=>s+x.payable,0)}};
}
export function getOwner(context:RequestContext,id:string):OwnerDetailDto{
  const item=listOwners(context).owners.find(x=>x.id===id);if(!item)throw new DomainError("NOT_FOUND","Owner not found.",404);
  const vehicles=sqlite.prepare(`SELECT id,make||' '||model||' '||year AS name,plate,status FROM vehicles WHERE agency_id=? AND owner_id=? AND archived_at IS NULL ORDER BY make,model`).all(context.agencyId,id) as OwnerDetailDto["vehicles"];
  const payoutHistory=ledger(context,id).payouts.map(({id: payoutId,vehicleId,vehicle,plate,periodFrom,periodTo,paidAt,amount,method,reference,status})=>({id:payoutId,vehicleId,vehicle,plate,periodFrom,periodTo,paidAt,amount,method,reference,status}));
  return {...item,vehicles,agreements:listAgreements(context.agencyId,id),statements:buildStatements(context,id),payoutHistory};
}
function validateOwner(input:{name:string;phone:string;email?:string|null}){const errors:Record<string,string>={};if(!input.name?.trim())errors.name="Name is required.";if(!input.phone?.trim())errors.phone="Phone is required.";if(input.email&&!/^\S+@\S+\.\S+$/.test(input.email))errors.email="Enter a valid email.";if(Object.keys(errors).length)throw new DomainError("VALIDATION_FAILED","Review the owner details.",400,errors);}
export function saveOwner(context:RequestContext,input:{id?:string;name:string;phone:string;email?:string|null}){requireRole(context,["agency_owner","fleet_manager"]);validateOwner(input);const now=new Date().toISOString();return sqlite.transaction(()=>{const id=input.id??`OWN-${randomUUID().slice(0,8).toUpperCase()}`;if(input.id){const result=sqlite.prepare(`UPDATE owners SET name=?,phone=?,email=?,version=version+1,updated_at=? WHERE agency_id=? AND id=?`).run(input.name.trim(),input.phone.trim(),input.email?.trim()||null,now,context.agencyId,id);if(!result.changes)throw new DomainError("NOT_FOUND","Owner not found.",404);}else sqlite.prepare(`INSERT INTO owners (id,agency_id,name,phone,email,status,version,created_at,updated_at) VALUES (?,?,?,?,?,'active',1,?,?)`).run(id,context.agencyId,input.name.trim(),input.phone.trim(),input.email?.trim()||null,now,now);sqlite.prepare(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(),context.agencyId,context.userId,input.id?"owner.updated":"owner.created","owner",id,JSON.stringify({name:input.name.trim()}),now);return getOwner(context,id);})();}
export function archiveOwner(context:RequestContext,ownerId:string){requireRole(context,["agency_owner","fleet_manager"]);return sqlite.transaction(()=>{const owner=sqlite.prepare("SELECT id,name FROM owners WHERE agency_id=? AND id=? AND status<>'archived' LIMIT 1").get(context.agencyId,ownerId) as {id:string;name:string}|undefined;if(!owner)throw new DomainError("NOT_FOUND","Owner not found.",404);const linked=sqlite.prepare("SELECT id FROM vehicles WHERE agency_id=? AND owner_id=? AND archived_at IS NULL LIMIT 1").get(context.agencyId,ownerId);if(linked)throw new DomainError("INVALID_STATUS_TRANSITION","Reassign or delete this owner's active managed vehicles first.",409);const now=new Date().toISOString();sqlite.prepare("UPDATE owners SET status='archived',version=version+1,updated_at=? WHERE agency_id=? AND id=?").run(now,context.agencyId,ownerId);sqlite.prepare("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)").run(randomUUID(),context.agencyId,context.userId,"owner.archived","owner",ownerId,JSON.stringify({name:owner.name}),now);return {id:ownerId};}).immediate();}
export function createAgreement(context:RequestContext,ownerId:string,input:{effectiveFrom:string;effectiveTo?:string;shareBasis:"percentage"|"fixed_monthly";ownerShare:number;expenseResponsibility:string;payoutFrequency:string}){requireRole(context,["agency_owner","fleet_manager"]);getOwner(context,ownerId);if(!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)||input.effectiveTo&&!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveTo))throw new DomainError("VALIDATION_FAILED","Enter valid agreement dates.",400);if(!Number.isFinite(input.ownerShare)||input.ownerShare<=0||input.shareBasis==="percentage"&&input.ownerShare>100)throw new DomainError("VALIDATION_FAILED","Enter a valid owner share.",400,{ownerShare:"Percentage must be 1–100, or enter a positive fixed amount."});const now=new Date().toISOString();return sqlite.transaction(()=>{const version=(sqlite.prepare(`SELECT coalesce(max(version),0)+1 version FROM management_agreements WHERE agency_id=? AND owner_id=?`).get(context.agencyId,ownerId) as {version:number}).version;const id=`AGR-${randomUUID().slice(0,8).toUpperCase()}`;sqlite.prepare(`INSERT INTO management_agreements (id,agency_id,owner_id,version,effective_from,effective_to,share_basis,owner_share_percent,owner_share_amount,expense_responsibility,payout_frequency,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,context.agencyId,ownerId,version,input.effectiveFrom,input.effectiveTo||null,input.shareBasis,input.shareBasis==="percentage"?input.ownerShare:null,input.shareBasis==="fixed_monthly"?input.ownerShare:null,input.expenseResponsibility,input.payoutFrequency,now,now);sqlite.prepare(`UPDATE vehicles SET agreement_id=?,updated_at=?,version=version+1 WHERE agency_id=? AND owner_id=? AND archived_at IS NULL`).run(id,now,context.agencyId,ownerId);sqlite.prepare(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(),context.agencyId,context.userId,"owner.agreement_created","management_agreement",id,JSON.stringify({ownerId,version}),now);return getOwner(context,ownerId);})();}
export function recordOwnerPayout(context:RequestContext,ownerId:string,input:{vehicleId:string;periodFrom:string;periodTo:string;amount:number;method:string;reference:string;idempotencyKey:string}){
  requireRole(context,["agency_owner","accountant"]);
  const reference=input.reference.trim(),method=input.method.trim(),idempotencyKey=input.idempotencyKey.trim();
  if(!reference||!method||!idempotencyKey)throw new DomainError("VALIDATION_FAILED","Method, reference, and a retry key are required.",400);
  if(!Number.isInteger(input.amount)||input.amount<=0)throw new DomainError("VALIDATION_FAILED","Payout must be a positive whole amount.",400,{amount:"Enter a positive whole amount."});
  return sqlite.transaction(()=>{
    const existing=sqlite.prepare(`SELECT owner_id AS ownerId,vehicle_id AS vehicleId,period_from AS periodFrom,period_to AS periodTo,amount,method,reference FROM owner_payouts WHERE agency_id=? AND idempotency_key=? LIMIT 1`)
      .get(context.agencyId,idempotencyKey) as {ownerId:string;vehicleId:string|null;periodFrom:string;periodTo:string;amount:number;method:string;reference:string}|undefined;
    if(existing){
      const matches=existing.ownerId===ownerId&&existing.vehicleId===input.vehicleId&&existing.periodFrom===input.periodFrom&&existing.periodTo===input.periodTo&&existing.amount===input.amount&&existing.method===method&&existing.reference===reference;
      if(!matches)throw new DomainError("VERSION_CONFLICT","This payout retry key was already used with different details.",409);
      return getOwner(context,ownerId);
    }
    const owner=getOwner(context,ownerId);
    if(!owner.vehicles.some(vehicle=>vehicle.id===input.vehicleId))throw new DomainError("VALIDATION_FAILED","Choose a managed vehicle belonging to this owner.",400,{vehicleId:"Select one of this owner's vehicles."});
    const statement=owner.statements.find(x=>x.periodFrom===input.periodFrom&&x.periodTo===input.periodTo);
    if(!statement)throw new DomainError("NOT_FOUND","Statement period not found.",404);
    if(input.amount>statement.closing)throw new DomainError("VERSION_CONFLICT","The payable balance changed. Review the refreshed statement before posting.",409,{amount:`Available payable is PKR ${Math.max(0,statement.closing).toLocaleString("en-PK")}.`});
    const now=new Date().toISOString(),id=`PAY-${randomUUID().slice(0,8).toUpperCase()}`;
    sqlite.prepare(`INSERT INTO owner_payouts (id,agency_id,owner_id,vehicle_id,period_from,period_to,amount,method,reference,idempotency_key,status,paid_at,actor_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'posted',?,?,?,?)`).run(id,context.agencyId,ownerId,input.vehicleId,input.periodFrom,input.periodTo,input.amount,method,reference,idempotencyKey,now,context.userId,now,now);
    sqlite.prepare(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(),context.agencyId,context.userId,"owner.payout_posted","owner_payout",id,JSON.stringify({ownerId,vehicleId:input.vehicleId,amount:input.amount,periodFrom:input.periodFrom,periodTo:input.periodTo,reference}),now);
    return getOwner(context,ownerId);
  }).immediate();
}
