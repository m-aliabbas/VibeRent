import "server-only";
import { randomUUID } from "node:crypto";
import { sqlite } from "@/db/connection";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import type { BookingListItem } from "@/server/repositories/contracts";
import { parseConfirmBookingInput } from "@/server/validation/booking";
import { parseRentalInspectionInput } from "@/server/validation/rental-operation";

type BookingRow = {
  id: string; customer_id: string; customer: string; vehicle_id: string; make: string; model: string; year: number; plate: string; city: string;
  pickup_at: string; return_at: string; daily_rate: number; extras: number; discount: number; total_amount: number; deposit_required: number; paid: number; status: string; source: string; notes: string | null;
};

const displayStatus: Record<string, BookingListItem["status"]> = { draft: "Draft", confirmed: "Confirmed", checked_out: "Checked Out", completed: "Completed", cancelled: "Cancelled", no_show: "No Show" };

export type AvailabilityBlockDto = { id: string; vehicleId: string; from: string; to: string; reason: string; kind: string };

export function listBookings(context: RequestContext): BookingListItem[] {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const rows = sqlite.prepare(`SELECT bk.*, c.name AS customer, v.make, v.model, v.year, v.plate, br.city, coalesce((SELECT sum(CASE WHEN ft.kind IN ('refund','reversal') THEN -ft.amount ELSE ft.amount END) FROM financial_transactions ft WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted'),0) AS paid FROM bookings bk JOIN customers c ON c.id=bk.customer_id AND c.agency_id=bk.agency_id JOIN vehicles v ON v.id=bk.vehicle_id AND v.agency_id=bk.agency_id JOIN branches br ON br.id=bk.branch_id AND br.agency_id=bk.agency_id WHERE bk.agency_id=? ORDER BY bk.pickup_at DESC`).all(context.agencyId) as BookingRow[];
  return rows.map((row) => {
    const days = Math.max(1, Math.ceil((Date.parse(row.return_at) - Date.parse(row.pickup_at)) / 86_400_000));
    return { id: row.id, customerId: row.customer_id, customer: row.customer, vehicleId: row.vehicle_id, vehicle: `${row.make} ${row.model} ${row.year}`, plate: row.plate, city: row.city, pickupAt: row.pickup_at, returnAt: row.return_at, dailyRate: row.daily_rate, days, extras: row.extras, discount: row.discount, tax: 0, deposit: row.deposit_required, paid: row.paid, status: displayStatus[row.status], source: row.source, notes: row.notes ?? "" };
  });
}

export function getBooking(context: RequestContext, id: string) {
  const booking = listBookings(context).find((item) => item.id === id);
  if (!booking) throw new DomainError("NOT_FOUND", "Booking not found.", 404);
  const inspections = sqlite.prepare(`SELECT kind, odometer, fuel_level AS fuelLevel, condition_notes AS conditionNotes, occurred_at AS occurredAt FROM rental_inspections WHERE agency_id=? AND booking_id=? ORDER BY occurred_at`).all(context.agencyId, id);
  return { ...booking, inspections };
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
  const input = parseRentalInspectionInput(rawInput);
  return sqlite.transaction(() => {
    const booking = sqlite.prepare(`SELECT id, vehicle_id AS vehicleId, status, version FROM bookings WHERE agency_id=? AND id=? LIMIT 1`).get(context.agencyId, bookingId) as { id: string; vehicleId: string; status: string; version: number } | undefined;
    if (!booking) throw new DomainError("NOT_FOUND", "Booking not found.", 404);
    const expectedStatus = kind === "checkout" ? "confirmed" : "checked_out";
    const nextStatus = kind === "checkout" ? "checked_out" : "completed";
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
    }
    sqlite.prepare(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(), context.agencyId, context.userId, `booking.${kind === "checkout" ? "checked_out" : "checked_in"}`, "booking", bookingId, JSON.stringify({ odometer: input.odometer, fuelLevel: input.fuelLevel }), now);
    return { id: bookingId, status: nextStatus, version: booking.version + 1, occurredAt: now };
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
    const subtotal = vehicle.daily_rate * days;
    if (input.discount > subtotal + input.extras) throw new DomainError("VALIDATION_FAILED", "Discount cannot exceed the booking subtotal.", 400, { discount: "Reduce the discount." });
    const totalAmount = subtotal + input.extras - input.discount;
    const id = `BKG-${randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    sqlite.prepare(`INSERT INTO bookings (id,agency_id,branch_id,vehicle_id,customer_id,pickup_at,return_at,status,daily_rate,extras,discount,total_amount,deposit_required,source,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'confirmed',?,?,?,?,?,?,?,?,?)`).run(id, context.agencyId, vehicle.branch_id, input.vehicleId, input.customerId, input.pickupAt, input.returnAt, vehicle.daily_rate, input.extras, input.discount, totalAmount, input.depositRequired, input.source, input.notes ?? null, now, now);
    sqlite.prepare(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(), context.agencyId, context.userId, "booking.confirmed", "booking", id, JSON.stringify({ vehicleId: input.vehicleId, pickupAt: input.pickupAt, returnAt: input.returnAt, dailyRate: vehicle.daily_rate, totalAmount }), now);
    return { id, status: "confirmed" as const, dailyRate: vehicle.daily_rate, totalAmount, currency: "PKR" as const };
  }).immediate();
}
