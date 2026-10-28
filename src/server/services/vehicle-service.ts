import "server-only";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { getPrivateFileRoot } from "@/server/desktop/runtime-paths";
import { vehicleRepository } from "@/server/repositories/drizzle/vehicle-repository";
import { parseVehicleInput } from "@/server/validation/vehicle";
import { listExpenses, type ExpenseDto } from "@/server/services/expense-service";
import {
  listAvailabilityBlocks,
  listBookings,
  type AvailabilityBlockDto,
} from "@/server/services/booking-service";
import type { BookingListItem } from "@/server/repositories/contracts";
import type { VehicleStatus } from "@/types/vehicle";

const vehicleStatusValues: Record<VehicleStatus, string> = {
  Available: "available",
  Booked: "booked",
  Maintenance: "maintenance",
  "Out of Service": "out_of_service",
  Archived: "archived",
};

const allowedVehicleStatusTransitions: Record<VehicleStatus, VehicleStatus[]> = {
  Available: ["Booked", "Maintenance", "Out of Service"],
  Booked: ["Available", "Maintenance", "Out of Service"],
  Maintenance: ["Available", "Out of Service"],
  "Out of Service": ["Available", "Maintenance"],
  Archived: [],
};

export type VehicleFinancePeriod = { income:number; expenses:number };
export type VehicleFinanceTransaction = {
  id: string;
  bookingId: string;
  customer: string;
  kind: string;
  amount: number;
  method: string;
  reference: string;
  status: string;
  postedAt: string;
};
export type VehicleFinanceSummary = {
  today: VehicleFinancePeriod;
  month: VehicleFinancePeriod;
  total: VehicleFinancePeriod;
  depositHeld: number;
  bookingValue: number;
  outstanding: number;
  bookings: BookingListItem[];
  availabilityBlocks: AvailabilityBlockDto[];
  recentTransactions: VehicleFinanceTransaction[];
  recentExpenses: ExpenseDto[];
};

export async function listVehicles(context: RequestContext) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  return vehicleRepository.list(context.agencyId);
}

export async function getVehicle(context: RequestContext, id: string) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const vehicle = await vehicleRepository.getById(context.agencyId, id);
  if (!vehicle) throw new DomainError("NOT_FOUND", "Vehicle not found.", 404);
  return vehicle;
}

