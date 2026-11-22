import "server-only";
import { loadDocumentBranding } from "@/server/services/branding-service";

import { randomUUID } from "node:crypto";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import { getAgencyTimeZone } from "@/server/context/agency-time-zone";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { createTransactionInvoice } from "@/server/documents/transaction-invoice";
import { isCalendarDate } from "@/server/validation/booking";
import { normalizePakistanPhone } from "@/server/whatsapp/pakistan-phone";
import { formatInZone, zonedDayKey } from "@/lib/timezone";

/**
 * Quotations are price offers given before a booking. They have their own number (Q-0001), never block a
 * vehicle and never touch the ledgers. An accepted quotation can be turned into a booking.
 */
export const quotationStatuses = ["draft", "sent", "accepted", "declined"] as const;
export type QuotationStatus = (typeof quotationStatuses)[number] | "expired";

export type QuotationDto = {
  id: string; publicNumber: number; reference: string;
  customerId: string | null; customerName: string; customerPhone: string;
  vehicleId: string | null; vehicleLabel: string; plate: string | null;
  rentalMode: "self_drive" | "with_driver"; destinationCity: string;
  pickupAt: string; returnAt: string; days: number; dailyRate: number; extras: number; discount: number;
  totalAmount: number; depositRequired: number; notes: string | null; validUntil: string;
  /** Saved status; `expired` is derived once the validity date has passed for draft or sent quotes. */
  status: QuotationStatus; bookingId: string | null; bookingNumber: number | null; createdAt: string; updatedAt: string;
};

export type QuotationInput = {
  id?: string; customerId?: string | null; customerName?: string; customerPhone?: string;
  vehicleId?: string | null; vehicleLabel?: string; rentalMode?: string; destinationCity?: string;
  pickupAt?: string; returnAt?: string; dailyRate?: number; extras?: number; discount?: number;
  depositRequired?: number; notes?: string | null; validUntil?: string;
};

export const formatQuotationNumber = (value: number) => `Q-${String(value).padStart(4, "0")}`;

const select = `SELECT q.id,q.public_number AS publicNumber,q.customer_id AS customerId,q.customer_name AS customerName,q.customer_phone AS customerPhone,
  q.vehicle_id AS vehicleId,q.vehicle_label AS vehicleLabel,v.plate,q.rental_mode AS rentalMode,q.destination_city AS destinationCity,
  q.pickup_at AS pickupAt,q.return_at AS returnAt,q.days,q.daily_rate AS dailyRate,q.extras,q.discount,q.total_amount AS totalAmount,
  q.deposit_required AS depositRequired,q.notes,q.valid_until AS validUntil,q.status,q.booking_id AS bookingId,bk.public_number AS bookingNumber,
  q.created_at AS createdAt,q.updated_at AS updatedAt
  FROM quotations q
  LEFT JOIN vehicles v ON v.id=q.vehicle_id AND v.agency_id=q.agency_id
  LEFT JOIN bookings bk ON bk.id=q.booking_id AND bk.agency_id=q.agency_id`;

type Row = Omit<QuotationDto, "reference" | "status"> & { status: string };

function toDto(row: Row, today: string): QuotationDto {
  const open = row.status === "draft" || row.status === "sent";
  return {
    ...row, reference: formatQuotationNumber(Number(row.publicNumber)),
    days: Number(row.days), dailyRate: Number(row.dailyRate), extras: Number(row.extras), discount: Number(row.discount),
    totalAmount: Number(row.totalAmount), depositRequired: Number(row.depositRequired), publicNumber: Number(row.publicNumber),
    rentalMode: row.rentalMode === "with_driver" ? "with_driver" : "self_drive",
    status: open && row.validUntil < today ? "expired" : row.status as QuotationStatus,
  };
}

async function today(agencyId: string) {
  return zonedDayKey(new Date(), await getAgencyTimeZone(agencyId));
}

export async function listQuotations(context: RequestContext): Promise<QuotationDto[]> {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const day = await today(context.agencyId);
  return (await queryAll<Row>(`${select} WHERE q.agency_id=? AND q.archived_at IS NULL ORDER BY q.public_number DESC LIMIT 500`, [context.agencyId])).map(row => toDto(row, day));
}

