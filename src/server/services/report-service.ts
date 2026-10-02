import "server-only";
import { sqlite } from "@/db/connection";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";

type Vehicle={id:string;name:string;plate:string;city:string;ownership:string;ownerId:string|null};
type Booking={id:string;vehicleId:string;ownerId:string|null;source:string;pickupAt:string;returnAt:string;completedAt:string|null;status:string;totalAmount:number;shareBasis:string|null;ownerSharePercent:number|null;ownerShareAmount:number|null};
type Cost={id:string;vehicleId:string|null;ownerId:string|null;date:string;category:string;description:string;amount:number;status:string;receipt:number};
type Transaction={id:string;bookingId:string|null;date:string;amount:number;kind:string;status:string;method:string};
type Payout={id:string;ownerId:string;date:string;amount:number};
type Block={vehicleId:string;startAt:string;endAt:string};
export type ReportSource={id:string;label:string;amount:number};
export type VehicleReportRow={id:string;vehicle:string;city:string;ownership:string;revenue:number;expenses:number;ownerShare:number;utilization:number;availableDays:number;downtime:number;sources:ReportSource[]};
export type ReportPeriod={key:string;label:string;from:string;to:string;vehicles:VehicleReportRow[];collections:{booked:number;collected:number;outstanding:number;overdue:number;channels:Array<{name:string;count:number;collected:number}>};expenses:{approved:number;ownerResponsibility:number;receiptExceptions:number;categories:Array<{name:string;amount:number}>};owners:{managedRevenue:number;ownerShare:number;paid:number;payable:number;vehicleCount:number;rows:Array<{id:string;name:string;revenue:number;share:number;paid:number;payable:number}>}};
export type ReportsData={periods:ReportPeriod[];cities:string[]};

function periodBounds(key:string){const [year,month]=key.split("-").map(Number);return {from:new Date(Date.UTC(year,month-1,1)).toISOString(),to:new Date(Date.UTC(year,month,1)).toISOString()};}
function overlapDays(start:string,end:string,from:string,to:string){const a=Math.max(Date.parse(start),Date.parse(from));const b=Math.min(Date.parse(end),Date.parse(to));return Math.max(0,(b-a)/86_400_000);}
function ownerShare(total:number,row:Booking){return row.shareBasis==="percentage"?Math.round(total*(row.ownerSharePercent??0)/100):row.ownerShareAmount??0;}
function totalOwnerShare(rows:Booking[]){const fixed=new Set<string>();return rows.reduce((sum,row)=>{if(row.shareBasis!=="fixed_monthly")return sum+ownerShare(row.totalAmount,row);const key=row.vehicleId;if(fixed.has(key))return sum;fixed.add(key);return sum+ownerShare(row.totalAmount,row)},0)}