export async function getVehicleFinance(context: RequestContext, id: string): Promise<VehicleFinanceSummary> {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  await getVehicle(context, id);
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const todayStart = new Date(`${localDate}T00:00:00+05:00`).toISOString();
  const tomorrowStart = new Date(`${localDate}T24:00:00+05:00`).toISOString();
  const monthDate = `${localDate.slice(0, 7)}-01`;
  const monthStart = new Date(`${monthDate}T00:00:00+05:00`).toISOString();
  const income = (await queryOne<{today:number;month:number;total:number}>(`
    SELECT
      coalesce(sum(CASE WHEN t.posted_at>=? AND t.posted_at<? THEN
        CASE
          WHEN lower(t.kind) IN ('payment','late_return_charge','deposit_applied','deposit_forfeited','payment_adjustment_increase') THEN t.amount
          WHEN lower(t.kind)='payment_adjustment_decrease' THEN -t.amount WHEN lower(t.kind) IN ('refund','reversal') AND lower(coalesce(original.kind,'')) IN ('payment','late_return_charge','deposit_applied','deposit_forfeited','payment_adjustment_increase') THEN -t.amount
          ELSE 0
        END ELSE 0 END),0) AS today,
      coalesce(sum(CASE WHEN t.posted_at>=? AND t.posted_at<? THEN
        CASE
          WHEN lower(t.kind) IN ('payment','late_return_charge','deposit_applied','deposit_forfeited','payment_adjustment_increase') THEN t.amount
          WHEN lower(t.kind)='payment_adjustment_decrease' THEN -t.amount WHEN lower(t.kind) IN ('refund','reversal') AND lower(coalesce(original.kind,'')) IN ('payment','late_return_charge','deposit_applied','deposit_forfeited','payment_adjustment_increase') THEN -t.amount
          ELSE 0
        END ELSE 0 END),0) AS month,
      coalesce(sum(CASE
        WHEN lower(t.kind) IN ('payment','late_return_charge','deposit_applied','deposit_forfeited','payment_adjustment_increase') THEN t.amount
        WHEN lower(t.kind)='payment_adjustment_decrease' THEN -t.amount WHEN lower(t.kind) IN ('refund','reversal') AND lower(coalesce(original.kind,'')) IN ('payment','late_return_charge','deposit_applied','deposit_forfeited','payment_adjustment_increase') THEN -t.amount
        ELSE 0
      END),0) AS total
    FROM financial_transactions t
    JOIN bookings b ON b.id=t.booking_id AND b.agency_id=t.agency_id
    LEFT JOIN financial_transactions original ON original.id=t.linked_transaction_id AND original.agency_id=t.agency_id
    WHERE t.agency_id=? AND b.vehicle_id=? AND t.status='posted'
  `,[todayStart,tomorrowStart,monthStart,tomorrowStart,context.agencyId,id]))!;
  const expense = (await queryOne<{today:number;month:number;total:number}>(`
    SELECT
      coalesce(sum(CASE WHEN occurred_on=? THEN amount ELSE 0 END),0) AS today,
      coalesce(sum(CASE WHEN occurred_on>=? AND occurred_on<=? THEN amount ELSE 0 END),0) AS month,
      coalesce(sum(amount),0) AS total
    FROM expenses
    WHERE agency_id=? AND vehicle_id=? AND status='approved'
  `,[localDate,monthDate,localDate,context.agencyId,id]))!;
  const bookings = (await listBookings(context)).filter(item => item.vehicleId === id);
  const bookingValue = bookings
    .filter(item => item.status !== "Cancelled" && item.status !== "No Show" && item.status !== "Draft")
    .reduce((sum, item) => sum + item.dailyRate * item.days + item.mileageRate * item.estimatedKm + item.extras - item.discount, 0);
  const outstanding = bookings.reduce((sum, item) => {
    if (["Cancelled", "No Show", "Draft"].includes(item.status)) return sum;
    const total = item.dailyRate * item.days + item.mileageRate * item.estimatedKm + item.extras - item.discount;
    return sum + Math.max(0, total - item.paid);
  }, 0);
  const depositHeld = bookings.reduce((sum, item) => sum + (item.depositHeld ?? 0), 0);
  const recentTransactions = await queryAll<VehicleFinanceTransaction>(`
    SELECT t.id,t.booking_id AS bookingId,c.name AS customer,t.kind,t.amount,t.method,t.reference,
      CASE WHEN EXISTS(SELECT 1 FROM financial_transactions reversal WHERE reversal.agency_id=t.agency_id AND reversal.linked_transaction_id=t.id AND reversal.status='posted') THEN 'reversed' ELSE t.status END AS status,
      t.posted_at AS postedAt
    FROM financial_transactions t
    JOIN bookings b ON b.id=t.booking_id AND b.agency_id=t.agency_id
    JOIN customers c ON c.id=b.customer_id AND c.agency_id=b.agency_id
    WHERE t.agency_id=? AND b.vehicle_id=?
    ORDER BY t.posted_at DESC,t.created_at DESC
    LIMIT 50
  `,[context.agencyId,id]);
  const [availabilityBlocks,recentExpenses]=await Promise.all([listAvailabilityBlocks(context),listExpenses(context)]);
  return {
    today: { income: income.today, expenses: expense.today },
    month: { income: income.month, expenses: expense.month },
    total: { income: income.total, expenses: expense.total },
    depositHeld,
    bookingValue,
    outstanding,
    bookings,
    availabilityBlocks: availabilityBlocks.filter(item => item.vehicleId === id),
    recentTransactions,
    recentExpenses: recentExpenses.filter(item => item.vehicleId === id).slice(0, 20),
  };
}

export async function saveVehicle(context: RequestContext, input: unknown) {
  requireRole(context, ["agency_owner", "fleet_manager"]);
  return vehicleRepository.save(context.agencyId, context.userId, parseVehicleInput(input));
}

