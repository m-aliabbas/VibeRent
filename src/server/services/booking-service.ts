import "server-only";
import { randomUUID } from "node:crypto";
import { sqlite } from "@/db/connection";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import type { BookingInspectionDto, BookingListItem, BookingTransactionDto } from "@/server/repositories/contracts";
import {
  parseConfirmBookingInput,
  parseRecordDepositInput,
  parseRecordPaymentInput,
  parseReverseTransactionInput,
} from "@/server/validation/booking";
import { parseCheckInRentalInput, parseRentalInspectionInput, type CheckInRentalInput } from "@/server/validation/rental-operation";

type BookingRow = {
  id: string; customer_id: string; customer: string; vehicle_id: string; make: string; model: string; year: number; plate: string; city: string;
  destination_city: string; pickup_at: string; return_at: string; daily_rate: number; pricing_mode:string; estimated_km:number; mileage_rate:number; rate_override_reason:string|null; terms_snapshot:string; extras: number; discount: number; total_amount: number; deposit_required: number; paid: number; deposit_held: number; status: string; source: string; notes: string | null; version:number;
};

const displayStatus: Record<string, BookingListItem["status"]> = { draft: "Draft", confirmed: "Confirmed", checked_out: "Checked Out", completed: "Completed", cancelled: "Cancelled", no_show: "No Show" };

export type AvailabilityBlockDto = { id: string; vehicleId: string; from: string; to: string; reason: string; kind: string };

