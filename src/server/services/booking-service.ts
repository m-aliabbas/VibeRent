import "server-only";
import { randomUUID } from "node:crypto";
import { getTermsSnapshotForBooking } from "@/server/services/organization-settings-service";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import type { BookingInspectionDto, BookingListItem, BookingTransactionDto, SourcePayoutDto } from "@/server/repositories/contracts";
import {
  parseConfirmBookingInput,
  parseRecordDepositInput,
  parseRecordPaymentInput,
  parseReverseTransactionInput,
} from "@/server/validation/booking";
import { parseCheckInRentalInput, parseRentalInspectionInput, type CheckInRentalInput } from "@/server/validation/rental-operation";
import { calculateLateReturn, formatLateReturnDuration } from "@/lib/rental-time";

async function allocatePaymentReceiptNumber(agencyId: string, now: string) {
  await execute(`INSERT INTO payment_receipt_counters (agency_id,next_number,created_at,updated_at)
    VALUES (?,coalesce((SELECT max(receipt_number)+1 FROM financial_transactions WHERE agency_id=?),1),?,?)
    ON CONFLICT(agency_id) DO NOTHING`,[agencyId, agencyId, now, now]);
  const counter = await queryOne<{ nextNumber: number }>("SELECT next_number AS nextNumber FROM payment_receipt_counters WHERE agency_id=? LIMIT 1 /*postgres:for-update*/",[agencyId]);
  if (!counter) throw new DomainError("INTERNAL_ERROR", "Payment receipt number could not be generated.", 500);
  await execute("UPDATE payment_receipt_counters SET next_number=next_number+1,updated_at=? WHERE agency_id=?",[now, agencyId]);
  return counter.nextNumber;
}

type BookingRow = {
  id: string; public_number: number | null; customer_id: string; customer: string; vehicle_id: string|null; make: string|null; model: string|null; year: number|null; plate: string|null; city: string;
  fulfillment_type:"fleet"|"external";external_supplier_name:string|null;external_supplier_phone:string|null;external_vehicle_make:string|null;external_vehicle_model:string|null;external_vehicle_year:number|null;external_vehicle_plate:string|null;supplier_pricing_mode:"percentage"|"fixed"|null;supplier_share_percent:number|null;supplier_fixed_cost:number|null;supplier_payable:number|null;
  rental_mode:"self_drive"|"with_driver";renter_skipped:number;driver_id:string|null;driver:string|null;
  guarantor_name:string|null;guarantor_parentage:string|null;guarantor_cnic:string|null;guarantor_phone:string|null;guarantor_address:string|null;guarantor_car_amount:number|null;
  destination_city: string; pickup_at: string; return_at: string; daily_rate: number; pricing_mode:string; estimated_km:number; mileage_rate:number; rate_override_reason:string|null; terms_snapshot:string; extras: number; discount: number; total_amount: number; deposit_required: number; paid: number; deposit_held: number; payment_state:string; supplier_paid:number; status: string; source: string; notes: string | null; version:number;
};

const displayStatus: Record<string, BookingListItem["status"]> = { draft: "Draft", confirmed: "Confirmed", checked_out: "Checked Out", completed: "Completed", cancelled: "Cancelled", no_show: "No Show" };

export type AvailabilityBlockDto = { id: string; vehicleId: string; from: string; to: string; reason: string; kind: string };

export async function listBookings(context: RequestContext): Promise<BookingListItem[]> {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const rows = await queryAll<BookingRow>(`
    SELECT bk.*, c.name AS customer, d.name AS driver, v.make, v.model, v.year, v.plate, br.city,
      coalesce((
        SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal') THEN -ft.amount ELSE ft.amount END)
        FROM financial_transactions ft
        WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted'
          AND lower(ft.kind) IN ('payment','late_return_charge','deposit_applied','reversal','refund')
      ), 0) AS paid,
      coalesce((
        SELECT sum(CASE WHEN lower(ft.kind) IN ('deposit_refunded','deposit_applied','deposit_forfeited') THEN -ft.amount ELSE ft.amount END)
        FROM financial_transactions ft
        WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted'
          AND lower(ft.kind) IN ('deposit_received','deposit_refunded','deposit_applied','deposit_forfeited')
      ), 0) AS deposit_held,
      CASE
        WHEN EXISTS(SELECT 1 FROM financial_transactions p WHERE p.agency_id=bk.agency_id AND p.booking_id=bk.id AND p.status='posted' AND lower(p.kind) IN ('payment','late_return_charge','deposit_applied'))
          AND NOT EXISTS(SELECT 1 FROM financial_transactions p WHERE p.agency_id=bk.agency_id AND p.booking_id=bk.id AND p.status='posted' AND lower(p.kind) IN ('payment','late_return_charge','deposit_applied') AND NOT EXISTS(SELECT 1 FROM financial_transactions a WHERE a.agency_id=p.agency_id AND a.linked_transaction_id=p.id AND a.status='posted' AND lower(a.kind) IN ('reversal','refund')))
          THEN 'Payment reversed'
        WHEN coalesce((SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal') THEN -ft.amount ELSE ft.amount END) FROM financial_transactions ft WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted' AND lower(ft.kind) IN ('payment','late_return_charge','deposit_applied','reversal','refund')),0)>=bk.total_amount THEN 'Paid'
        WHEN coalesce((SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal') THEN -ft.amount ELSE ft.amount END) FROM financial_transactions ft WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted' AND lower(ft.kind) IN ('payment','late_return_charge','deposit_applied','reversal','refund')),0)>0 THEN 'Partially paid'
        ELSE 'Unpaid'
      END AS payment_state,
      coalesce((SELECT sum(sp.amount) FROM source_payouts sp WHERE sp.agency_id=bk.agency_id AND sp.booking_id=bk.id AND sp.status='posted'),0) AS supplier_paid
    FROM bookings bk
    JOIN customers c ON c.id=bk.customer_id AND c.agency_id=bk.agency_id
    LEFT JOIN drivers d ON d.id=bk.driver_id AND d.agency_id=bk.agency_id
    LEFT JOIN vehicles v ON v.id=bk.vehicle_id AND v.agency_id=bk.agency_id
    JOIN branches br ON br.id=bk.branch_id AND br.agency_id=bk.agency_id
    WHERE bk.agency_id=? AND bk.archived_at IS NULL
    ORDER BY bk.pickup_at DESC
  `,[context.agencyId]);

  return rows.map((row) => {
    const days = Math.max(1, Math.ceil((Date.parse(row.return_at) - Date.parse(row.pickup_at)) / 86_400_000));
    return {
      id: row.id,
      publicNumber: row.public_number,
      customerId: row.customer_id,
      customer: row.customer,
      rentalMode:row.rental_mode,
      renterSkipped:Boolean(row.renter_skipped),
      driverId:row.driver_id,
      driver:row.driver,
      vehicleId: row.vehicle_id ?? "",
      vehicle: row.fulfillment_type==="external"?`${row.external_vehicle_make} ${row.external_vehicle_model}${row.external_vehicle_year?` ${row.external_vehicle_year}`:""}`:`${row.make} ${row.model} ${row.year}`,
      plate: row.fulfillment_type==="external"?(row.external_vehicle_plate??""):(row.plate??""),
      fulfillmentType:row.fulfillment_type,
      externalSupplierName:row.external_supplier_name??undefined,
      externalSupplierPhone:row.external_supplier_phone??undefined,
      supplierPricingMode:row.supplier_pricing_mode??undefined,
      supplierSharePercent:row.supplier_share_percent??undefined,
      supplierFixedCost:row.supplier_fixed_cost??undefined,
      supplierPayable:row.supplier_payable??undefined,
      supplierPaid:row.supplier_paid,
      supplierBalance:Math.max(0,(row.supplier_payable??0)-row.supplier_paid),
      city: row.city,
      destinationCity: row.destination_city,
      pickupAt: row.pickup_at,
      returnAt: row.return_at,
      dailyRate: row.daily_rate,
      days,
      extras: row.extras,
      discount: row.discount,
      tax: 0,
      deposit: row.deposit_required,
      depositHeld: row.deposit_held,
      paid: row.paid,
      paymentStatus: row.payment_state as BookingListItem["paymentStatus"],
      status: displayStatus[row.status],
      source: row.source,
      notes: row.notes ?? "",
      estimatedKm: row.estimated_km,
      mileageRate: row.mileage_rate,
      pricingMode: row.pricing_mode,
      rateOverrideReason: row.rate_override_reason ?? "",
      termsSnapshot: row.terms_snapshot,
      version: row.version,
    };
  });
}