export async function transitionVehicleStatus(context: RequestContext, id: string, input: { to: VehicleStatus; reason: string; notes?: string; effectiveAt: string }) {
  requireRole(context, ["agency_owner", "fleet_manager"]);
  const reason = input.reason?.trim();
  const notes = input.notes?.trim() ?? "";
  const effectiveAt = new Date(input.effectiveAt);
  if (!reason || !Number.isFinite(effectiveAt.getTime())) {
    throw new DomainError("VALIDATION_FAILED", "Choose a reason and a valid effective time.", 400);
  }
  if (!(input.to in vehicleStatusValues) || input.to === "Archived") {
    throw new DomainError("INVALID_STATUS_TRANSITION", "Choose a valid operational vehicle status.", 409);
  }

  return inTransaction(async () => {
    const current = await getVehicle(context, id);
    if (!allowedVehicleStatusTransitions[current.status].includes(input.to)) {
      throw new DomainError("INVALID_STATUS_TRANSITION", `${current.status} cannot be changed to ${input.to}.`, 409);
    }
    if (current.status === "Booked" && input.to !== "Booked") {
      const activeBooking = await queryOne("SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=? AND archived_at IS NULL AND status IN ('confirmed','checked_out') LIMIT 1",[context.agencyId, id]);
      if (activeBooking) {
        throw new DomainError("INVALID_STATUS_TRANSITION", "Cancel, reassign, or complete the active booking before changing this vehicle's status.", 409);
      }
    }

    const now = new Date().toISOString();
    await execute("UPDATE vehicles SET status=?,version=version+1,updated_at=? WHERE agency_id=? AND id=? AND archived_at IS NULL",[vehicleStatusValues[input.to], now, context.agencyId, id]);
    await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",[randomUUID(), context.agencyId, context.userId, "vehicle.status_changed", "vehicle", id, JSON.stringify({ from: current.status, to: input.to, reason, notes: notes || undefined, effectiveAt: effectiveAt.toISOString() }), now]);
    return getVehicle(context, id);
  },{immediate:true});
}

export async function setVehicleArchived(context:RequestContext,id:string,archived:boolean) {
  requireRole(context,["agency_owner","fleet_manager"]);
  return inTransaction(async()=>{
    const vehicle=await queryOne<{id:string;status:string}>("SELECT id,status FROM vehicles WHERE agency_id=? AND id=? LIMIT 1",[context.agencyId,id]);
    if(!vehicle) throw new DomainError("NOT_FOUND","Vehicle not found.",404);
    if(archived){const blocking=await queryOne("SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=? AND archived_at IS NULL AND status IN ('confirmed','checked_out') LIMIT 1",[context.agencyId,id]);if(blocking)throw new DomainError("INVALID_STATUS_TRANSITION","Cancel, complete, or reassign the active booking before archiving this vehicle.",409)}
    const activeBooking=!archived && await queryOne("SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=? AND archived_at IS NULL AND status IN ('confirmed','checked_out') LIMIT 1",[context.agencyId,id]);
    const now=new Date().toISOString();
    await execute("UPDATE vehicles SET status=?,archived_at=?,version=version+1,updated_at=? WHERE agency_id=? AND id=?",[archived?"archived":activeBooking?"booked":"available",archived?now:null,now,context.agencyId,id]);
    await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",[randomUUID(),context.agencyId,context.userId,archived?"vehicle.archived":"vehicle.restored","vehicle",id,JSON.stringify({previousStatus:vehicle.status}),now]);
    return getVehicle(context,id);
  },{immediate:true});
}

export type VehicleDeletionImpact={bookings:number;transactions:number;expenses:number;payouts:number;documents:number};

/** Counts the history a vehicle carries, shown before an owner chooses whether to delete it too. */
export async function getVehicleDeletionImpact(agencyId:string,id:string):Promise<VehicleDeletionImpact>{
  const count=async(sql:string,args:unknown[])=>(await queryOne<{total:number}>(sql,args))?.total??0;
  const [bookings,transactions,expenses,payouts,documents]=await Promise.all([
    count("SELECT count(*) AS total FROM bookings WHERE agency_id=? AND vehicle_id=?",[agencyId,id]),
    count("SELECT count(*) AS total FROM financial_transactions WHERE agency_id=? AND booking_id IN (SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=?)",[agencyId,agencyId,id]),
    count("SELECT count(*) AS total FROM expenses WHERE agency_id=? AND (vehicle_id=? OR booking_id IN (SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=?))",[agencyId,id,agencyId,id]),
    count("SELECT count(*) AS total FROM owner_payouts WHERE agency_id=? AND vehicle_id=?",[agencyId,id]),
    count("SELECT count(*) AS total FROM private_files WHERE agency_id=? AND entity_type='vehicle' AND entity_id=?",[agencyId,id]),
  ]);
  return {bookings,transactions,expenses,payouts,documents};
}