export function listBookings(context: RequestContext): BookingListItem[] {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const rows = sqlite.prepare(`
    SELECT bk.*, c.name AS customer, v.make, v.model, v.year, v.plate, br.city,
      coalesce((
        SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal') THEN -ft.amount ELSE ft.amount END)
        FROM financial_transactions ft
        WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted'
          AND lower(ft.kind) IN ('payment','deposit_applied','reversal','refund')
      ), 0) AS paid,
      coalesce((
        SELECT sum(CASE WHEN lower(ft.kind) IN ('deposit_refunded','deposit_applied','deposit_forfeited') THEN -ft.amount ELSE ft.amount END)
        FROM financial_transactions ft
        WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted'
          AND lower(ft.kind) IN ('deposit_received','deposit_refunded','deposit_applied','deposit_forfeited')
      ), 0) AS deposit_held
    FROM bookings bk
    JOIN customers c ON c.id=bk.customer_id AND c.agency_id=bk.agency_id
    JOIN vehicles v ON v.id=bk.vehicle_id AND v.agency_id=bk.agency_id
    JOIN branches br ON br.id=bk.branch_id AND br.agency_id=bk.agency_id
    WHERE bk.agency_id=?
    ORDER BY bk.pickup_at DESC
  `).all(context.agencyId) as BookingRow[];

  return rows.map((row) => {
    const days = Math.max(1, Math.ceil((Date.parse(row.return_at) - Date.parse(row.pickup_at)) / 86_400_000));
    return {
      id: row.id,
      customerId: row.customer_id,
      customer: row.customer,
      vehicleId: row.vehicle_id,
      vehicle: `${row.make} ${row.model} ${row.year}`,
      plate: row.plate,
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

export function getBooking(context: RequestContext, id: string) {
  const booking = listBookings(context).find((item) => item.id === id);
  if (!booking) throw new DomainError("NOT_FOUND", "Booking not found.", 404);
  const inspections = sqlite.prepare(`SELECT kind, odometer, fuel_level AS fuelLevel, condition_notes AS conditionNotes, occurred_at AS occurredAt FROM rental_inspections WHERE agency_id=? AND booking_id=? ORDER BY occurred_at`).all(context.agencyId, id) as BookingInspectionDto[];
  const transactions = sqlite.prepare(`
    SELECT ft.id, ft.booking_id AS bookingId, ft.customer_id AS customerId, ft.kind, ft.amount, ft.method, ft.reference, ft.linked_transaction_id AS linkedTransactionId,
      CASE WHEN EXISTS(SELECT 1 FROM financial_transactions rev WHERE rev.agency_id=ft.agency_id AND rev.linked_transaction_id=ft.id) THEN 'reversed' ELSE ft.status END AS status,
      ft.posted_at AS postedAt, ft.created_at AS createdAt
    FROM financial_transactions ft
    WHERE ft.agency_id=? AND ft.booking_id=?
    ORDER BY ft.posted_at DESC, ft.created_at DESC
  `).all(context.agencyId, id) as BookingTransactionDto[];
  return { ...booking, inspections, transactions };
}

export function listAvailabilityBlocks(context: RequestContext): AvailabilityBlockDto[] {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  return sqlite.prepare(`SELECT id,vehicle_id AS vehicleId,start_at AS "from",end_at AS "to",reason,kind FROM availability_blocks WHERE agency_id=? AND archived_at IS NULL ORDER BY start_at`)
    .all(context.agencyId) as AvailabilityBlockDto[];
}

export function createAvailabilityBlock(context: RequestContext, rawInput: unknown): AvailabilityBlockDto {
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
  return sqlite.transaction(() => {
    const vehicle = sqlite.prepare("SELECT id FROM vehicles WHERE agency_id=? AND id=? AND archived_at IS NULL LIMIT 1").get(context.agencyId, input.vehicleId);
    if (!vehicle) throw new DomainError("NOT_FOUND", "Vehicle not found.", 404);
    const booking = sqlite.prepare(`SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=? AND status IN ('confirmed','checked_out') AND pickup_at<? AND return_at>? LIMIT 1`).get(context.agencyId, input.vehicleId, to, from);
    const block = sqlite.prepare(`SELECT id FROM availability_blocks WHERE agency_id=? AND vehicle_id=? AND archived_at IS NULL AND start_at<? AND end_at>? LIMIT 1`).get(context.agencyId, input.vehicleId, to, from);
    if (booking || block) throw new DomainError("BOOKING_CONFLICT", "This vehicle already has a booking or block in that period.", 409);
    const id = `blk_${randomUUID()}`; const now = new Date().toISOString(); const kind = input.kind?.trim() || "operational";
    sqlite.prepare(`INSERT INTO availability_blocks (id,agency_id,vehicle_id,start_at,end_at,kind,reason,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)`).run(id, context.agencyId, input.vehicleId, from, to, kind, input.reason!.trim(), now, now);
    sqlite.prepare(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(), context.agencyId, context.userId, "availability.blocked", "availability_block", id, JSON.stringify({ vehicleId: input.vehicleId, from, to }), now);
    return { id, vehicleId: input.vehicleId!, from, to, reason: input.reason!.trim(), kind };
  }).immediate();
}

export function checkOutRental(context: RequestContext, bookingId: string, rawInput: unknown) {
  return transitionRental(context, bookingId, "checkout", rawInput);
}

export function checkInRental(context: RequestContext, bookingId: string, rawInput: unknown) {
  return transitionRental(context, bookingId, "checkin", rawInput);
}

function transitionRental(context: RequestContext, bookingId: string, kind: "checkout" | "checkin", rawInput: unknown) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  const input = kind === "checkin" ? parseCheckInRentalInput(rawInput) : parseRentalInspectionInput(rawInput);
  return sqlite.transaction(() => {
    const booking = sqlite.prepare(`SELECT bk.id, bk.vehicle_id AS vehicleId, bk.customer_id AS customerId, bk.status, bk.version, bk.total_amount AS totalAmount,
      coalesce((SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal') THEN -ft.amount ELSE ft.amount END) FROM financial_transactions ft WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted' AND lower(ft.kind) IN ('payment','deposit_applied','reversal','refund')),0) AS paid
      FROM bookings bk WHERE bk.agency_id=? AND bk.id=? LIMIT 1`).get(context.agencyId, bookingId) as { id: string; vehicleId: string; customerId: string; status: string; version: number; totalAmount: number; paid: number } | undefined;
    if (!booking) throw new DomainError("NOT_FOUND", "Booking not found.", 404);
    const expectedStatus = kind === "checkout" ? "confirmed" : "checked_out";
    if (booking.status !== expectedStatus) throw new DomainError("INVALID_STATUS_TRANSITION", `A ${booking.status} booking cannot be ${kind === "checkout" ? "checked out" : "checked in"}.`, 409);
    if (input.version !== undefined && input.version !== booking.version) throw new DomainError("VERSION_CONFLICT", "The booking changed since it was loaded.", 409);
    if (kind === "checkin") {
      const checkout = sqlite.prepare(`SELECT odometer FROM rental_inspections WHERE agency_id=? AND booking_id=? AND kind='checkout' LIMIT 1`).get(context.agencyId, bookingId) as { odometer: number } | undefined;
      if (!checkout) throw new DomainError("INVALID_STATUS_TRANSITION", "A check-out inspection is required before check-in.", 409);
      if (input.odometer < checkout.odometer) throw new DomainError("VALIDATION_FAILED", "Check-in odometer cannot be lower than check-out.", 400, { odometer: "Enter a reading at or above the check-out reading." });
    }
    const now = new Date().toISOString();
    sqlite.prepare(`INSERT INTO rental_inspections (id,agency_id,booking_id,kind,odometer,fuel_level,condition_notes,actor_id,occurred_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(), context.agencyId, bookingId, kind, input.odometer, input.fuelLevel, input.conditionNotes, context.userId, now, now, now);
    if (kind === "checkout") {
      sqlite.prepare(`UPDATE bookings SET status='checked_out', checked_out_at=?, version=version+1, updated_at=? WHERE agency_id=? AND id=?`).run(now, now, context.agencyId, bookingId);
      sqlite.prepare(`UPDATE vehicles SET status='booked', version=version+1, updated_at=? WHERE agency_id=? AND id=?`).run(now, context.agencyId, booking.vehicleId);
    } else {
      sqlite.prepare(`UPDATE bookings SET status='completed', completed_at=?, version=version+1, updated_at=? WHERE agency_id=? AND id=?`).run(now, now, context.agencyId, bookingId);
      sqlite.prepare(`UPDATE vehicles SET status='available', version=version+1, updated_at=? WHERE agency_id=? AND id=?`).run(now, context.agencyId, booking.vehicleId);
      const payment = (input as CheckInRentalInput).payment;
      if (payment) {
        const balance = booking.totalAmount - booking.paid;
        if (payment.amount > balance) throw new DomainError("VALIDATION_FAILED", "Check-in payment cannot exceed the outstanding balance.", 400, { amount: `Amount exceeds the outstanding balance of PKR ${balance.toLocaleString()}.` });
        const idempotencyKey = payment.idempotencyKey || `checkin_pay_${bookingId}_${booking.version}`;
        const existing = sqlite.prepare("SELECT id FROM financial_transactions WHERE agency_id=? AND idempotency_key=?").get(context.agencyId, idempotencyKey);
        if (!existing) {
          const transactionId = `TXN-${randomUUID().slice(0, 8).toUpperCase()}`;
          sqlite.prepare(`INSERT INTO financial_transactions (id,agency_id,booking_id,customer_id,kind,amount,method,reference,idempotency_key,status,actor_id,posted_at,created_at,updated_at) VALUES (?,?,?,?, 'payment',?,?,?,?, 'posted',?,?,?,?)`)
            .run(transactionId, context.agencyId, bookingId, booking.customerId, payment.amount, payment.method, payment.reference, idempotencyKey, context.userId, now, now, now);
          sqlite.prepare(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`)
            .run(randomUUID(), context.agencyId, context.userId, "booking.payment_posted", "booking", bookingId, JSON.stringify({ transactionId, amount: payment.amount, method: payment.method, reference: payment.reference, source: "checkin" }), now);
        }
      }
    }
    sqlite.prepare(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(), context.agencyId, context.userId, `booking.${kind === "checkout" ? "checked_out" : "checked_in"}`, "booking", bookingId, JSON.stringify({ odometer: input.odometer, fuelLevel: input.fuelLevel }), now);
    return getBooking(context, bookingId);
  }).immediate();
}

