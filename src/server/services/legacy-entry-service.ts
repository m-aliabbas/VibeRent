import "server-only";

import { randomUUID } from "node:crypto";
import { execute, inTransaction, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";

export type LegacyBookingInput = {
  vehicleId: string;
  customerId: string;
  pickupAt: string;
  returnAt: string;
  totalAmount: number;
  receivedAmount: number;
  paymentMethod: string;
  expense?: { amount: number; category: string; description: string };
};

export async function recordLegacyBooking(context: RequestContext, raw: LegacyBookingInput) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  const input = raw as Partial<LegacyBookingInput> | null;
  const errors: Record<string, string> = {};
  if (!input?.vehicleId) errors.vehicleId = "Select a vehicle.";
  if (!input?.customerId) errors.customerId = "Select a customer.";
  const pickup = Date.parse(input?.pickupAt ?? "");
  const returned = Date.parse(input?.returnAt ?? "");
  if (!Number.isFinite(pickup)) errors.pickupAt = "Enter a valid check-out date.";
  if (!Number.isFinite(returned) || returned <= pickup) errors.returnAt = "Check-in must be after check-out.";
  if (!Number.isSafeInteger(input?.totalAmount) || input!.totalAmount! < 0) errors.totalAmount = "Enter a non-negative whole PKR amount.";
  if (!Number.isSafeInteger(input?.receivedAmount) || input!.receivedAmount! < 0 || input!.receivedAmount! > input!.totalAmount!) errors.receivedAmount = "Received amount must be between zero and the total.";
  if (input?.receivedAmount && !input.paymentMethod?.trim()) errors.paymentMethod = "Select a payment method.";
  if (input?.expense && (!Number.isSafeInteger(input.expense.amount) || input.expense.amount <= 0 || !input.expense.category?.trim() || !input.expense.description?.trim())) errors.expense = "Enter an expense amount, category, and description.";
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the legacy booking details.", 400, errors);

  return inTransaction(async () => {
    const vehicle = await queryOne<{id:string;branchId:string;city:string;dailyRate:number}>("SELECT v.id,v.branch_id AS branchId,b.city,v.daily_rate AS dailyRate FROM vehicles v JOIN branches b ON b.id=v.branch_id AND b.agency_id=v.agency_id WHERE v.agency_id=? AND v.id=? AND v.archived_at IS NULL",[context.agencyId, input!.vehicleId]);
    if (!vehicle) throw new DomainError("NOT_FOUND", "Vehicle not found.", 404);
    const customer = await queryOne<{id:string;status:string}>("SELECT id,status FROM customers WHERE agency_id=? AND id=? AND archived_at IS NULL",[context.agencyId, input!.customerId]);
    if (!customer || customer.status === "blacklisted") throw new DomainError("VALIDATION_FAILED", "Choose an active customer.", 400, {customerId:"Choose an active customer."});
    if (input!.expense) {
      const category = await queryOne<{name:string}>("SELECT name FROM expense_categories WHERE agency_id=? AND active=1 AND lower(name)=lower(?)",[context.agencyId, input!.expense.category]);
      if (!category) throw new DomainError("VALIDATION_FAILED", "Choose an active expense category.", 400, {expense:"Choose an active expense category."});
    }
    const now = new Date().toISOString();
    const pickupAt = new Date(pickup).toISOString();
    const returnAt = new Date(returned).toISOString();
    const days = Math.max(1, Math.ceil((returned-pickup)/86_400_000));
    const id = `BKG-${randomUUID().slice(0,8).toUpperCase()}`;
    await execute(`INSERT INTO booking_number_counters (agency_id,next_number,created_at,updated_at)
      VALUES (?,coalesce((SELECT max(public_number)+1 FROM bookings WHERE agency_id=?),1),?,?)
      ON CONFLICT(agency_id) DO NOTHING`,[context.agencyId,context.agencyId,now,now]);
    const counter = await queryOne<{nextNumber:number}>("SELECT next_number AS nextNumber FROM booking_number_counters WHERE agency_id=? LIMIT 1 /*postgres:for-update*/",[context.agencyId]);
    if (!counter) throw new DomainError("INTERNAL_ERROR", "Booking number could not be generated.", 500);
    await execute("UPDATE booking_number_counters SET next_number=next_number+1,updated_at=? WHERE agency_id=?",[now,context.agencyId]);
    await execute(`INSERT INTO bookings (id,agency_id,public_number,branch_id,vehicle_id,customer_id,fulfillment_type,rental_mode,renter_skipped,destination_city,pickup_at,return_at,status,daily_rate,pricing_mode,estimated_km,mileage_rate,terms_snapshot,extras,discount,total_amount,deposit_required,source,notes,completed_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'fleet','self_drive',0,?,?,?,'completed',?,'legacy_entry',0,0,'',0,0,?,0,'legacy_entry','Imported historical booking',?,?,?)`,[id,context.agencyId,counter.nextNumber,vehicle.branchId,vehicle.id,customer.id,vehicle.city,pickupAt,returnAt,Math.round(input!.totalAmount!/days),input!.totalAmount,returnAt,now,now]);
    if (input!.receivedAmount! > 0) {
      const transactionId=`TXN-${randomUUID().slice(0,8).toUpperCase()}`;
      await execute(`INSERT INTO payment_receipt_counters (agency_id,next_number,created_at,updated_at)
        VALUES (?,coalesce((SELECT max(receipt_number)+1 FROM financial_transactions WHERE agency_id=?),1),?,?)
        ON CONFLICT(agency_id) DO NOTHING`,[context.agencyId,context.agencyId,now,now]);
      const receipt=await queryOne<{nextNumber:number}>("SELECT next_number AS nextNumber FROM payment_receipt_counters WHERE agency_id=? LIMIT 1 /*postgres:for-update*/",[context.agencyId]);
      if (!receipt) throw new DomainError("INTERNAL_ERROR", "Payment receipt number could not be generated.", 500);
      await execute("UPDATE payment_receipt_counters SET next_number=next_number+1,updated_at=? WHERE agency_id=?",[now,context.agencyId]);
      await execute(`INSERT INTO financial_transactions (id,agency_id,receipt_number,booking_id,customer_id,kind,amount,method,reference,idempotency_key,status,actor_id,posted_at,created_at,updated_at) VALUES (?,?,?,?,?,'payment',?,?,?,?,'posted',?,?,?,?)`,[transactionId,context.agencyId,receipt.nextNumber,id,customer.id,input!.receivedAmount,input!.paymentMethod!.trim(),"Legacy data entry",`legacy_${id}`,context.userId,returnAt,now,now]);
    }
    if (input!.expense) {
      const expenseId=`EXP-${randomUUID().slice(0,8).toUpperCase()}`;
      await execute(`INSERT INTO expenses (id,agency_id,vehicle_id,booking_id,customer_id,amount,category,description,status,occurred_on,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'approved',?,1,?,?)`,[expenseId,context.agencyId,vehicle.id,id,customer.id,input!.expense.amount,input!.expense.category.trim(),input!.expense.description.trim(),returnAt.slice(0,10),now,now]);
      await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",[randomUUID(),context.agencyId,context.userId,"expense.approved","expense",expenseId,JSON.stringify({bookingId:id,source:"legacy_entry"}),now]);
    }
    await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",[randomUUID(),context.agencyId,context.userId,"booking.legacy_imported","booking",id,JSON.stringify({vehicleId:vehicle.id,totalAmount:input!.totalAmount,receivedAmount:input!.receivedAmount}),now]);
    return {id,publicNumber:counter.nextNumber};
  },{immediate:true});
}