export type BookingDraftReference = { id: string; publicNumber: number; expiresAt: string };

async function allocateBookingDraftInTransaction(context: RequestContext): Promise<BookingDraftReference> {
  const now = new Date();
  const nowIso = now.toISOString();
  await execute("UPDATE booking_drafts SET status='expired',updated_at=? WHERE agency_id=? AND status='active' AND expires_at<=?",[nowIso, context.agencyId, nowIso]);
  await execute(`INSERT INTO booking_number_counters (agency_id,next_number,created_at,updated_at)
    VALUES (?,coalesce((SELECT max(public_number)+1 FROM bookings WHERE agency_id=?),1),?,?)
    ON CONFLICT(agency_id) DO NOTHING`,[context.agencyId, context.agencyId, nowIso, nowIso]);
  const counter = (await queryOne<{ nextNumber: number }>("SELECT next_number AS nextNumber FROM booking_number_counters WHERE agency_id=? LIMIT 1 /*postgres:for-update*/",[context.agencyId]))!;
  await execute("UPDATE booking_number_counters SET next_number=next_number+1,updated_at=? WHERE agency_id=?",[nowIso, context.agencyId]);
  const reference = { id: `bkd_${randomUUID()}`, publicNumber: counter.nextNumber, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString() };
  await execute(`INSERT INTO booking_drafts (id,agency_id,actor_id,public_number,status,expires_at,created_at,updated_at)
    VALUES (?,?,?,?,'active',?,?,?)`,[reference.id, context.agencyId, context.userId, reference.publicNumber, reference.expiresAt, nowIso, nowIso]);
  await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,[randomUUID(), context.agencyId, context.userId, "booking.number_allocated", "booking_draft", reference.id, JSON.stringify({ publicNumber: reference.publicNumber }), nowIso]);
  return reference;
}

export async function startBooking(context: RequestContext, existingDraftId?: string): Promise<BookingDraftReference> {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  return inTransaction(async () => {
    if (existingDraftId) {
      const existing = await queryOne<BookingDraftReference>(
        `SELECT id,public_number AS publicNumber,expires_at AS expiresAt FROM booking_drafts WHERE agency_id=? AND actor_id=? AND id=? AND status='active' AND expires_at>? LIMIT 1`,
        [context.agencyId, context.userId, existingDraftId, new Date().toISOString()],
      );
      if (existing) return existing;
    }
    return allocateBookingDraftInTransaction(context);
  },{immediate:true});
}

export async function getBooking(context: RequestContext, id: string) {
  const booking = (await listBookings(context)).find((item) => item.id === id);
  if (!booking) throw new DomainError("NOT_FOUND", "Booking not found.", 404);
  const renter = await queryOne<{ customerCnic: string; customerPhone: string; guarantorName:string|null;guarantorParentage:string|null;guarantorCnic:string|null;guarantorPhone:string|null;guarantorAddress:string|null;guarantorCarAmount:number|null }>(`SELECT c.cnic_normalized AS customerCnic,c.phone_normalized AS customerPhone,
      b.guarantor_name AS guarantorName,b.guarantor_parentage AS guarantorParentage,b.guarantor_cnic AS guarantorCnic,
      b.guarantor_phone AS guarantorPhone,b.guarantor_address AS guarantorAddress,b.guarantor_car_amount AS guarantorCarAmount
    FROM customers c
    JOIN bookings b ON b.customer_id=c.id AND b.agency_id=c.agency_id
    WHERE b.agency_id=? AND b.id=? LIMIT 1`,[context.agencyId, id]);
  const inspections = await queryAll<BookingInspectionDto>(`SELECT kind, odometer, fuel_level AS fuelLevel, condition_notes AS conditionNotes, occurred_at AS occurredAt FROM rental_inspections WHERE agency_id=? AND booking_id=? ORDER BY occurred_at`,[context.agencyId, id]);
  const transactions = await queryAll<BookingTransactionDto>(`
    SELECT ft.id, ft.receipt_number AS receiptNumber, ft.booking_id AS bookingId, ft.customer_id AS customerId, ft.kind, ft.amount, ft.method, ft.reference, ft.linked_transaction_id AS linkedTransactionId,
      CASE
        WHEN EXISTS(SELECT 1 FROM financial_transactions adj WHERE adj.agency_id=ft.agency_id AND adj.linked_transaction_id=ft.id AND lower(adj.kind)='refund') THEN 'refunded'
        WHEN EXISTS(SELECT 1 FROM financial_transactions adj WHERE adj.agency_id=ft.agency_id AND adj.linked_transaction_id=ft.id AND lower(adj.kind)='reversal') THEN 'reversed'
        ELSE ft.status
      END AS status,
      ft.posted_at AS postedAt, ft.created_at AS createdAt
    FROM financial_transactions ft
    WHERE ft.agency_id=? AND ft.booking_id=?
    ORDER BY ft.posted_at DESC, ft.created_at DESC
  `,[context.agencyId, id]);
  const sourcePayouts=await queryAll<SourcePayoutDto>(`SELECT id,amount,method,reference,status,paid_at AS paidAt FROM source_payouts WHERE agency_id=? AND booking_id=? ORDER BY paid_at DESC,created_at DESC`,[context.agencyId,id]);
  const guarantor=renter?.guarantorName&&renter.guarantorParentage&&renter.guarantorCnic&&renter.guarantorPhone&&renter.guarantorAddress&&renter.guarantorCarAmount?{
    name:renter.guarantorName,parentage:renter.guarantorParentage,cnic:renter.guarantorCnic,phone:renter.guarantorPhone,address:renter.guarantorAddress,carAmount:renter.guarantorCarAmount,
  }:undefined;
  return { ...booking, customerCnic:renter?.customerCnic, customerPhone:renter?.customerPhone, guarantor, inspections, transactions, sourcePayouts };
}

export async function listAvailabilityBlocks(context: RequestContext): Promise<AvailabilityBlockDto[]> {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  return queryAll<AvailabilityBlockDto>(`SELECT id,vehicle_id AS vehicleId,start_at AS "from",end_at AS "to",reason,kind FROM availability_blocks WHERE agency_id=? AND archived_at IS NULL ORDER BY start_at`,[context.agencyId]);
}

export async function createAvailabilityBlock(context: RequestContext, rawInput: unknown): Promise<AvailabilityBlockDto> {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  const input = rawInput as Partial<{ vehicleId: string; from: string; to: string; reason: string; kind: string }>;
  const fromDate = new Date(input.from ?? "");
  const toDate = new Date(input.to ?? "");
  const errors: Record<string,string> = {};
  if (!input.vehicleId) errors.vehicleId = "Choose a vehicle.";
  if (!Number.isFinite(fromDate.getTime())) errors.from = "Enter a valid start time.";
  if (!Number.isFinite(toDate.getTime()) || toDate <= fromDate) errors.to = "End time must be after the start time.";
  if (!input.reason?.trim()) errors.reason = "Enter a reason.";
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the availability block.", 400, errors);
  const from = fromDate.toISOString(); const to = toDate.toISOString();
  return inTransaction(async () => {
    const vehicle = await queryOne("SELECT id FROM vehicles WHERE agency_id=? AND id=? AND archived_at IS NULL LIMIT 1 /*postgres:for-update*/",[context.agencyId, input.vehicleId]);
    if (!vehicle) throw new DomainError("NOT_FOUND", "Vehicle not found.", 404);
    const booking = await queryOne(`SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=? AND status IN ('confirmed','checked_out') AND pickup_at<? AND return_at>? LIMIT 1`,[context.agencyId, input.vehicleId, to, from]);
    const block = await queryOne(`SELECT id FROM availability_blocks WHERE agency_id=? AND vehicle_id=? AND archived_at IS NULL AND start_at<? AND end_at>? LIMIT 1`,[context.agencyId, input.vehicleId, to, from]);
    if (booking || block) throw new DomainError("BOOKING_CONFLICT", "This vehicle already has a booking or block in that period.", 409);
    const id = `blk_${randomUUID()}`; const now = new Date().toISOString(); const kind = input.kind?.trim() || "operational";
    await execute(`INSERT INTO availability_blocks (id,agency_id,vehicle_id,start_at,end_at,kind,reason,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)`,[id, context.agencyId, input.vehicleId, from, to, kind, input.reason!.trim(), now, now]);
    await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,[randomUUID(), context.agencyId, context.userId, "availability.blocked", "availability_block", id, JSON.stringify({ vehicleId: input.vehicleId, from, to }), now]);
    return { id, vehicleId: input.vehicleId!, from, to, reason: input.reason!.trim(), kind };
  },{immediate:true});
}