export function confirmBooking(context: RequestContext, rawInput: unknown) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  const input = parseConfirmBookingInput(rawInput);
  return sqlite.transaction(() => {
    const vehicle = sqlite.prepare(`SELECT v.id, v.branch_id, v.daily_rate, v.status FROM vehicles v WHERE v.agency_id=? AND v.id=? AND v.archived_at IS NULL LIMIT 1`).get(context.agencyId, input.vehicleId) as { id: string; branch_id: string; daily_rate: number; status: string } | undefined;
    if (!vehicle) throw new DomainError("NOT_FOUND", "Vehicle not found.", 404);
    if (["maintenance", "out_of_service"].includes(vehicle.status)) throw new DomainError("BOOKING_CONFLICT", "The vehicle is not available for booking.", 409);
    const customer = sqlite.prepare("SELECT id, status FROM customers WHERE agency_id=? AND id=? LIMIT 1").get(context.agencyId, input.customerId) as { id: string; status: string } | undefined;
    if (!customer) throw new DomainError("NOT_FOUND", "Customer not found.", 404);
    if (customer.status === "blacklisted") throw new DomainError("FORBIDDEN", "This customer cannot be booked.", 403);
    const bookingConflict = sqlite.prepare(`SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=? AND status IN ('confirmed','checked_out') AND pickup_at < ? AND return_at > ? LIMIT 1`).get(context.agencyId, input.vehicleId, input.returnAt, input.pickupAt) as { id: string } | undefined;
    if (bookingConflict) throw new DomainError("BOOKING_CONFLICT", "The vehicle is no longer available for the selected period.", 409);
    const blockConflict = sqlite.prepare(`SELECT id FROM availability_blocks WHERE agency_id=? AND vehicle_id=? AND start_at < ? AND end_at > ? LIMIT 1`).get(context.agencyId, input.vehicleId, input.returnAt, input.pickupAt) as { id: string } | undefined;
    if (blockConflict) throw new DomainError("BOOKING_CONFLICT", "An availability block overlaps the selected period.", 409);
    const days = Math.max(1, Math.ceil((Date.parse(input.returnAt) - Date.parse(input.pickupAt)) / 86_400_000));
    const rule = sqlite.prepare(`SELECT daily_rate AS dailyRate,per_km_rate AS perKmRate,minimum_days AS minimumDays FROM vehicle_rate_rules WHERE agency_id=? AND vehicle_id=? AND active=1 AND lower(destination_city)=lower(?) LIMIT 1`).get(context.agencyId,input.vehicleId,input.destinationCity) as {dailyRate:number;perKmRate:number;minimumDays:number}|undefined;
    if (rule && days < rule.minimumDays) throw new DomainError("VALIDATION_FAILED", `This destination requires at least ${rule.minimumDays} rental days.`, 400, { returnAt: `Choose at least ${rule.minimumDays} days.` });
    const dailyRate = input.dailyRateOverride ?? rule?.dailyRate ?? vehicle.daily_rate;
    const mileageRate = rule?.perKmRate ?? 0;
    const pricingMode = input.dailyRateOverride !== undefined ? "manual_override" : rule ? (mileageRate > 0 ? "destination_plus_mileage" : "destination_fixed") : "vehicle_default";
    const subtotal = dailyRate * days + mileageRate * input.estimatedKm;
    if (input.discount > subtotal + input.extras) throw new DomainError("VALIDATION_FAILED", "Discount cannot exceed the booking subtotal.", 400, { discount: "Reduce the discount." });
    const totalAmount = subtotal + input.extras - input.discount;
    const id = `BKG-${randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    const agency = sqlite.prepare("SELECT rental_terms AS rentalTerms FROM agencies WHERE id=?").get(context.agencyId) as {rentalTerms:string};
    sqlite.prepare(`INSERT INTO bookings (id,agency_id,branch_id,vehicle_id,customer_id,destination_city,pickup_at,return_at,status,daily_rate,pricing_mode,estimated_km,mileage_rate,rate_override_reason,terms_snapshot,extras,discount,total_amount,deposit_required,source,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?, 'confirmed',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, context.agencyId, vehicle.branch_id, input.vehicleId, input.customerId, input.destinationCity, input.pickupAt, input.returnAt, dailyRate, pricingMode, input.estimatedKm, mileageRate, input.overrideReason ?? null, agency.rentalTerms, input.extras, input.discount, totalAmount, input.depositRequired, input.source, input.notes ?? null, now, now);
    sqlite.prepare(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(), context.agencyId, context.userId, "booking.confirmed", "booking", id, JSON.stringify({ vehicleId: input.vehicleId, destinationCity:input.destinationCity, pickupAt: input.pickupAt, returnAt: input.returnAt, dailyRate, mileageRate, totalAmount, pricingMode }), now);
    return { id, status: "confirmed" as const, dailyRate, mileageRate, totalAmount, currency: "PKR" as const };
  }).immediate();
}