export async function getQuotation(context: RequestContext, id: string): Promise<QuotationDto> {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const row = await queryOne<Row>(`${select} WHERE q.agency_id=? AND q.id=? AND q.archived_at IS NULL`, [context.agencyId, id]);
  if (!row) throw new DomainError("NOT_FOUND", "Quotation not found.", 404);
  return toDto(row, await today(context.agencyId));
}

const wholeAmount = (value: unknown) => value === undefined || value === null || value === "" ? 0 : Number(value);

/** Creates or updates a quotation. Customer and vehicle details are copied so the quote survives later edits. */
export async function saveQuotation(context: RequestContext, raw: unknown): Promise<QuotationDto> {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  if (!raw || typeof raw !== "object") throw new DomainError("VALIDATION_FAILED", "Enter valid quotation details.", 400);
  const input = raw as QuotationInput, errors: Record<string, string> = {};
  const extras = wholeAmount(input.extras), discount = wholeAmount(input.discount), depositRequired = wholeAmount(input.depositRequired);
  for (const [key, value] of [["extras", extras], ["discount", discount], ["depositRequired", depositRequired]] as const) if (!Number.isSafeInteger(value) || value < 0) errors[key] = "Enter a non-negative whole PKR amount.";
  const rentalMode = input.rentalMode === "with_driver" ? "with_driver" : "self_drive";
  const pickup = Date.parse(input.pickupAt ?? ""), returned = Date.parse(input.returnAt ?? "");
  if (!Number.isFinite(pickup)) errors.pickupAt = "Enter a valid pickup time.";
  if (!Number.isFinite(returned) || returned <= pickup) errors.returnAt = "Return must be after pickup.";
  if (!isCalendarDate(input.validUntil)) errors.validUntil = "Enter the date this quote is valid until.";
  const notes = input.notes?.trim() || null;
  if (notes && notes.length > 1000) errors.notes = "Keep notes under 1,000 characters.";

  let customerName = input.customerName?.trim() ?? "", customerPhone = "";
  let customerId: string | null = input.customerId?.trim() || null;
  if (customerId) {
    const customer = await queryOne<{ name: string; phone: string }>("SELECT name,phone_normalized AS phone FROM customers WHERE agency_id=? AND id=? AND archived_at IS NULL", [context.agencyId, customerId]);
    if (!customer) { errors.customerId = "Customer not found."; customerId = null; }
    else { customerName = customer.name; customerPhone = customer.phone; }
  } else {
    if (customerName.length < 2) errors.customerName = "Enter the customer's name or choose a customer.";
    if (input.customerPhone?.trim()) try { customerPhone = normalizePakistanPhone(input.customerPhone); } catch { errors.customerPhone = "Enter a valid Pakistani mobile number."; }
  }

  let vehicleId: string | null = input.vehicleId?.trim() || null, vehicleLabel = input.vehicleLabel?.trim() ?? "", defaultRate = 0;
  if (vehicleId) {
    const vehicle = await queryOne<{ label: string; dailyRate: number; withDriverRate: number | null }>("SELECT make||' '||model||' '||year||' · '||plate AS label,daily_rate AS dailyRate,with_driver_rate AS withDriverRate FROM vehicles WHERE agency_id=? AND id=? AND archived_at IS NULL", [context.agencyId, vehicleId]);
    if (!vehicle) { errors.vehicleId = "Vehicle not found."; vehicleId = null; }
    else { vehicleLabel = vehicle.label; defaultRate = Number(rentalMode === "with_driver" ? vehicle.withDriverRate ?? vehicle.dailyRate : vehicle.dailyRate); }
  } else if (vehicleLabel.length < 2) errors.vehicleLabel = "Choose a vehicle or describe the car (e.g. Corolla or similar).";

  const dailyRate = input.dailyRate === undefined || input.dailyRate === null ? defaultRate : Number(input.dailyRate);
  if (!Number.isSafeInteger(dailyRate) || dailyRate < 1) errors.dailyRate = "Enter the daily rate.";
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the quotation details.", 400, errors);

  const days = Math.max(1, Math.ceil((returned - pickup) / 86_400_000));
  const subtotal = dailyRate * days + extras;
  if (discount > subtotal) throw new DomainError("VALIDATION_FAILED", "Discount cannot exceed the quote subtotal.", 400, { discount: "Reduce the discount." });
  const totalAmount = subtotal - discount;
  const pickupAt = new Date(pickup).toISOString(), returnAt = new Date(returned).toISOString();
  const destinationCity = input.destinationCity?.trim() ?? "";

  return inTransaction(async () => {
    const now = new Date().toISOString();
    let id = input.id?.trim();
    if (id) {
      const current = await queryOne<{ status: string; bookingId: string | null }>("SELECT status,booking_id AS bookingId FROM quotations WHERE agency_id=? AND id=? AND archived_at IS NULL", [context.agencyId, id]);
      if (!current) throw new DomainError("NOT_FOUND", "Quotation not found.", 404);
      if (current.bookingId) throw new DomainError("INVALID_STATUS_TRANSITION", "This quotation is already a booking. Change the booking instead.", 409);
      await execute(`UPDATE quotations SET customer_id=?,customer_name=?,customer_phone=?,vehicle_id=?,vehicle_label=?,rental_mode=?,destination_city=?,pickup_at=?,return_at=?,days=?,daily_rate=?,extras=?,discount=?,total_amount=?,deposit_required=?,notes=?,valid_until=?,version=version+1,updated_at=? WHERE agency_id=? AND id=?`,
        [customerId, customerName, customerPhone, vehicleId, vehicleLabel, rentalMode, destinationCity, pickupAt, returnAt, days, dailyRate, extras, discount, totalAmount, depositRequired, notes, input.validUntil, now, context.agencyId, id]);
    } else {
      id = `quo_${randomUUID()}`;
      // Lock the agency's counter row (PostgreSQL) so two quotes created at once never share a number.
      await execute("INSERT INTO quotation_number_counters (agency_id,next_number,created_at,updated_at) VALUES (?,1,?,?) ON CONFLICT(agency_id) DO NOTHING", [context.agencyId, now, now]);
      const counter = await queryOne<{ nextNumber: number }>("SELECT next_number AS nextNumber FROM quotation_number_counters WHERE agency_id=? LIMIT 1 /*postgres:for-update*/", [context.agencyId]);
      const publicNumber = Number(counter?.nextNumber ?? 1);
      await execute("UPDATE quotation_number_counters SET next_number=next_number+1,updated_at=? WHERE agency_id=?", [now, context.agencyId]);
      await execute(`INSERT INTO quotations (id,agency_id,public_number,customer_id,customer_name,customer_phone,vehicle_id,vehicle_label,rental_mode,destination_city,pickup_at,return_at,days,daily_rate,extras,discount,total_amount,deposit_required,notes,valid_until,status,actor_id,version,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,1,?,?)`,
        [id, context.agencyId, publicNumber, customerId, customerName, customerPhone, vehicleId, vehicleLabel, rentalMode, destinationCity, pickupAt, returnAt, days, dailyRate, extras, discount, totalAmount, depositRequired, notes, input.validUntil, context.userId || null, now, now]);
    }
    await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)", [randomUUID(), context.agencyId, context.userId, input.id ? "quotation.updated" : "quotation.created", "quotation", id, JSON.stringify({ totalAmount, customerName }), now]);
    return getQuotation(context, id);
  }, { immediate: true });
}