export async function checkOutRental(context: RequestContext, bookingId: string, rawInput: unknown) {
  return transitionRental(context, bookingId, "checkout", rawInput);
}

export async function checkInRental(context: RequestContext, bookingId: string, rawInput: unknown) {
  return transitionRental(context, bookingId, "checkin", rawInput);
}

async function transitionRental(context: RequestContext, bookingId: string, kind: "checkout" | "checkin", rawInput: unknown) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  const input = kind === "checkin" ? parseCheckInRentalInput(rawInput) : parseRentalInspectionInput(rawInput);
  return inTransaction(async () => {
    const booking = await queryOne<{ id: string; vehicleId: string|null; customerId: string; status: string; version: number; totalAmount: number; returnAt:string; paid: number; fulfillmentType:"fleet"|"external"; supplierPricingMode:"percentage"|"fixed"|null; supplierSharePercent:number|null; supplierPayable:number|null }>(`SELECT bk.id, bk.vehicle_id AS vehicleId, bk.customer_id AS customerId, bk.status, bk.version, bk.total_amount AS totalAmount,
      bk.return_at AS returnAt,bk.fulfillment_type AS fulfillmentType,bk.supplier_pricing_mode AS supplierPricingMode,bk.supplier_share_percent AS supplierSharePercent,bk.supplier_payable AS supplierPayable,
      coalesce((SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal') THEN -ft.amount ELSE ft.amount END) FROM financial_transactions ft WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted' AND lower(ft.kind) IN ('payment','late_return_charge','deposit_applied','reversal','refund')),0) AS paid
      FROM bookings bk WHERE bk.agency_id=? AND bk.id=? LIMIT 1 /*postgres:for-update*/`,[context.agencyId, bookingId]);
    if (!booking) throw new DomainError("NOT_FOUND", "Booking not found.", 404);
    const expectedStatus = kind === "checkout" ? "confirmed" : "checked_out";
    if (booking.status !== expectedStatus) throw new DomainError("INVALID_STATUS_TRANSITION", `A ${booking.status} booking cannot be ${kind === "checkout" ? "checked out" : "checked in"}.`, 409);
    if (input.version !== undefined && input.version !== booking.version) throw new DomainError("VERSION_CONFLICT", "The booking changed since it was loaded.", 409);
    if (kind === "checkin") {
      const checkout = await queryOne<{ odometer: number }>(`SELECT odometer FROM rental_inspections WHERE agency_id=? AND booking_id=? AND kind='checkout' LIMIT 1`,[context.agencyId, bookingId]);
      if (!checkout) throw new DomainError("INVALID_STATUS_TRANSITION", "A check-out inspection is required before check-in.", 409);
      if (input.odometer < checkout.odometer) throw new DomainError("VALIDATION_FAILED", "Check-in odometer cannot be lower than check-out.", 400, { odometer: "Enter a reading at or above the check-out reading." });
    }
    const now = new Date().toISOString();
    await execute(`INSERT INTO rental_inspections (id,agency_id,booking_id,kind,odometer,fuel_level,condition_notes,actor_id,occurred_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,[randomUUID(), context.agencyId, bookingId, kind, input.odometer, input.fuelLevel, input.conditionNotes, context.userId, now, now, now]);
    if (kind === "checkout") {
      await execute(`UPDATE bookings SET status='checked_out', checked_out_at=?, version=version+1, updated_at=? WHERE agency_id=? AND id=?`,[now, now, context.agencyId, bookingId]);
      if(booking.vehicleId)await execute(`UPDATE vehicles SET status='booked', version=version+1, updated_at=? WHERE agency_id=? AND id=?`,[now, context.agencyId, booking.vehicleId]);
    } else {
      const lateDuration=calculateLateReturn(booking.returnAt,now);
      const lateReturnCharge=(input as CheckInRentalInput).lateReturnCharge;
      if(lateReturnCharge&&!lateDuration.late)throw new DomainError("VALIDATION_FAILED","A late-return charge can only be added after the agreed return time.",400,{lateReturnCharge:"This vehicle is not late."});
      if(lateReturnCharge){
        const receiptNumber=await allocatePaymentReceiptNumber(context.agencyId,now);
        const transactionId=`TXN-${randomUUID().slice(0,8).toUpperCase()}`;
        const lateLabel=formatLateReturnDuration(lateDuration);
        const reference=lateReturnCharge.reference||`Late return: ${lateLabel} after agreed return`;
        const nextSupplierPayable=booking.fulfillmentType==="external"&&booking.supplierPricingMode==="percentage"
          ? Math.round((booking.totalAmount+lateReturnCharge.amount)*(booking.supplierSharePercent??83)/100)
          : booking.supplierPayable;
        await execute(`UPDATE bookings SET extras=extras+?,total_amount=total_amount+?,supplier_payable=? WHERE agency_id=? AND id=?`,[lateReturnCharge.amount,lateReturnCharge.amount,nextSupplierPayable,context.agencyId,bookingId]);
        await execute(`INSERT INTO financial_transactions (id,agency_id,receipt_number,booking_id,customer_id,kind,amount,method,reference,idempotency_key,status,actor_id,posted_at,created_at,updated_at) VALUES (?,?,?,?,?,'late_return_charge',?,?,?,?, 'posted',?,?,?,?)`,[transactionId,context.agencyId,receiptNumber,bookingId,booking.customerId,lateReturnCharge.amount,lateReturnCharge.method??"Cash",reference,`late_return_${bookingId}_${booking.version}`,context.userId,now,now,now]);
        await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,[randomUUID(),context.agencyId,context.userId,"booking.late_return_charge_posted","booking",bookingId,JSON.stringify({transactionId,receiptNumber,amount:lateReturnCharge.amount,lateMinutes:lateDuration.minutes,agreedReturnAt:booking.returnAt,checkedInAt:now,method:lateReturnCharge.method??"Cash",reference}),now]);
      }
      await execute(`UPDATE bookings SET status='completed', completed_at=?, version=version+1, updated_at=? WHERE agency_id=? AND id=?`,[now, now, context.agencyId, bookingId]);
      if(booking.vehicleId)await execute(`UPDATE vehicles SET status='available', version=version+1, updated_at=? WHERE agency_id=? AND id=?`,[now, context.agencyId, booking.vehicleId]);
      const payment = (input as CheckInRentalInput).payment;
      if (payment) {
        const balance = booking.totalAmount + (lateReturnCharge?.amount??0) - booking.paid - (lateReturnCharge?.amount??0);
        if (payment.amount > balance) throw new DomainError("VALIDATION_FAILED", "Check-in payment cannot exceed the outstanding balance.", 400, { amount: `Amount exceeds the outstanding balance of PKR ${balance.toLocaleString()}.` });
        const idempotencyKey = payment.idempotencyKey || `checkin_pay_${bookingId}_${booking.version}`;
        const existing = await queryOne("SELECT id FROM financial_transactions WHERE agency_id=? AND idempotency_key=?",[context.agencyId, idempotencyKey]);
        if (!existing) {
          const transactionId = `TXN-${randomUUID().slice(0, 8).toUpperCase()}`;
          const receiptNumber = await allocatePaymentReceiptNumber(context.agencyId, now);
          await execute(`INSERT INTO financial_transactions (id,agency_id,receipt_number,booking_id,customer_id,kind,amount,method,reference,idempotency_key,status,actor_id,posted_at,created_at,updated_at) VALUES (?,?,?,?,?, 'payment',?,?,?,?, 'posted',?,?,?,?)`,[transactionId, context.agencyId, receiptNumber, bookingId, booking.customerId, payment.amount, payment.method, payment.reference ?? "", idempotencyKey, context.userId, now, now, now]);
          await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,[randomUUID(), context.agencyId, context.userId, "booking.payment_posted", "booking", bookingId, JSON.stringify({ transactionId, receiptNumber, amount: payment.amount, method: payment.method, reference: payment.reference, source: "checkin" }), now]);
        }
      }
    }
    await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,[randomUUID(), context.agencyId, context.userId, `booking.${kind === "checkout" ? "checked_out" : "checked_in"}`, "booking", bookingId, JSON.stringify({ odometer: input.odometer, fuelLevel: input.fuelLevel, ...(kind==="checkin"?{lateMinutes:calculateLateReturn(booking.returnAt,now).minutes}: {}) }), now]);
    return getBooking(context, bookingId);
  },{immediate:true});
}

export async function confirmBooking(context: RequestContext, rawInput: unknown) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  const input = parseConfirmBookingInput(rawInput);
  return inTransaction(async () => {
    const bookingDraft = input.bookingDraftId
      ? await queryOne<{ id: string; publicNumber: number }>(`SELECT id,public_number AS publicNumber FROM booking_drafts WHERE agency_id=? AND actor_id=? AND id=? AND status='active' AND expires_at>? LIMIT 1`,[context.agencyId, context.userId, input.bookingDraftId, new Date().toISOString()])
      : await allocateBookingDraftInTransaction(context);
    if (!bookingDraft) throw new DomainError("VERSION_CONFLICT", "This booking number expired or was already used. Start a new booking and try again.", 409);
    const vehicle = input.fulfillmentType==="fleet"?await queryOne<{ id: string; branch_id: string; daily_rate: number; with_driver_rate:number|null; status: string }>(`SELECT v.id, v.branch_id, v.daily_rate, v.with_driver_rate, v.status FROM vehicles v WHERE v.agency_id=? AND v.id=? AND v.archived_at IS NULL LIMIT 1 /*postgres:for-update*/`,[context.agencyId, input.vehicleId]):undefined;
    if (input.fulfillmentType==="fleet"&&!vehicle) throw new DomainError("NOT_FOUND", "Vehicle not found.", 404);
    if (vehicle&&vehicle.status!=="available") throw new DomainError("BOOKING_CONFLICT", "The vehicle is not available for booking.", 409);
    const externalBranch=input.fulfillmentType==="external"?await queryOne<{id:string}>("SELECT id FROM branches WHERE agency_id=? AND active=1 ORDER BY created_at LIMIT 1",[context.agencyId]):undefined;
    if(input.fulfillmentType==="external"&&!externalBranch)throw new DomainError("NOT_FOUND","Add an active branch before creating a sourced booking.",404);
    if(input.rentalMode==="with_driver"){
      const driver=await queryOne("SELECT id FROM drivers WHERE agency_id=? AND id=? AND status='active' AND archived_at IS NULL",[context.agencyId,input.driverId]);
      if(!driver)throw new DomainError("NOT_FOUND","Select an active driver.",404);
    }
    let customerId=input.customerId;
    if(input.rentalMode==="with_driver"&&input.renterSkipped){
      const guestCnic=`WD${context.agencyId}`.replace(/[^a-zA-Z0-9]/g,"").slice(0,32);
      const existingGuest=await queryOne<{id:string}>("SELECT id FROM customers WHERE agency_id=? AND cnic_normalized=? LIMIT 1",[context.agencyId,guestCnic]);
      customerId=existingGuest?.id??`cus_${randomUUID()}`;
      if(!existingGuest){const now=new Date().toISOString();await execute(`INSERT INTO customers (id,agency_id,name,phone_normalized,cnic_normalized,status,version,created_at,updated_at) VALUES (?,?, 'With-driver guest','',?,'active',1,?,?)`,[customerId,context.agencyId,guestCnic,now,now])}
    }
    const customer = await queryOne<{ id: string; status: string }>("SELECT id, status FROM customers WHERE agency_id=? AND id=? LIMIT 1",[context.agencyId, customerId]);
    if (!customer) throw new DomainError("NOT_FOUND", "Customer not found.", 404);
    if (customer.status === "blacklisted") throw new DomainError("FORBIDDEN", "This customer cannot be booked.", 403);
    const bookingConflict = input.fulfillmentType==="fleet"?await queryOne<{ id: string }>(`SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=? AND status IN ('confirmed','checked_out') AND pickup_at < ? AND return_at > ? LIMIT 1`,[context.agencyId, input.vehicleId, input.returnAt, input.pickupAt]):undefined;
    if (bookingConflict) throw new DomainError("BOOKING_CONFLICT", "The vehicle is no longer available for the selected period.", 409);
    const blockConflict = input.fulfillmentType==="fleet"?await queryOne<{ id: string }>(`SELECT id FROM availability_blocks WHERE agency_id=? AND vehicle_id=? AND start_at < ? AND end_at > ? LIMIT 1`,[context.agencyId, input.vehicleId, input.returnAt, input.pickupAt]):undefined;
    if (blockConflict) throw new DomainError("BOOKING_CONFLICT", "An availability block overlaps the selected period.", 409);
    const days = Math.max(1, Math.ceil((Date.parse(input.returnAt) - Date.parse(input.pickupAt)) / 86_400_000));
    const rule = input.fulfillmentType==="fleet"?await queryOne<{dailyRate:number;perKmRate:number;minimumDays:number}>(`SELECT daily_rate AS dailyRate,per_km_rate AS perKmRate,minimum_days AS minimumDays FROM vehicle_rate_rules WHERE agency_id=? AND vehicle_id=? AND active=1 AND lower(destination_city)=lower(?) LIMIT 1`,[context.agencyId,input.vehicleId,input.destinationCity]):undefined;
    if (rule && days < rule.minimumDays) throw new DomainError("VALIDATION_FAILED", `This destination requires at least ${rule.minimumDays} rental days.`, 400, { returnAt: `Choose at least ${rule.minimumDays} days.` });
    const dailyRate = input.dailyRateOverride ?? (input.rentalMode==="with_driver"?(vehicle!.with_driver_rate??vehicle!.daily_rate):rule?.dailyRate??vehicle!.daily_rate);
    const mileageRate = rule?.perKmRate ?? 0;
    const pricingMode = input.dailyRateOverride !== undefined ? "manual_override" : rule ? (mileageRate > 0 ? "destination_plus_mileage" : "destination_fixed") : "vehicle_default";
    const subtotal = dailyRate * days + mileageRate * input.estimatedKm;
    if (input.discount > subtotal + input.extras) throw new DomainError("VALIDATION_FAILED", "Discount cannot exceed the booking subtotal.", 400, { discount: "Reduce the discount." });
    const totalAmount = subtotal + input.extras - input.discount;
    const supplierPayable=input.fulfillmentType==="external"?(input.external!.pricingMode==="percentage"?Math.round(totalAmount*(input.external!.supplierSharePercent??83)/100):(input.external!.supplierFixedCost??0)):null;
    if(supplierPayable!==null&&supplierPayable>totalAmount)throw new DomainError("VALIDATION_FAILED","Supplier cost cannot exceed the customer total.",400,{"external.supplierFixedCost":"Reduce the supplier cost or increase the customer price."});
    const id = `BKG-${randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    const termsSnapshot = await getTermsSnapshotForBooking(context);
    await execute(`INSERT INTO bookings (
      id,agency_id,public_number,branch_id,vehicle_id,customer_id,driver_id,rental_mode,renter_skipped,fulfillment_type,external_supplier_name,external_supplier_phone,external_vehicle_make,external_vehicle_model,external_vehicle_year,external_vehicle_plate,external_vehicle_color,supplier_pricing_mode,supplier_share_percent,supplier_fixed_cost,supplier_payable,
      guarantor_name,guarantor_parentage,guarantor_cnic,guarantor_phone,guarantor_address,guarantor_car_amount,
      destination_city,pickup_at,return_at,status,daily_rate,pricing_mode,estimated_km,mileage_rate,rate_override_reason,
      terms_snapshot,extras,discount,total_amount,deposit_required,source,notes,created_at,updated_at
    ) VALUES (
      @id,@agencyId,@publicNumber,@branchId,@vehicleId,@customerId,@driverId,@rentalMode,@renterSkipped,@fulfillmentType,@externalSupplierName,@externalSupplierPhone,@externalVehicleMake,@externalVehicleModel,@externalVehicleYear,@externalVehiclePlate,@externalVehicleColor,@supplierPricingMode,@supplierSharePercent,@supplierFixedCost,@supplierPayable,
      @guarantorName,@guarantorParentage,@guarantorCnic,@guarantorPhone,@guarantorAddress,@guarantorCarAmount,
      @destinationCity,@pickupAt,@returnAt,'confirmed',@dailyRate,@pricingMode,@estimatedKm,@mileageRate,@rateOverrideReason,
      @termsSnapshot,@extras,@discount,@totalAmount,@depositRequired,@source,@notes,@createdAt,@updatedAt
    )`,{
      id,agencyId:context.agencyId,publicNumber:bookingDraft.publicNumber,branchId:vehicle?.branch_id??externalBranch!.id,vehicleId:input.vehicleId??null,customerId,
      driverId:input.driverId??null,rentalMode:input.rentalMode,renterSkipped:input.renterSkipped?1:0,
      fulfillmentType:input.fulfillmentType,externalSupplierName:input.external?.supplierName??null,externalSupplierPhone:input.external?.supplierPhone??null,externalVehicleMake:input.external?.vehicleMake??null,externalVehicleModel:input.external?.vehicleModel??null,externalVehicleYear:input.external?.vehicleYear??null,externalVehiclePlate:input.external?.vehiclePlate??null,externalVehicleColor:input.external?.vehicleColor??null,supplierPricingMode:input.external?.pricingMode??null,supplierSharePercent:input.external?.supplierSharePercent??null,supplierFixedCost:input.external?.supplierFixedCost??null,supplierPayable,
      guarantorName:input.guarantor?.name??null,guarantorParentage:input.guarantor?.parentage??null,guarantorCnic:input.guarantor?.cnic??null,
      guarantorPhone:input.guarantor?.phone??null,guarantorAddress:input.guarantor?.address??null,guarantorCarAmount:input.guarantor?.carAmount??null,
      destinationCity:input.destinationCity,pickupAt:input.pickupAt,returnAt:input.returnAt,dailyRate,pricingMode,estimatedKm:input.estimatedKm,
      mileageRate,rateOverrideReason:input.overrideReason??null,termsSnapshot,extras:input.extras,discount:input.discount,totalAmount,
      depositRequired:input.depositRequired,source:input.source,notes:input.notes??null,createdAt:now,updatedAt:now,
    });
    if(input.startImmediately&&input.checkoutInspection){
      await execute(`INSERT INTO rental_inspections (id,agency_id,booking_id,kind,odometer,fuel_level,condition_notes,actor_id,occurred_at,created_at,updated_at) VALUES (?,?,?,'checkout',?,?,?,?,?,?,?)`,[randomUUID(),context.agencyId,id,input.checkoutInspection.odometer,input.checkoutInspection.fuelLevel,input.checkoutInspection.conditionNotes,context.userId,now,now,now]);
      await execute(`UPDATE bookings SET status='checked_out',checked_out_at=?,version=version+1,updated_at=? WHERE agency_id=? AND id=?`,[now,now,context.agencyId,id]);
      if(vehicle)await execute(`UPDATE vehicles SET status='booked',version=version+1,updated_at=? WHERE agency_id=? AND id=?`,[now,context.agencyId,vehicle.id]);
      await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,[randomUUID(),context.agencyId,context.userId,"booking.checked_out","booking",id,JSON.stringify({odometer:input.checkoutInspection.odometer,fuelLevel:input.checkoutInspection.fuelLevel,source:"immediate_booking"}),now]);
    }
    await execute("UPDATE booking_drafts SET status='consumed',consumed_at=?,updated_at=? WHERE agency_id=? AND id=? AND status='active'",[now, now, context.agencyId, bookingDraft.id]);
    await execute(`UPDATE private_files SET entity_type='customer',entity_id=?,updated_at=? WHERE agency_id=? AND entity_type='booking_draft' AND entity_id=? AND classification IN ('customer_cnic_front','customer_cnic_back') AND status='ready'`,[customerId,now,context.agencyId,bookingDraft.id]);
    if(input.guarantor){
      await execute(`UPDATE private_files SET entity_type='booking',entity_id=?,updated_at=? WHERE agency_id=? AND entity_type='booking_draft' AND entity_id=? AND classification IN ('guarantor_cnic_front','guarantor_cnic_back') AND status='ready'`,[id,now,context.agencyId,bookingDraft.id]);
    }else{
      await execute(`UPDATE private_files SET status='replaced',updated_at=? WHERE agency_id=? AND entity_type='booking_draft' AND entity_id=? AND classification IN ('guarantor_cnic_front','guarantor_cnic_back') AND status='ready'`,[now,context.agencyId,bookingDraft.id]);
    }
    await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,[randomUUID(), context.agencyId, context.userId, "booking.confirmed", "booking", id, JSON.stringify({ vehicleId: input.vehicleId, fulfillmentType:input.fulfillmentType, supplierPayable, destinationCity:input.destinationCity, pickupAt: input.pickupAt, returnAt: input.returnAt, dailyRate, mileageRate, totalAmount, pricingMode, guarantorRecorded:Boolean(input.guarantor) }), now]);
    return { id, publicNumber: bookingDraft.publicNumber, status: input.startImmediately ? "checked_out" as const : "confirmed" as const, dailyRate, mileageRate, totalAmount, currency: "PKR" as const };
  },{immediate:true});
}