export function amendBooking(context:RequestContext, bookingId:string, rawInput:unknown) {
  requireRole(context,["agency_owner","fleet_manager","rental_agent"]);
  const input=rawInput as {vehicleId?:string;pickupAt?:string;returnAt?:string;destinationCity?:string;version?:number};
  const pickup=Date.parse(input.pickupAt??""),returned=Date.parse(input.returnAt??"");
  if(!input.vehicleId||!input.destinationCity?.trim()||!Number.isFinite(pickup)||!Number.isFinite(returned)||returned<=pickup) throw new DomainError("VALIDATION_FAILED","Review the amended vehicle, destination, and dates.",400);
  const destinationCity=input.destinationCity.trim();
  return sqlite.transaction(()=>{
    const booking=sqlite.prepare("SELECT id,status,version,extras,discount FROM bookings WHERE agency_id=? AND id=?").get(context.agencyId,bookingId) as {id:string;status:string;version:number;extras:number;discount:number}|undefined;
    if(!booking) throw new DomainError("NOT_FOUND","Booking not found.",404);
    if(booking.status!=="confirmed") throw new DomainError("INVALID_STATUS_TRANSITION","Only confirmed bookings can be amended.",409);
    if(input.version!==undefined&&input.version!==booking.version) throw new DomainError("VERSION_CONFLICT","The booking changed since it was loaded.",409);
    const vehicle=sqlite.prepare("SELECT id,branch_id AS branchId,daily_rate AS dailyRate FROM vehicles WHERE agency_id=? AND id=? AND archived_at IS NULL AND status NOT IN ('maintenance','out_of_service')").get(context.agencyId,input.vehicleId) as {id:string;branchId:string;dailyRate:number}|undefined;
    if(!vehicle) throw new DomainError("NOT_FOUND","Vehicle not found or unavailable.",404);
    const conflict=sqlite.prepare("SELECT id FROM bookings WHERE agency_id=? AND vehicle_id=? AND id<>? AND status IN ('confirmed','checked_out') AND pickup_at<? AND return_at>? LIMIT 1").get(context.agencyId,input.vehicleId,bookingId,new Date(returned).toISOString(),new Date(pickup).toISOString());
    if(conflict) throw new DomainError("BOOKING_CONFLICT","That vehicle is already booked for the amended period.",409);
    const rule=sqlite.prepare("SELECT daily_rate AS dailyRate,per_km_rate AS perKmRate,minimum_days AS minimumDays FROM vehicle_rate_rules WHERE agency_id=? AND vehicle_id=? AND active=1 AND lower(destination_city)=lower(?) LIMIT 1").get(context.agencyId,input.vehicleId,destinationCity) as {dailyRate:number;perKmRate:number;minimumDays:number}|undefined;
    const days=Math.max(1,Math.ceil((returned-pickup)/86_400_000));
    if(rule&&days<rule.minimumDays) throw new DomainError("VALIDATION_FAILED",`This destination requires at least ${rule.minimumDays} days.`,400);
    const rate=rule?.dailyRate??vehicle.dailyRate;const mileage=rule?.perKmRate??0;const total=rate*days+booking.extras-booking.discount;
    const now=new Date().toISOString();
    sqlite.prepare("UPDATE bookings SET branch_id=?,vehicle_id=?,destination_city=?,pickup_at=?,return_at=?,daily_rate=?,pricing_mode=?,mileage_rate=?,total_amount=?,version=version+1,updated_at=? WHERE agency_id=? AND id=?").run(vehicle.branchId,input.vehicleId,destinationCity,new Date(pickup).toISOString(),new Date(returned).toISOString(),rate,rule?(mileage?"destination_plus_mileage":"destination_fixed"):"vehicle_default",mileage,total,now,context.agencyId,bookingId);
    sqlite.prepare("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)").run(randomUUID(),context.agencyId,context.userId,"booking.amended","booking",bookingId,JSON.stringify({vehicleId:input.vehicleId,destinationCity:input.destinationCity,pickupAt:input.pickupAt,returnAt:input.returnAt}),now);
    return getBooking(context,bookingId);
  }).immediate();
}