/** Marks a quotation sent, accepted or declined (or back to draft). Converted quotations stay accepted. */
export async function setQuotationStatus(context: RequestContext, id: string, status: string): Promise<QuotationDto> {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  if (!(quotationStatuses as readonly string[]).includes(status)) throw new DomainError("VALIDATION_FAILED", "Choose a valid quotation status.", 400);
  return inTransaction(async () => {
    const current = await queryOne<{ bookingId: string | null }>("SELECT booking_id AS bookingId FROM quotations WHERE agency_id=? AND id=? AND archived_at IS NULL", [context.agencyId, id]);
    if (!current) throw new DomainError("NOT_FOUND", "Quotation not found.", 404);
    if (current.bookingId && status !== "accepted") throw new DomainError("INVALID_STATUS_TRANSITION", "This quotation is already a booking.", 409);
    const now = new Date().toISOString();
    await execute("UPDATE quotations SET status=?,version=version+1,updated_at=? WHERE agency_id=? AND id=?", [status, now, context.agencyId, id]);
    await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)", [randomUUID(), context.agencyId, context.userId, `quotation.${status}`, "quotation", id, null, now]);
    return getQuotation(context, id);
  }, { immediate: true });
}

export async function archiveQuotation(context: RequestContext, id: string) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  return inTransaction(async () => {
    const now = new Date().toISOString();
    const result = await execute("UPDATE quotations SET archived_at=?,updated_at=? WHERE agency_id=? AND id=? AND archived_at IS NULL", [now, now, context.agencyId, id]);
    if (!result.changes) throw new DomainError("NOT_FOUND", "Quotation not found.", 404);
    await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)", [randomUUID(), context.agencyId, context.userId, "quotation.archived", "quotation", id, null, now]);
    return { id };
  }, { immediate: true });
}