export async function amendBooking(context:RequestContext, bookingId:string, rawInput:unknown) {
  requireRole(context,["agency_owner","fleet_manager","rental_agent"]);
  const input=rawInput as {vehicleId?:string;pickupAt?:string;returnAt?:string;destinationCity?:string;version?:number};
  const pickup=Date.parse(input.pickupAt??""),returned=Date.parse(input.returnAt??"");
  if(!input.vehicleId||!input.destinationCity?.trim()||!Number.isFinite(pickup)||!Number.isFinite(returned)||returned<=pickup) throw new DomainError("VALIDATION_FAILED","Review the amended vehicle, destination, and dates.",400);
  const destinationCity=input.destinationCity.trim();
  return inTransaction(async ()=>{
    const booking=await queryOne<{id:string;status:string;version:number;extras:number;discount:number}>("SELECT id,status,version,extras,discount FROM bookings WHERE agency_id=? AND id=?",[context.agencyId,bookingId]);
    if(!booking) throw new DomainError("NOT_FOUND","Booking not found.",404);
    if(booking.status!=="confirmed") throw new DomainError("INVALID_STATUS_TRANSITION","Only confirmed bookings can be amended.",409);
    if(input.version!==undefined&&input.version!==booking.version) throw new DomainError("VERSION_CONFLICT","The booking changed since it was loaded.",409);
    const vehicle=await queryOne<{id:string;branchId:string;dailyRate:number}>("SELECT id,branch_id AS branchId,daily_rate AS dailyRate FROM vehicles WHERE agency_id=? AND id=? AND archived_at IS NULL AND status NOT IN ('maintenance','out_of_service')",[context.agencyId,input.vehicleId]);
    if(!vehicle) throw new DomainError("NOT_FOUND","Vehicle not found or unavailable.",404);
    const conflict=await queryOne("SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=? AND id<>? AND status IN ('confirmed','checked_out') AND pickup_at<? AND return_at>? LIMIT 1",[context.agencyId,input.vehicleId,bookingId,new Date(returned).toISOString(),new Date(pickup).toISOString()]);
    if(conflict) throw new DomainError("BOOKING_CONFLICT","That vehicle is already booked for the amended period.",409);
    const rule=await queryOne<{dailyRate:number;perKmRate:number;minimumDays:number}>("SELECT daily_rate AS dailyRate,per_km_rate AS perKmRate,minimum_days AS minimumDays FROM vehicle_rate_rules WHERE agency_id=? AND vehicle_id=? AND active=1 AND lower(destination_city)=lower(?) LIMIT 1",[context.agencyId,input.vehicleId,destinationCity]);
    const days=Math.max(1,Math.ceil((returned-pickup)/86_400_000));
    if(rule&&days<rule.minimumDays) throw new DomainError("VALIDATION_FAILED",`This destination requires at least ${rule.minimumDays} days.`,400);
    const rate=rule?.dailyRate??vehicle.dailyRate;const mileage=rule?.perKmRate??0;const total=rate*days+booking.extras-booking.discount;
    const now=new Date().toISOString();
    await execute("UPDATE bookings SET branch_id=?,vehicle_id=?,destination_city=?,pickup_at=?,return_at=?,daily_rate=?,pricing_mode=?,mileage_rate=?,total_amount=?,version=version+1,updated_at=? WHERE agency_id=? AND id=?",[vehicle.branchId,input.vehicleId,destinationCity,new Date(pickup).toISOString(),new Date(returned).toISOString(),rate,rule?(mileage?"destination_plus_mileage":"destination_fixed"):"vehicle_default",mileage,total,now,context.agencyId,bookingId]);
    await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",[randomUUID(),context.agencyId,context.userId,"booking.amended","booking",bookingId,JSON.stringify({vehicleId:input.vehicleId,destinationCity:input.destinationCity,pickupAt:input.pickupAt,returnAt:input.returnAt}),now]);
    return getBooking(context,bookingId);
  },{immediate:true});
}