export function recordBookingPayment(context: RequestContext, bookingId: string, rawInput: unknown) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const input = parseRecordPaymentInput(rawInput);
  return sqlite.transaction(() => {
    const booking = sqlite.prepare(`
      SELECT bk.id, bk.customer_id AS customerId, bk.status, bk.total_amount AS totalAmount,
        coalesce((
          SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal') THEN -ft.amount ELSE ft.amount END)
          FROM financial_transactions ft
          WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted'
            AND lower(ft.kind) IN ('payment','deposit_applied','reversal','refund')
        ), 0) AS paid
      FROM bookings bk
      WHERE bk.agency_id=? AND bk.id=?
    `).get(context.agencyId, bookingId) as { id: string; customerId: string; status: string; totalAmount: number; paid: number } | undefined;

    if (!booking) throw new DomainError("NOT_FOUND", "Booking not found.", 404);
    if (["cancelled", "draft", "no_show"].includes(booking.status)) {
      throw new DomainError("INVALID_STATUS_TRANSITION", `Cannot post payment to a ${booking.status} booking.`, 409);
    }

    const balance = booking.totalAmount - booking.paid;
    if (input.amount > balance) {
      throw new DomainError("VALIDATION_FAILED", "Overpayment is blocked; customer-credit policy is not enabled.", 400, {
        amount: `Amount exceeds the outstanding balance of PKR ${balance.toLocaleString()}.`,
      });
    }

    const idempotencyKey = input.idempotencyKey || `pay_${randomUUID()}`;
    const existing = sqlite.prepare("SELECT id FROM financial_transactions WHERE agency_id=? AND idempotency_key=?").get(context.agencyId, idempotencyKey);
    if (existing) return getBooking(context, bookingId);

    const id = `TXN-${randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();

    sqlite.prepare(`
      INSERT INTO financial_transactions (
        id, agency_id, booking_id, customer_id, kind, amount, method, reference, idempotency_key, status, actor_id, posted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'payment', ?, ?, ?, ?, 'posted', ?, ?, ?, ?)
    `).run(
      id,
      context.agencyId,
      bookingId,
      booking.customerId,
      input.amount,
      input.method,
      input.reference,
      idempotencyKey,
      context.userId,
      now,
      now,
      now
    );

    sqlite.prepare(`
      INSERT INTO audit_events (
        id, agency_id, actor_id, action, entity_type, entity_id, metadata, occurred_at
      ) VALUES (?, ?, ?, 'booking.payment_posted', 'booking', ?, ?, ?)
    `).run(
      randomUUID(),
      context.agencyId,
      context.userId,
      bookingId,
      JSON.stringify({ transactionId: id, amount: input.amount, method: input.method, reference: input.reference, account: input.account, note: input.note }),
      now
    );

    return getBooking(context, bookingId);
  }).immediate();
}

export function recordBookingDeposit(context: RequestContext, bookingId: string, rawInput: unknown) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const input = parseRecordDepositInput(rawInput);
  return sqlite.transaction(() => {
    const booking = sqlite.prepare(`
      SELECT bk.id, bk.customer_id AS customerId, bk.status, bk.total_amount AS totalAmount,
        coalesce((
          SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal') THEN -ft.amount ELSE ft.amount END)
          FROM financial_transactions ft
          WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted'
            AND lower(ft.kind) IN ('payment','deposit_applied','reversal','refund')
        ), 0) AS paid,
        coalesce((
          SELECT sum(CASE WHEN lower(ft.kind) IN ('deposit_refunded','deposit_applied','deposit_forfeited') THEN -ft.amount ELSE ft.amount END)
          FROM financial_transactions ft
          WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted'
            AND lower(ft.kind) IN ('deposit_received','deposit_refunded','deposit_applied','deposit_forfeited')
        ), 0) AS held
      FROM bookings bk
      WHERE bk.agency_id=? AND bk.id=?
    `).get(context.agencyId, bookingId) as { id: string; customerId: string; status: string; totalAmount: number; paid: number; held: number } | undefined;

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
    const existing = sqlite.prepare("SELECT id FROM financial_transactions WHERE agency_id=? AND idempotency_key=?").get(context.agencyId, idempotencyKey);
    if (existing) return getBooking(context, bookingId);

    const id = `TXN-${randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();

    sqlite.prepare(`
      INSERT INTO financial_transactions (
        id, agency_id, booking_id, customer_id, kind, amount, method, reference, idempotency_key, status, actor_id, posted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?)
    `).run(
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
    );

    sqlite.prepare(`
      INSERT INTO audit_events (
        id, agency_id, actor_id, action, entity_type, entity_id, metadata, occurred_at
      ) VALUES (?, ?, ?, 'booking.deposit_posted', 'booking', ?, ?, ?)
    `).run(
      randomUUID(),
      context.agencyId,
      context.userId,
      bookingId,
      JSON.stringify({ transactionId: id, action: input.action, kind, amount: input.amount, reference: input.reference }),
      now
    );

    return getBooking(context, bookingId);
  }).immediate();
}