/**
 * Deletes a vehicle whether or not it has history.
 * - deleteHistory=false: the vehicle is hidden everywhere (status 'deleted') while bookings, payments,
 *   expenses and payouts keep pointing at it, so ledgers and reports stay intact.
 * - deleteHistory=true: the vehicle and every record linked to it (bookings with their payments,
 *   inspections and source payouts, expenses, recurring expenses, owner payouts, documents) are removed.
 */
export async function deleteVehicle(context:RequestContext,id:string,input:{deleteHistory:boolean}){
  requireRole(context,input.deleteHistory?["agency_owner"]:["agency_owner","fleet_manager"]);
  const agency=context.agencyId;
  const result=await inTransaction(async()=>{
    const vehicle=await queryOne<{id:string;plate:string;status:string}>("SELECT id,plate,status FROM vehicles WHERE agency_id=? AND id=? LIMIT 1 /*postgres:for-update*/",[agency,id]);
    if(vehicle?.status==="deleted"&&!input.deleteHistory) throw new DomainError("INVALID_STATUS_TRANSITION","This vehicle is already deleted with its history kept.",409);
    if(!vehicle) throw new DomainError("NOT_FOUND","Vehicle not found.",404);
    const now=new Date().toISOString();
    if(!input.deleteHistory){
      await execute("UPDATE vehicles SET status='deleted',archived_at=coalesce(archived_at,?),version=version+1,updated_at=? WHERE agency_id=? AND id=?",[now,now,agency,id]);
      await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",[randomUUID(),agency,context.userId,"vehicle.deleted","vehicle",id,JSON.stringify({plate:vehicle.plate,previousStatus:vehicle.status,historyKept:true}),now]);
      return {id,historyDeleted:false,storageKeys:[] as string[]};
    }
    const impact=await getVehicleDeletionImpact(agency,id);
    const bookingIds="SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=?";
    const expenseIds=`SELECT id FROM expenses WHERE agency_id=? AND (vehicle_id=? OR booking_id IN (${bookingIds}) OR recurring_expense_id IN (SELECT id FROM recurring_expenses WHERE agency_id=? AND vehicle_id=?))`;
    const expenseArgs=[agency,id,agency,id,agency,id];
    const deliveryIds=`SELECT id FROM notification_deliveries WHERE agency_id=? AND ((entity_type='booking' AND entity_id IN (${bookingIds})) OR (entity_type='vehicle' AND entity_id=?) OR (entity_type='expense' AND entity_id IN (${expenseIds})))`;
    const deliveryArgs=[agency,agency,id,id,...expenseArgs];
    const fileFilter=`agency_id=? AND ((entity_type='vehicle' AND entity_id=?) OR (entity_type='booking' AND entity_id IN (${bookingIds})) OR (entity_type='expense' AND entity_id IN (${expenseIds})) OR (entity_type='notification' AND entity_id IN (${deliveryIds})))`;
    const fileArgs=[agency,id,agency,id,...expenseArgs,...deliveryArgs];
    const files=await queryAll<{id:string;storageKey:string}>(`SELECT id,storage_key AS storageKey FROM private_files WHERE ${fileFilter}`,fileArgs);
    await execute(`DELETE FROM notification_deliveries WHERE id IN (${deliveryIds})`,deliveryArgs);
    for(const file of files) await execute("DELETE FROM private_files WHERE agency_id=? AND id=?",[agency,file.id]);
    await execute("DELETE FROM vehicle_service_records WHERE agency_id=? AND vehicle_id=?",[agency,id]);
    await execute(`DELETE FROM vehicle_service_records WHERE agency_id=? AND expense_id IN (${expenseIds})`,[agency,...expenseArgs]);
    await execute(`DELETE FROM expenses WHERE id IN (${expenseIds})`,expenseArgs);
    await execute("DELETE FROM recurring_expenses WHERE agency_id=? AND vehicle_id=?",[agency,id]);
    await execute("DELETE FROM owner_payouts WHERE agency_id=? AND vehicle_id=?",[agency,id]);
    await execute(`DELETE FROM source_payouts WHERE agency_id=? AND booking_id IN (${bookingIds})`,[agency,agency,id]);
    await execute(`DELETE FROM rental_inspections WHERE agency_id=? AND booking_id IN (${bookingIds})`,[agency,agency,id]);
    await execute(`UPDATE financial_transactions SET linked_transaction_id=NULL WHERE agency_id=? AND booking_id IN (${bookingIds})`,[agency,agency,id]);
    await execute(`DELETE FROM financial_transactions WHERE agency_id=? AND booking_id IN (${bookingIds})`,[agency,agency,id]);
    await execute("DELETE FROM bookings WHERE agency_id=? AND vehicle_id=?",[agency,id]);
    await execute("DELETE FROM availability_blocks WHERE agency_id=? AND vehicle_id=?",[agency,id]);
    await execute("DELETE FROM vehicle_rate_rules WHERE agency_id=? AND vehicle_id=?",[agency,id]);
    await execute("DELETE FROM vehicles WHERE agency_id=? AND id=?",[agency,id]);
    await execute("UPDATE audit_events SET metadata=NULL WHERE agency_id=? AND entity_type='vehicle' AND entity_id=?",[agency,id]);
    await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",[randomUUID(),agency,context.userId,"vehicle.permanently_deleted","vehicle",id,JSON.stringify({historyDeleted:true,...impact}),now]);
    return {id,historyDeleted:true,storageKeys:files.map(file=>file.storageKey)};
  },{immediate:true});
  const root=getPrivateFileRoot();
  await Promise.all(result.storageKeys.map(key=>unlink(path.join(root,key)).catch(()=>undefined)));
  return {id:result.id,historyDeleted:result.historyDeleted};
}