export async function extendRental(context:RequestContext, bookingId:string, rawInput:unknown) {
  requireRole(context,["agency_owner","fleet_manager","rental_agent"]);
  const input=rawInput as {returnAt?:unknown;version?:unknown};
  const returned=typeof input.returnAt==="string"?Date.parse(input.returnAt):Number.NaN;
  if(!Number.isFinite(returned))throw new DomainError("VALIDATION_FAILED","Enter a valid new return time.",400,{returnAt:"Choose a valid date and time."});
  return inTransaction(async ()=>{
    const booking=await queryOne<{id:string;vehicleId:string|null;fulfillmentType:"fleet"|"external";pickupAt:string;returnAt:string;status:string;dailyRate:number;estimatedKm:number;mileageRate:number;extras:number;discount:number;version:number;supplierPricingMode:"percentage"|"fixed"|null;supplierSharePercent:number|null;supplierFixedCost:number|null}>(`SELECT id,vehicle_id AS vehicleId,fulfillment_type AS fulfillmentType,pickup_at AS pickupAt,return_at AS returnAt,status,daily_rate AS dailyRate,estimated_km AS estimatedKm,mileage_rate AS mileageRate,extras,discount,version,
        supplier_pricing_mode AS supplierPricingMode,supplier_share_percent AS supplierSharePercent,supplier_fixed_cost AS supplierFixedCost
      FROM bookings WHERE agency_id=? AND id=? AND archived_at IS NULL LIMIT 1`,[context.agencyId,bookingId]);
    if(!booking)throw new DomainError("NOT_FOUND","Booking not found.",404);
    if(booking.status!=="checked_out")throw new DomainError("INVALID_STATUS_TRANSITION","Only an active checked-out rental can be extended.",409);
    if(typeof input.version==="number"&&input.version!==booking.version)throw new DomainError("VERSION_CONFLICT","The rental changed since it was loaded. Review it and try again.",409);
    const nextReturn=new Date(returned).toISOString();
    if(nextReturn<=booking.returnAt)throw new DomainError("VALIDATION_FAILED","The new return time must be later than the current return time.",400,{returnAt:"Choose a later return time."});
    if(booking.fulfillmentType==="fleet"&&booking.vehicleId){
      const conflict=await queryOne(`SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=? AND id<>? AND archived_at IS NULL AND status IN ('confirmed','checked_out') AND pickup_at<? AND return_at>? LIMIT 1`,[context.agencyId,booking.vehicleId,bookingId,nextReturn,booking.returnAt]);
      const block=await queryOne(`SELECT id FROM availability_blocks WHERE agency_id=? AND vehicle_id=? AND archived_at IS NULL AND start_at<? AND end_at>? LIMIT 1`,[context.agencyId,booking.vehicleId,nextReturn,booking.returnAt]);
      if(conflict||block)throw new DomainError("BOOKING_CONFLICT","The vehicle is already committed during the requested extension.",409);
    }
    const oldDays=Math.max(1,Math.ceil((Date.parse(booking.returnAt)-Date.parse(booking.pickupAt))/86_400_000));
    const newDays=Math.max(1,Math.ceil((returned-Date.parse(booking.pickupAt))/86_400_000));
    const addedDays=Math.max(0,newDays-oldDays);
    const extensionCharge=addedDays*booking.dailyRate;
    const totalAmount=booking.dailyRate*newDays+booking.mileageRate*booking.estimatedKm+booking.extras-booking.discount;
    const supplierPayable=booking.fulfillmentType==="external"
      ? booking.supplierPricingMode==="percentage"
        ? Math.round(totalAmount*(booking.supplierSharePercent??83)/100)
        : booking.supplierFixedCost??0
      : null;
    if(supplierPayable!==null&&supplierPayable>totalAmount)throw new DomainError("VALIDATION_FAILED","Supplier cost cannot exceed the customer total.",400,{returnAt:"Increase the rental total or correct the supplier agreement."});
    const now=new Date().toISOString();
    await execute(`UPDATE bookings SET return_at=?,total_amount=?,supplier_payable=?,version=version+1,updated_at=? WHERE agency_id=? AND id=?`,[nextReturn,totalAmount,supplierPayable,now,context.agencyId,bookingId]);
    await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,[randomUUID(),context.agencyId,context.userId,"booking.extended","booking",bookingId,JSON.stringify({previousReturnAt:booking.returnAt,returnAt:nextReturn,addedDays,extensionCharge,totalAmount,supplierPayable}),now]);
    return {...await getBooking(context,bookingId),extensionCharge};
  },{immediate:true});
}