/** Links a confirmed booking to the quotation it came from. Runs inside the booking transaction. */
export async function linkQuotationBooking(context: RequestContext, quotationId: string, bookingId: string, now: string) {
  const result = await execute("UPDATE quotations SET booking_id=?,status='accepted',version=version+1,updated_at=? WHERE agency_id=? AND id=? AND archived_at IS NULL AND booking_id IS NULL", [bookingId, now, context.agencyId, quotationId]);
  if (result.changes) await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)", [randomUUID(), context.agencyId, context.userId, "quotation.converted", "quotation", quotationId, JSON.stringify({ bookingId }), now]);
}

const money = (value: number) => `PKR ${Math.round(value).toLocaleString("en-PK")}`;

/** The quotation PDF the counter downloads or sends on WhatsApp. */
export async function renderQuotationPdf(context: RequestContext, id: string) {
  const quote = await getQuotation(context, id);
  const agency = await queryOne<{ name: string }>("SELECT name FROM agencies WHERE id=?", [context.agencyId]);
  const timeZone = await getAgencyTimeZone(context.agencyId);
  const when = (value: string) => formatInZone(value, { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }, timeZone);
  const day = (value: string) => new Intl.DateTimeFormat("en-PK", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  const bytes = await createTransactionInvoice({
    branding: await loadDocumentBranding(context.agencyId, context.userId),
    timeZone, agency: agency?.name ?? "VibeRent", title: "Quotation", reference: quote.reference, recipient: quote.customerName, issuedAt: quote.updatedAt,
    lines: [
      { label: "Vehicle", value: quote.vehicleLabel },
      { label: "Rental type", value: quote.rentalMode === "with_driver" ? "With driver" : "Self drive" },
      ...(quote.destinationCity ? [{ label: "Destination", value: quote.destinationCity }] : []),
      { label: "Pickup", value: when(quote.pickupAt) },
      { label: "Return", value: when(quote.returnAt) },
      { label: "Rent", value: `${quote.days} day${quote.days === 1 ? "" : "s"} × ${money(quote.dailyRate)} = ${money(quote.days * quote.dailyRate)}` },
      ...(quote.extras ? [{ label: "Extras", value: money(quote.extras) }] : []),
      ...(quote.discount ? [{ label: "Discount", value: `− ${money(quote.discount)}` }] : []),
      ...(quote.depositRequired ? [{ label: "Refundable security deposit", value: money(quote.depositRequired) }] : []),
      { label: "Valid until", value: day(quote.validUntil) },
      ...(quote.notes ? [{ label: "Notes", value: quote.notes }] : []),
    ],
    amountLabel: "Quoted total", amount: quote.totalAmount,
    note: "This is a quotation, not a booking. The vehicle is reserved only once the booking is confirmed.",
  });
  return { bytes, fileName: `quotation-${quote.reference}.pdf`, quote };
}