export function reverseBookingTransaction(context: RequestContext, bookingId: string, rawInput: unknown) {
  requireRole(context, ["agency_owner", "accountant"]);
  const input = parseReverseTransactionInput(rawInput);
  return sqlite.transaction(() => {
    const booking = sqlite.prepare("SELECT id, customer_id FROM bookings WHERE agency_id=? AND id=?").get(context.agencyId, bookingId) as { id: string; customer_id: string } | undefined;
    if (!booking) throw new DomainError("NOT_FOUND", "Booking not found.", 404);

    const original = sqlite.prepare(`
      SELECT id, kind, amount, method, reference, status
      FROM financial_transactions
      WHERE agency_id=? AND booking_id=? AND id=?
    `).get(context.agencyId, bookingId, input.transactionId) as { id: string; kind: string; amount: number; method: string; reference: string; status: string } | undefined;

    if (!original) throw new DomainError("NOT_FOUND", "Transaction not found.", 404);
    if (original.status !== "posted") {
      throw new DomainError("INVALID_STATUS_TRANSITION", "Only posted transactions can be reversed.", 409);
    }
    if (["reversal", "refund"].includes(original.kind.toLowerCase())) {
      throw new DomainError("INVALID_STATUS_TRANSITION", "Cannot reverse an existing reversal or refund transaction.", 409);
    }

    const alreadyReversed = sqlite.prepare(`
      SELECT id FROM financial_transactions WHERE agency_id=? AND linked_transaction_id=? AND status='posted'
    `).get(context.agencyId, original.id);
    if (alreadyReversed) {
      throw new DomainError("INVALID_STATUS_TRANSITION", "This transaction has already been reversed.", 409);
    }

    const id = `TXN-${randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    const idempotencyKey = `rev_${original.id}_${randomUUID().slice(0, 6)}`;

    // Insert compensating reversal transaction
    sqlite.prepare(`
      INSERT INTO financial_transactions (
        id, agency_id, booking_id, customer_id, kind, amount, method, reference, idempotency_key, linked_transaction_id, status, actor_id, posted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'reversal', ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?)
    `).run(
      id,
      context.agencyId,
      bookingId,
      booking.customer_id,
      original.amount,
      original.method,
      `REVERSAL-${original.id}`,
      idempotencyKey,
      original.id,
      context.userId,
      now,
      now,
      now
    );

    sqlite.prepare(`
      INSERT INTO audit_events (
        id, agency_id, actor_id, action, entity_type, entity_id, metadata, occurred_at
      ) VALUES (?, ?, ?, 'booking.payment_reversed', 'booking', ?, ?, ?)
    `).run(
      randomUUID(),
      context.agencyId,
      context.userId,
      bookingId,
      JSON.stringify({ originalTransactionId: original.id, reversalTransactionId: id, reason: input.reason }),
      now
    );

    return getBooking(context, bookingId);
  }).immediate();
}