export async function getVehicleFormOptions(context: RequestContext) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  const [branches,owners] = await Promise.all([
    queryAll<{id:string;name:string;city:string}>("SELECT id,name,city FROM branches WHERE agency_id=? AND active=1 ORDER BY name",[context.agencyId]),
    queryAll<{id:string;name:string;phone:string}>("SELECT id,name,phone FROM owners WHERE agency_id=? AND status='active' ORDER BY name",[context.agencyId]),
  ]);
  const defaultBranchId = context.branchId ?? branches[0]?.id;
  return { branches, owners, defaultBranchId, defaultCity: branches.find(branch => branch.id === defaultBranchId)?.city ?? branches[0]?.city ?? "" };
}

export async function listAvailableVehicles(context: RequestContext, pickupAt: string, returnAt: string) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  const pickup = Date.parse(pickupAt);
  const returned = Date.parse(returnAt);
  if (!Number.isFinite(pickup) || !Number.isFinite(returned) || returned <= pickup) {
    throw new DomainError("VALIDATION_FAILED", "Enter a valid pickup and return interval.", 400, { returnAt: "Return must be after pickup." });
  }
  return queryAll(`
    SELECT v.id, v.plate, v.make, v.model, v.year, v.category, v.daily_rate AS dailyRate,
      b.id AS branchId, b.name AS branch, b.city, v.updated_at AS updatedAt
    FROM vehicles v
    JOIN branches b ON b.id=v.branch_id AND b.agency_id=v.agency_id
    WHERE v.agency_id=? AND v.archived_at IS NULL AND v.status='available'
      AND NOT EXISTS (SELECT 1 FROM bookings bk WHERE bk.agency_id=v.agency_id AND bk.vehicle_id=v.id AND bk.status IN ('confirmed','checked_out') AND bk.pickup_at < ? AND bk.return_at > ?)
      AND NOT EXISTS (SELECT 1 FROM availability_blocks ab WHERE ab.agency_id=v.agency_id AND ab.vehicle_id=v.id AND ab.archived_at IS NULL AND ab.start_at < ? AND ab.end_at > ?)
    ORDER BY b.city, v.daily_rate, v.plate
  `,[context.agencyId, new Date(returned).toISOString(), new Date(pickup).toISOString(), new Date(returned).toISOString(), new Date(pickup).toISOString()]);
}