export function getReports(context:RequestContext):ReportsData{
  requireRole(context,["agency_owner","fleet_manager","accountant"]);
  const vehicles=sqlite.prepare(`SELECT v.id,v.make||' '||v.model||' · '||v.plate AS name,v.plate,b.city,v.ownership,v.owner_id AS ownerId FROM vehicles v JOIN branches b ON b.id=v.branch_id AND b.agency_id=v.agency_id WHERE v.agency_id=? AND v.archived_at IS NULL ORDER BY v.make,v.model`).all(context.agencyId) as Vehicle[];
  const bookings=sqlite.prepare(`SELECT b.id,b.vehicle_id AS vehicleId,v.owner_id AS ownerId,b.source,b.pickup_at AS pickupAt,b.return_at AS returnAt,b.completed_at AS completedAt,b.status,b.total_amount AS totalAmount,a.share_basis AS shareBasis,a.owner_share_percent AS ownerSharePercent,a.owner_share_amount AS ownerShareAmount FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id AND v.agency_id=b.agency_id LEFT JOIN management_agreements a ON a.id=v.agreement_id AND a.agency_id=v.agency_id WHERE b.agency_id=?`).all(context.agencyId) as Booking[];
  const costs=sqlite.prepare(`SELECT e.id,e.vehicle_id AS vehicleId,e.owner_id AS ownerId,e.occurred_on AS date,e.category,e.description,e.amount,e.status,EXISTS(SELECT 1 FROM private_files pf WHERE pf.agency_id=e.agency_id AND pf.entity_type='expense' AND pf.entity_id=e.id AND pf.status='ready') AS receipt FROM expenses e WHERE e.agency_id=?`).all(context.agencyId) as Cost[];
  const transactions=sqlite.prepare(`SELECT t.id,t.booking_id AS bookingId,t.posted_at AS date,t.amount,t.kind,t.status,t.method FROM financial_transactions t WHERE t.agency_id=?`).all(context.agencyId) as Transaction[];
  const payouts=sqlite.prepare(`SELECT id,owner_id AS ownerId,period_from AS date,amount FROM owner_payouts WHERE agency_id=? AND status='posted'`).all(context.agencyId) as Payout[];
  const blocks=sqlite.prepare(`SELECT vehicle_id AS vehicleId,start_at AS startAt,end_at AS endAt FROM availability_blocks WHERE agency_id=? AND archived_at IS NULL`).all(context.agencyId) as Block[];
  const owners=sqlite.prepare(`SELECT id,name FROM owners WHERE agency_id=?`).all(context.agencyId) as Array<{id:string;name:string}>;
  const dateKeys=[...bookings.map(x=>(x.completedAt??x.pickupAt).slice(0,7)),...costs.map(x=>x.date.slice(0,7)),...transactions.map(x=>x.date.slice(0,7)),...payouts.map(x=>x.date.slice(0,7))];
  const periods=[...new Set(dateKeys.length?dateKeys:[new Date().toISOString().slice(0,7)])].sort().reverse().map(key=>{
    const {from,to}=periodBounds(key);const days=(Date.parse(to)-Date.parse(from))/86_400_000;
    const periodBookings=bookings.filter(x=>(x.completedAt??x.pickupAt)>=from&&(x.completedAt??x.pickupAt)<to&&x.status==="completed");
    const bookedBookings=bookings.filter(x=>x.pickupAt>=from&&x.pickupAt<to&&!['draft','cancelled','no_show'].includes(x.status));
    const periodCosts=costs.filter(x=>x.date>=from.slice(0,10)&&x.date<to.slice(0,10)&&x.status==="approved");
    const periodTransactions=transactions.filter(x=>x.date>=from&&x.date<to&&x.status==="posted");
    const periodPayouts=payouts.filter(x=>x.date>=from.slice(0,10)&&x.date<to.slice(0,10));
    const rows=vehicles.map(vehicle=>{const rental=periodBookings.filter(x=>x.vehicleId===vehicle.id);const expense=periodCosts.filter(x=>x.vehicleId===vehicle.id);const occupied=bookings.filter(x=>x.vehicleId===vehicle.id&&['confirmed','checked_out','completed'].includes(x.status)).reduce((s,x)=>s+overlapDays(x.pickupAt,x.returnAt,from,to),0);const downtime=blocks.filter(x=>x.vehicleId===vehicle.id).reduce((s,x)=>s+overlapDays(x.startAt,x.endAt,from,to),0);const availableDays=Math.max(0,days-downtime);const revenue=rental.reduce((s,x)=>s+x.totalAmount,0);const expenses=expense.reduce((s,x)=>s+x.amount,0);const share=vehicle.ownerId?totalOwnerShare(rental):0;return {id:vehicle.id,vehicle:vehicle.name,city:vehicle.city,ownership:vehicle.ownership==="managed"?"Managed":"Owned",revenue,expenses,ownerShare:share,utilization:availableDays?Math.min(100,Math.round(occupied/availableDays*100)):0,availableDays:Math.round(availableDays*10)/10,downtime:Math.round(downtime*10)/10,sources:[...rental.map(x=>({id:x.id,label:"Completed rental",amount:x.totalAmount})),...expense.map(x=>({id:x.id,label:x.description,amount:-x.amount}))]};});
    const channels=[...new Set(periodTransactions.map(x=>x.method||"Unspecified"))].map(name=>({name,count:periodTransactions.filter(x=>(x.method||"Unspecified")===name).length,collected:periodTransactions.filter(x=>(x.method||"Unspecified")===name).reduce((s,x)=>s+(['refund','reversal'].includes(x.kind)?-x.amount:x.amount),0)})).sort((a,b)=>b.collected-a.collected);
    const booked=bookedBookings.reduce((s,x)=>s+x.totalAmount,0),collected=periodTransactions.reduce((s,x)=>s+(['refund','reversal'].includes(x.kind)?-x.amount:x.amount),0);
    const categories=[...new Set(periodCosts.map(x=>x.category))].map(name=>({name,amount:periodCosts.filter(x=>x.category===name).reduce((s,x)=>s+x.amount,0)})).sort((a,b)=>b.amount-a.amount);
    const ownerRows=owners.map(owner=>{const rentals=periodBookings.filter(x=>x.ownerId===owner.id);const revenue=rentals.reduce((s,x)=>s+x.totalAmount,0);const share=totalOwnerShare(rentals);const paid=periodPayouts.filter(x=>x.ownerId===owner.id).reduce((s,x)=>s+x.amount,0);return {id:owner.id,name:owner.name,revenue,share,paid,payable:Math.max(0,share-periodCosts.filter(x=>x.ownerId===owner.id).reduce((s,x)=>s+x.amount,0)-paid)};}).filter(x=>x.revenue||x.share||x.paid||x.payable);
    return {key,label:new Intl.DateTimeFormat("en-PK",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(from)),from,to,vehicles:rows,collections:{booked,collected,outstanding:Math.max(0,booked-collected),overdue:bookedBookings.filter(x=>x.returnAt<new Date().toISOString()).reduce((s,x)=>s+x.totalAmount,0),channels},expenses:{approved:periodCosts.reduce((s,x)=>s+x.amount,0),ownerResponsibility:periodCosts.filter(x=>x.ownerId).reduce((s,x)=>s+x.amount,0),receiptExceptions:periodCosts.filter(x=>!x.receipt).length,categories},owners:{managedRevenue:ownerRows.reduce((s,x)=>s+x.revenue,0),ownerShare:ownerRows.reduce((s,x)=>s+x.share,0),paid:ownerRows.reduce((s,x)=>s+x.paid,0),payable:ownerRows.reduce((s,x)=>s+x.payable,0),vehicleCount:vehicles.filter(x=>x.ownerId).length,rows:ownerRows}} satisfies ReportPeriod;
  });
  return {periods,cities:[...new Set(vehicles.map(x=>x.city))].sort()};
}