export async function recordSourcePayout(context:RequestContext,bookingId:string,rawInput:unknown){
  requireRole(context,["agency_owner","accountant"]);
  const input=rawInput as Partial<{amount:number;method:string;reference:string;idempotencyKey:string}>;
  const method=input.method?.trim()??"",reference=input.reference?.trim()??"",idempotencyKey=input.idempotencyKey?.trim()??"";
  const errors:Record<string,string>={};
  if(!Number.isInteger(input.amount)||(input.amount??0)<=0)errors.amount="Enter a positive whole PKR amount.";
  if(!method)errors.method="Choose a payment method.";
  if(!reference)errors.reference="Enter a payment reference.";
  if(!idempotencyKey)errors.idempotencyKey="A retry key is required.";
  if(Object.keys(errors).length)throw new DomainError("VALIDATION_FAILED","Review the source payment.",400,errors);
  return inTransaction(async ()=>{
    const existing=await queryOne<{bookingId:string;amount:number;method:string;reference:string}>(`SELECT booking_id AS bookingId,amount,method,reference FROM source_payouts WHERE agency_id=? AND idempotency_key=? LIMIT 1`,[context.agencyId,idempotencyKey]);
    if(existing){
      if(existing.bookingId!==bookingId||existing.amount!==input.amount||existing.method!==method||existing.reference!==reference)throw new DomainError("VERSION_CONFLICT","This source-payment retry key was already used with different details.",409);
      return getBooking(context,bookingId);
    }
    const booking=await queryOne<{id:string;status:string;fulfillmentType:string;supplierName:string|null;supplierPayable:number|null;supplierPaid:number}>(`SELECT id,status,fulfillment_type AS fulfillmentType,external_supplier_name AS supplierName,supplier_payable AS supplierPayable,
      coalesce((SELECT sum(amount) FROM source_payouts WHERE agency_id=? AND booking_id=? AND status='posted'),0) AS supplierPaid
      FROM bookings WHERE agency_id=? AND id=? AND archived_at IS NULL LIMIT 1`,[context.agencyId,bookingId,context.agencyId,bookingId]);
    if(!booking)throw new DomainError("NOT_FOUND","Booking not found.",404);
    if(booking.fulfillmentType!=="external"||!booking.supplierName||booking.supplierPayable===null)throw new DomainError("INVALID_STATUS_TRANSITION","This booking has no external source payable.",409);
    if(!["checked_out","completed"].includes(booking.status))throw new DomainError("INVALID_STATUS_TRANSITION","Source payment can be posted after the rental starts.",409);
    const balance=Math.max(0,booking.supplierPayable-booking.supplierPaid);
    if(input.amount!>balance)throw new DomainError("VALIDATION_FAILED","Source payment exceeds the remaining payable.",400,{amount:`Available payable is PKR ${balance.toLocaleString("en-PK")}.`});
    const now=new Date().toISOString(),id=`SRC-${randomUUID().slice(0,8).toUpperCase()}`;
    await execute(`INSERT INTO source_payouts (id,agency_id,booking_id,supplier_name,amount,method,reference,idempotency_key,status,paid_at,actor_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'posted',?,?,?,?)`,[id,context.agencyId,bookingId,booking.supplierName,input.amount,method,reference,idempotencyKey,now,context.userId,now,now]);
    await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,[randomUUID(),context.agencyId,context.userId,"source.payout_posted","source_payout",id,JSON.stringify({bookingId,supplierName:booking.supplierName,amount:input.amount,reference}),now]);
    return getBooking(context,bookingId);
  },{immediate:true});
}

export async function cancelBooking(context:RequestContext, bookingId:string, rawInput:unknown) {
  requireRole(context,["agency_owner","fleet_manager","rental_agent"]);
  const input=rawInput as {reason?:unknown;version?:unknown};
  const reason=typeof input.reason==="string"?input.reason.trim():"";
  if(reason.length<5) throw new DomainError("VALIDATION_FAILED","Enter a clear cancellation reason.",400,{reason:"Use at least 5 characters."});
  return inTransaction(async ()=>{
    const booking=await queryOne<{id:string;status:string;version:number}>("SELECT id,status,version FROM bookings WHERE agency_id=? AND id=? AND archived_at IS NULL LIMIT 1",[context.agencyId,bookingId]);
    if(!booking) throw new DomainError("NOT_FOUND","Booking not found.",404);
    if(booking.status!=="confirmed") throw new DomainError("INVALID_STATUS_TRANSITION","Only confirmed bookings can be cancelled.",409);
    if(typeof input.version==="number"&&input.version!==booking.version) throw new DomainError("VERSION_CONFLICT","The booking changed since it was loaded.",409);
    const now=new Date().toISOString();
    await execute("UPDATE bookings SET status='cancelled',cancellation_reason=?,version=version+1,updated_at=? WHERE agency_id=? AND id=?",[reason,now,context.agencyId,bookingId]);
    await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",[randomUUID(),context.agencyId,context.userId,"booking.cancelled","booking",bookingId,JSON.stringify({reason}),now]);
    return getBooking(context,bookingId);
  },{immediate:true});
}

export async function archiveBooking(context:RequestContext, bookingId:string, rawReason?:unknown) {
  requireRole(context,["agency_owner","fleet_manager"]);
  const reason=typeof rawReason==="string"?rawReason.trim():"";
  return inTransaction(async ()=>{
    const booking=await queryOne<{id:string;status:string;paid:number;held:number}>(`SELECT bk.id,bk.status,
      coalesce((SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal') THEN -ft.amount ELSE ft.amount END) FROM financial_transactions ft WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted' AND lower(ft.kind) IN ('payment','late_return_charge','deposit_applied','reversal','refund')),0) AS paid,
      coalesce((SELECT sum(CASE WHEN lower(ft.kind) IN ('deposit_refunded','deposit_applied','deposit_forfeited') THEN -ft.amount ELSE ft.amount END) FROM financial_transactions ft WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted' AND lower(ft.kind) IN ('deposit_received','deposit_refunded','deposit_applied','deposit_forfeited')),0) AS held
      FROM bookings bk WHERE bk.agency_id=? AND bk.id=? AND bk.archived_at IS NULL LIMIT 1`,[context.agencyId,bookingId]);
    if(!booking) throw new DomainError("NOT_FOUND","Booking not found.",404);
    if(!["confirmed","cancelled","no_show"].includes(booking.status)) throw new DomainError("INVALID_STATUS_TRANSITION","Only confirmed, cancelled, or no-show bookings can be deleted.",409);
    if(booking.status==="confirmed"&&reason.length<5) throw new DomainError("VALIDATION_FAILED","Enter a clear cancellation reason before deleting this booking.",400,{reason:"Use at least 5 characters."});
    if(booking.paid!==0||booking.held!==0) throw new DomainError("INVALID_STATUS_TRANSITION","Settle or reverse all payments and deposits before removing this booking.",409);
    const now=new Date().toISOString();
    await execute("UPDATE bookings SET status=CASE WHEN status='confirmed' THEN 'cancelled' ELSE status END,cancellation_reason=CASE WHEN status='confirmed' THEN ? ELSE cancellation_reason END,archived_at=?,version=version+1,updated_at=? WHERE agency_id=? AND id=?",[reason||null,now,now,context.agencyId,bookingId]);
    await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",[randomUUID(),context.agencyId,context.userId,"booking.archived","booking",bookingId,JSON.stringify({previousStatus:booking.status,cancellationReason:reason||undefined}),now]);
    return {id:bookingId};
  },{immediate:true});
}

export async function recordBookingPayment(context: RequestContext, bookingId: string, rawInput: unknown) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const input = parseRecordPaymentInput(rawInput);
  return inTransaction(async () => {
    const booking = await queryOne<{ id: string; customerId: string; status: string; totalAmount: number; paid: number }>(`
      SELECT bk.id, bk.customer_id AS customerId, bk.status, bk.total_amount AS totalAmount,
        coalesce((
          SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal') THEN -ft.amount ELSE ft.amount END)
          FROM financial_transactions ft
          WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted'
            AND lower(ft.kind) IN ('payment','late_return_charge','deposit_applied','reversal','refund')
        ), 0) AS paid
      FROM bookings bk
      WHERE bk.agency_id=? AND bk.id=?
    `,[context.agencyId, bookingId]);

    if (!booking) throw new DomainError("NOT_FOUND", "Booking not found.", 404);
    if (["cancelled", "draft", "no_show"].includes(booking.status)) {
      throw new DomainError("INVALID_STATUS_TRANSITION", `Cannot post payment to a ${booking.status} booking.`, 409);
    }

    const idempotencyKey = input.idempotencyKey || `pay_${randomUUID()}`;
    const existing = await queryOne<{bookingId:string|null;amount:number;method:string;reference:string;receiptNumber:number|null}>("SELECT booking_id AS bookingId, amount, method, reference, receipt_number AS receiptNumber FROM financial_transactions WHERE agency_id=? AND idempotency_key=?",[context.agencyId, idempotencyKey]);
    if (existing) {
      if (existing.bookingId !== bookingId || existing.amount !== input.amount || existing.method !== input.method || existing.reference !== (input.reference ?? "")) {
        throw new DomainError("VERSION_CONFLICT", "This payment request key was already used with different details.", 409);
      }
      return { ...await getBooking(context, bookingId), paymentReceiptNumber: existing.receiptNumber };
    }

    const balance = booking.totalAmount - booking.paid;
    if (input.amount > balance) {
      throw new DomainError("VALIDATION_FAILED", "Overpayment is blocked; customer-credit policy is not enabled.", 400, {
        amount: `Amount exceeds the outstanding balance of PKR ${balance.toLocaleString()}.`,
      });
    }

    const id = `TXN-${randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    const receiptNumber = await allocatePaymentReceiptNumber(context.agencyId, now);

    await execute(`
      INSERT INTO financial_transactions (
        id, agency_id, receipt_number, booking_id, customer_id, kind, amount, method, reference, idempotency_key, status, actor_id, posted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'payment', ?, ?, ?, ?, 'posted', ?, ?, ?, ?)
    `,[
      id,
      context.agencyId,
      receiptNumber,
      bookingId,
      booking.customerId,
      input.amount,
      input.method,
      input.reference ?? "",
      idempotencyKey,
      context.userId,
      now,
      now,
      now
    ]);

    await execute(`
      INSERT INTO audit_events (
        id, agency_id, actor_id, action, entity_type, entity_id, metadata, occurred_at
      ) VALUES (?, ?, ?, 'booking.payment_posted', 'booking', ?, ?, ?)
    `,[
      randomUUID(),
      context.agencyId,
      context.userId,
      bookingId,
      JSON.stringify({ transactionId: id, receiptNumber, amount: input.amount, method: input.method, reference: input.reference, account: input.account, note: input.note }),
      now
    ]);

    return { ...await getBooking(context, bookingId), paymentReceiptNumber: receiptNumber };
  },{immediate:true});
}

export async function recordBookingDeposit(context: RequestContext, bookingId: string, rawInput: unknown) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const input = parseRecordDepositInput(rawInput);
  return inTransaction(async () => {
    const booking = await queryOne<{ id: string; customerId: string; status: string; totalAmount: number; paid: number; held: number }>(`
      SELECT bk.id, bk.customer_id AS customerId, bk.status, bk.total_amount AS totalAmount,
        coalesce((
          SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal') THEN -ft.amount ELSE ft.amount END)
          FROM financial_transactions ft
          WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted'
            AND lower(ft.kind) IN ('payment','late_return_charge','deposit_applied','reversal','refund')
        ), 0) AS paid,
        coalesce((
          SELECT sum(CASE WHEN lower(ft.kind) IN ('deposit_refunded','deposit_applied','deposit_forfeited') THEN -ft.amount ELSE ft.amount END)
          FROM financial_transactions ft
          WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted'
            AND lower(ft.kind) IN ('deposit_received','deposit_refunded','deposit_applied','deposit_forfeited')
        ), 0) AS held
      FROM bookings bk
      WHERE bk.agency_id=? AND bk.id=?
    `,[context.agencyId, bookingId]);

    if (!booking) throw new DomainError("NOT_FOUND", "Booking not found.", 404);

    const actionKindMap: Record<string, string> = {
      "Deposit received": "deposit_received",
      "Deposit applied": "deposit_applied",
      "Deposit refunded": "deposit_refunded",
      "Deposit forfeited": "deposit_forfeited",
    };
    const kind = actionKindMap[input.action];
    const isOut = ["deposit_applied", "deposit_refunded", "deposit_forfeited"].includes(kind);

    if (isOut && input.amount > booking.held) {
      throw new DomainError("VALIDATION_FAILED", "Deposit deduction cannot exceed the currently held deposit.", 400, {
        amount: `Amount exceeds the held deposit of PKR ${booking.held.toLocaleString()}.`,
      });
    }

    if (kind === "deposit_applied") {
      const balance = booking.totalAmount - booking.paid;
      if (input.amount > balance) {
        throw new DomainError("VALIDATION_FAILED", "Applied deposit cannot exceed the outstanding balance.", 400, {
          amount: `Amount exceeds outstanding balance of PKR ${balance.toLocaleString()}.`,
        });
      }
    }

    const idempotencyKey = input.idempotencyKey || `dep_${randomUUID()}`;
    const existing = await queryOne("SELECT id FROM financial_transactions WHERE agency_id=? AND idempotency_key=?",[context.agencyId, idempotencyKey]);
    if (existing) return getBooking(context, bookingId);

    const id = `TXN-${randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();

    await execute(`
      INSERT INTO financial_transactions (
        id, agency_id, booking_id, customer_id, kind, amount, method, reference, idempotency_key, status, actor_id, posted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?)
    `,[
      id,
      context.agencyId,
      bookingId,
      booking.customerId,
      kind,
      input.amount,
      input.method ?? "Bank transfer",
      input.reference,
      idempotencyKey,
      context.userId,
      now,
      now,
      now
    ]);

    await execute(`
      INSERT INTO audit_events (
        id, agency_id, actor_id, action, entity_type, entity_id, metadata, occurred_at
      ) VALUES (?, ?, ?, 'booking.deposit_posted', 'booking', ?, ?, ?)
    `,[
      randomUUID(),
      context.agencyId,
      context.userId,
      bookingId,
      JSON.stringify({ transactionId: id, action: input.action, kind, amount: input.amount, reference: input.reference }),
      now
    ]);

    return getBooking(context, bookingId);
  },{immediate:true});
}

export async function reverseBookingTransaction(context: RequestContext, bookingId: string, rawInput: unknown) {
  requireRole(context, ["agency_owner", "accountant"]);
  const input = parseReverseTransactionInput(rawInput);
  return inTransaction(async () => {
    const booking = await queryOne<{ id: string; customer_id: string }>("SELECT id, customer_id FROM bookings WHERE agency_id=? AND id=?",[context.agencyId, bookingId]);
    if (!booking) throw new DomainError("NOT_FOUND", "Booking not found.", 404);

    const original = await queryOne<{ id: string; kind: string; amount: number; method: string; reference: string; status: string }>(`
      SELECT id, kind, amount, method, reference, status
      FROM financial_transactions
      WHERE agency_id=? AND booking_id=? AND id=?
    `,[context.agencyId, bookingId, input.transactionId]);

    if (!original) throw new DomainError("NOT_FOUND", "Transaction not found.", 404);
    if (original.status !== "posted") {
      throw new DomainError("INVALID_STATUS_TRANSITION", "Only posted transactions can be reversed.", 409);
    }
    if (["reversal", "refund"].includes(original.kind.toLowerCase())) {
      throw new DomainError("INVALID_STATUS_TRANSITION", "Cannot reverse an existing reversal or refund transaction.", 409);
    }
    if (input.adjustmentType === "refund" && !["payment", "late_return_charge", "deposit_applied"].includes(original.kind.toLowerCase())) {
      throw new DomainError("INVALID_STATUS_TRANSITION", "Only a payment, late-return charge, or applied deposit can be refunded. Use Manage deposit for a held deposit.", 409);
    }

    const alreadyReversed = await queryOne(`
      SELECT id FROM financial_transactions WHERE agency_id=? AND linked_transaction_id=? AND status='posted'
    `,[context.agencyId, original.id]);
    if (alreadyReversed) {
      throw new DomainError("INVALID_STATUS_TRANSITION", "This transaction has already been reversed.", 409);
    }

    const id = `TXN-${randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    const adjustmentType = input.adjustmentType ?? "reversal";
    const idempotencyKey = `${adjustmentType === "refund" ? "ref" : "rev"}_${original.id}_${randomUUID().slice(0, 6)}`;

    // Insert an immutable compensating transaction rather than editing the original.
    await execute(`
      INSERT INTO financial_transactions (
        id, agency_id, booking_id, customer_id, kind, amount, method, reference, idempotency_key, linked_transaction_id, status, actor_id, posted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?)
    `,[
      id,
      context.agencyId,
      bookingId,
      booking.customer_id,
      adjustmentType,
      original.amount,
      original.method,
      input.reason,
      idempotencyKey,
      original.id,
      context.userId,
      now,
      now,
      now
    ]);

    if (original.kind.toLowerCase() === "late_return_charge") {
      await execute(`UPDATE bookings SET extras=max(0,extras-?),total_amount=max(0,total_amount-?),version=version+1,updated_at=? WHERE agency_id=? AND id=?`,[original.amount, original.amount, now, context.agencyId, bookingId]);
    }

    await execute(`
      INSERT INTO audit_events (
        id, agency_id, actor_id, action, entity_type, entity_id, metadata, occurred_at
      ) VALUES (?, ?, ?, ?, 'booking', ?, ?, ?)
    `,[
      randomUUID(),
      context.agencyId,
      context.userId,
      adjustmentType === "refund" ? "booking.payment_refunded" : "booking.payment_reversed",
      bookingId,
      JSON.stringify({
        originalTransactionId: original.id,
        originalKind: original.kind,
        originalAmount: original.amount,
        originalMethod: original.method,
        originalReference: original.reference,
        adjustmentTransactionId: id,
        adjustmentType,
        reason: input.reason,
      }),
      now
    ]);

    return getBooking(context, bookingId);
  },{immediate:true});
}
