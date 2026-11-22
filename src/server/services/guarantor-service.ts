import "server-only";
import { randomUUID } from "node:crypto";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { normalizePakistanPhone } from "@/server/whatsapp/pakistan-phone";
import type { GuarantorInput } from "@/server/validation/booking";

export type GuarantorDto = Omit<GuarantorInput, "licenseNumber" | "licenseExpiresAt"> & {
  id: string;
  licenseNumber: string;
  licenseExpiresAt: string | null;
  /** The customer with the same CNIC, when this guarantor is also a customer. */
  customerId: string | null;
  /** Customers this guarantor backs (saved links and bookings). */
  customerCount: number;
  bookingCount: number;
};

/** Fields staff can edit; derived fields on GuarantorDto are ignored on save. */
export type GuarantorSaveInput = Partial<Pick<GuarantorDto, "id" | "name" | "parentage" | "cnic" | "phone" | "address" | "carAmount" | "licenseNumber" | "licenseExpiresAt">>;

export type GuarantorCustomerLink = { id: string; name: string; phone: string; cnic: string; linked: boolean; bookingCount: number };
export type GuarantorBookingRow = { id: string; publicNumber: number | null; customerId: string; customerName: string; vehicle: string; pickupAt: string; returnAt: string; status: string };
export type GuarantorDetailDto = GuarantorDto & { customers: GuarantorCustomerLink[]; bookings: GuarantorBookingRow[] };

/** Guarantors linked to a customer, plus whether that link came from a booking. */
export type CustomerGuarantorDto = GuarantorDto & { linked: boolean; bookingCount: number };

const select = `SELECT g.id,g.name,g.parentage,coalesce(g.cnic_normalized,'') AS cnic,g.phone_normalized AS phone,g.address,g.car_amount AS carAmount,
  coalesce(g.license_number,'') AS licenseNumber,g.license_expires_at AS licenseExpiresAt,
  (SELECT c.id FROM customers c WHERE c.agency_id=g.agency_id AND g.cnic_normalized IS NOT NULL AND g.cnic_normalized<>'' AND c.cnic_normalized=g.cnic_normalized AND c.archived_at IS NULL LIMIT 1) AS customerId,
  (SELECT count(*) FROM (SELECT cg.customer_id FROM customer_guarantors cg WHERE cg.agency_id=g.agency_id AND cg.guarantor_id=g.id
     UNION SELECT bk.customer_id FROM bookings bk WHERE bk.agency_id=g.agency_id AND bk.guarantor_id=g.id AND bk.archived_at IS NULL) linked_customers) AS customerCount,
  (SELECT count(*) FROM bookings bk WHERE bk.agency_id=g.agency_id AND bk.guarantor_id=g.id AND bk.archived_at IS NULL) AS bookingCount
  FROM guarantors g`;

function normalize(row: GuarantorDto): GuarantorDto {
  return { ...row, carAmount: Number(row.carAmount ?? 0), customerCount: Number(row.customerCount ?? 0), bookingCount: Number(row.bookingCount ?? 0) };
}

async function audit(context: RequestContext, action: string, entityId: string, metadata: Record<string, unknown> | null, now: string) {
  await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)", [randomUUID(), context.agencyId, context.userId, action, "guarantor", entityId, metadata ? JSON.stringify(metadata) : null, now]);
}

export async function listGuarantors(context: RequestContext): Promise<GuarantorDto[]> {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  return (await queryAll<GuarantorDto>(`${select} WHERE g.agency_id=? AND g.archived_at IS NULL ORDER BY g.name`, [context.agencyId])).map(normalize);
}

async function readGuarantor(agencyId: string, id: string) {
  const row = await queryOne<GuarantorDto>(`${select} WHERE g.agency_id=? AND g.id=? AND g.archived_at IS NULL`, [agencyId, id]);
  return row ? normalize(row) : undefined;
}

export async function getGuarantorDetail(context: RequestContext, id: string): Promise<GuarantorDetailDto> {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const guarantor = await readGuarantor(context.agencyId, id);
  if (!guarantor) throw new DomainError("NOT_FOUND", "Guarantor not found.", 404);
  const customers = await queryAll<GuarantorCustomerLink>(`SELECT c.id,c.name,c.phone_normalized AS phone,
      substr(c.cnic_normalized,1,5)||'-'||substr(c.cnic_normalized,6,7)||'-'||substr(c.cnic_normalized,13,1) AS cnic,
      CASE WHEN EXISTS (SELECT 1 FROM customer_guarantors cg WHERE cg.agency_id=c.agency_id AND cg.customer_id=c.id AND cg.guarantor_id=?) THEN 1 ELSE 0 END AS linked,
      (SELECT count(*) FROM bookings bk WHERE bk.agency_id=c.agency_id AND bk.customer_id=c.id AND bk.guarantor_id=? AND bk.archived_at IS NULL) AS bookingCount
    FROM customers c WHERE c.agency_id=? AND c.archived_at IS NULL AND c.id IN (
      SELECT cg.customer_id FROM customer_guarantors cg WHERE cg.agency_id=? AND cg.guarantor_id=?
      UNION SELECT bk.customer_id FROM bookings bk WHERE bk.agency_id=? AND bk.guarantor_id=? AND bk.archived_at IS NULL)
    ORDER BY c.name`, [id, id, context.agencyId, context.agencyId, id, context.agencyId, id]);
  const bookings = await queryAll<GuarantorBookingRow>(`SELECT bk.id,bk.public_number AS publicNumber,bk.customer_id AS customerId,c.name AS customerName,
      CASE WHEN bk.fulfillment_type='external' THEN coalesce(bk.external_vehicle_make,'')||' '||coalesce(bk.external_vehicle_model,'')||' · '||coalesce(bk.external_vehicle_plate,'') ELSE coalesce(v.make||' '||v.model||' · '||v.plate,'Vehicle') END AS vehicle,
      bk.pickup_at AS pickupAt,bk.return_at AS returnAt,bk.status
    FROM bookings bk JOIN customers c ON c.id=bk.customer_id AND c.agency_id=bk.agency_id LEFT JOIN vehicles v ON v.id=bk.vehicle_id AND v.agency_id=bk.agency_id
    WHERE bk.agency_id=? AND bk.guarantor_id=? AND bk.archived_at IS NULL ORDER BY bk.pickup_at DESC LIMIT 200`, [context.agencyId, id]);
  return { ...guarantor, customers: customers.map(row => ({ ...row, linked: Boolean(Number(row.linked)), bookingCount: Number(row.bookingCount) })), bookings };
}

export async function saveGuarantor(context: RequestContext, raw: unknown): Promise<GuarantorDto> {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  if (!raw || typeof raw !== "object") throw new DomainError("VALIDATION_FAILED", "Enter valid guarantor details.", 400);
  const input = raw as GuarantorSaveInput, errors: Record<string, string> = {};
  const name = input.name?.trim() ?? "", parentage = input.parentage?.trim() ?? "", address = input.address?.trim() ?? "", cnic = (input.cnic ?? "").replace(/\D/g, "");
  const licenseNumber = input.licenseNumber?.trim() ?? "", licenseExpiresAt = input.licenseExpiresAt?.trim() || null;
  let phone = "";
  if (input.phone?.trim()) try { phone = normalizePakistanPhone(input.phone); } catch { errors.phone = "Enter a valid Pakistani mobile number."; }
  if (name.length < 2) errors.name = "Enter the guarantor's name.";
  if (parentage && parentage.length < 2) errors.parentage = "Enter at least 2 parentage characters, or leave it blank.";
  if (cnic.length !== 0 && cnic.length !== 13) errors.cnic = "Enter a 13-digit CNIC, or leave it blank.";
  if (address && address.length < 5) errors.address = "Enter at least 5 address characters, or leave it blank.";
  if (licenseNumber.length > 40) errors.licenseNumber = "Enter a license number of up to 40 characters.";
  if (licenseExpiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(licenseExpiresAt)) errors.licenseExpiresAt = "Enter a valid license expiry date.";
  if (input.carAmount !== undefined && (!Number.isInteger(input.carAmount) || input.carAmount < 0)) errors.carAmount = "Enter a non-negative whole PKR amount.";
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the guarantor details.", 400, errors);
  const id = input.id?.trim() || `gtr_${randomUUID()}`;
  return inTransaction(async () => {
    const current = await queryOne<{id:string}>("SELECT id FROM guarantors WHERE agency_id=? AND id=? AND archived_at IS NULL", [context.agencyId, id]);
    if (input.id && !current) throw new DomainError("NOT_FOUND", "Guarantor not found.", 404);
    const duplicate = cnic ? await queryOne("SELECT id FROM guarantors WHERE agency_id=? AND cnic_normalized=? AND id<>?", [context.agencyId, cnic, id]) : null;
    if (duplicate) throw new DomainError("VALIDATION_FAILED", "A guarantor with this CNIC already exists.", 409, {cnic:"CNIC must be unique."});
    const now = new Date().toISOString();
    if (current) await execute("UPDATE guarantors SET name=?,parentage=?,cnic_normalized=?,phone_normalized=?,address=?,car_amount=?,license_number=?,license_expires_at=?,updated_at=? WHERE agency_id=? AND id=?", [name,parentage,cnic||null,phone,address,input.carAmount??0,licenseNumber||null,licenseExpiresAt,now,context.agencyId,id]);
    else await execute("INSERT INTO guarantors (id,agency_id,name,parentage,cnic_normalized,phone_normalized,address,car_amount,license_number,license_expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [id,context.agencyId,name,parentage,cnic||null,phone,address,input.carAmount??0,licenseNumber||null,licenseExpiresAt,now,now]);
    await audit(context, current ? "guarantor.updated" : "guarantor.created", id, { name }, now);
    return (await readGuarantor(context.agencyId, id))!;
  }, {immediate:true});
}

export async function archiveGuarantor(context: RequestContext, id: string) {
  requireRole(context, ["agency_owner", "fleet_manager"]);
  return inTransaction(async () => {
    const now = new Date().toISOString();
    const result = await execute("UPDATE guarantors SET archived_at=?,updated_at=? WHERE agency_id=? AND id=? AND archived_at IS NULL", [now,now,context.agencyId,id]);
    if (!result.changes) throw new DomainError("NOT_FOUND", "Guarantor not found.", 404);
    await audit(context, "guarantor.archived", id, null, now);
    return {id};
  }, {immediate:true});
}

async function insertLink(context: RequestContext, customerId: string, guarantorId: string, now: string) {
  const result = await execute(`INSERT INTO customer_guarantors (id,agency_id,customer_id,guarantor_id,created_at,updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT (agency_id,customer_id,guarantor_id) DO NOTHING`, [`cgl_${randomUUID()}`, context.agencyId, customerId, guarantorId, now, now]);
  return result.changes > 0;
}

async function assertCustomer(context: RequestContext, customerId: string) {
  const customer = await queryOne<{ id: string; cnic: string }>("SELECT id,cnic_normalized AS cnic FROM customers WHERE agency_id=? AND id=? AND archived_at IS NULL", [context.agencyId, customerId]);
  if (!customer) throw new DomainError("NOT_FOUND", "Customer not found.", 404);
  return customer;
}

/** Links a saved guarantor to a customer. One guarantor can back many customers. */
export async function linkCustomerGuarantor(context: RequestContext, customerId: string, guarantorId: string) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  return inTransaction(async () => {
    const customer = await assertCustomer(context, customerId);
    const guarantor = await readGuarantor(context.agencyId, guarantorId);
    if (!guarantor) throw new DomainError("NOT_FOUND", "Guarantor not found.", 404);
    if (guarantor.cnic && guarantor.cnic === customer.cnic) throw new DomainError("VALIDATION_FAILED", "A customer cannot be their own guarantor.", 400);
    const now = new Date().toISOString();
    if (await insertLink(context, customerId, guarantorId, now)) await audit(context, "guarantor.customer_linked", guarantorId, { customerId }, now);
    return listCustomerGuarantorsUnchecked(context.agencyId, customerId);
  }, { immediate: true });
}

/** Removes the saved link. Bookings that used this guarantor keep it. */
export async function unlinkCustomerGuarantor(context: RequestContext, customerId: string, guarantorId: string) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  return inTransaction(async () => {
    await assertCustomer(context, customerId);
    const now = new Date().toISOString();
    const result = await execute("DELETE FROM customer_guarantors WHERE agency_id=? AND customer_id=? AND guarantor_id=?", [context.agencyId, customerId, guarantorId]);
    if (result.changes) await audit(context, "guarantor.customer_unlinked", guarantorId, { customerId }, now);
    return listCustomerGuarantorsUnchecked(context.agencyId, customerId);
  }, { immediate: true });
}

async function listCustomerGuarantorsUnchecked(agencyId: string, customerId: string): Promise<CustomerGuarantorDto[]> {
  const rows = await queryAll<GuarantorDto & { linked: number; customerBookings: number }>(`${select.replace("FROM guarantors g", `,
      CASE WHEN EXISTS (SELECT 1 FROM customer_guarantors cg WHERE cg.agency_id=g.agency_id AND cg.guarantor_id=g.id AND cg.customer_id=?) THEN 1 ELSE 0 END AS linked,
      (SELECT count(*) FROM bookings bk WHERE bk.agency_id=g.agency_id AND bk.guarantor_id=g.id AND bk.customer_id=? AND bk.archived_at IS NULL) AS customerBookings
    FROM guarantors g`)}
    WHERE g.agency_id=? AND g.archived_at IS NULL AND g.id IN (
      SELECT cg.guarantor_id FROM customer_guarantors cg WHERE cg.agency_id=? AND cg.customer_id=?
      UNION SELECT bk.guarantor_id FROM bookings bk WHERE bk.agency_id=? AND bk.customer_id=? AND bk.guarantor_id IS NOT NULL AND bk.archived_at IS NULL)
    ORDER BY g.name`, [customerId, customerId, agencyId, agencyId, customerId, agencyId, customerId]);
  return rows.map(row => ({ ...normalize(row), linked: Boolean(Number(row.linked)), bookingCount: Number(row.customerBookings) }));
}

export async function listCustomerGuarantors(context: RequestContext, customerId: string) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  await assertCustomer(context, customerId);
  return listCustomerGuarantorsUnchecked(context.agencyId, customerId);
}

/** When the customer is also a saved guarantor (same CNIC): that guarantor and the customers they back. */
export async function getCustomerAsGuarantor(context: RequestContext, customerId: string): Promise<GuarantorDetailDto | null> {
  const customer = await assertCustomer(context, customerId);
  const row = await queryOne<{ id: string }>("SELECT id FROM guarantors WHERE agency_id=? AND cnic_normalized=? AND archived_at IS NULL LIMIT 1", [context.agencyId, customer.cnic]);
  return row ? getGuarantorDetail(context, row.id) : null;
}

/** Makes an existing customer available as a guarantor, reusing the guarantor with the same CNIC when there is one. */
export async function guarantorFromCustomer(context: RequestContext, customerId: string): Promise<GuarantorDto> {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  const customer = await queryOne<{ name: string; fatherName: string | null; cnic: string; phone: string; address: string | null; licenseNumber: string | null; licenseExpiresAt: string | null }>(
    "SELECT name,father_name AS fatherName,cnic_normalized AS cnic,phone_normalized AS phone,address,license_number AS licenseNumber,license_expires_at AS licenseExpiresAt FROM customers WHERE agency_id=? AND id=? AND archived_at IS NULL",
    [context.agencyId, customerId]);
  if (!customer) throw new DomainError("NOT_FOUND", "Customer not found.", 404);
  const existing = /^\d{13}$/.test(customer.cnic) ? await queryOne<{ id: string; archivedAt: string | null }>("SELECT id,archived_at AS archivedAt FROM guarantors WHERE agency_id=? AND cnic_normalized=? LIMIT 1", [context.agencyId, customer.cnic]) : undefined;
  if (existing && !existing.archivedAt) return (await readGuarantor(context.agencyId, existing.id))!;
  if (existing) {
    const now = new Date().toISOString();
    await execute("UPDATE guarantors SET archived_at=NULL,updated_at=? WHERE agency_id=? AND id=?", [now, context.agencyId, existing.id]);
    await audit(context, "guarantor.restored", existing.id, { fromCustomerId: customerId }, now);
    return (await readGuarantor(context.agencyId, existing.id))!;
  }
  return saveGuarantor(context, {
    name: customer.name, parentage: customer.fatherName ?? "", cnic: /^\d{13}$/.test(customer.cnic) ? customer.cnic : "", phone: customer.phone,
    address: customer.address ?? "", carAmount: 0, licenseNumber: customer.licenseNumber ?? "", licenseExpiresAt: customer.licenseExpiresAt,
  });
}

/**
 * Finds or creates the saved guarantor for a booking and links them to the customer. Runs inside the
 * booking transaction. A guarantor id from the client is only trusted after it is found in this agency.
 */
export async function resolveBookingGuarantor(context: RequestContext, guarantor: GuarantorInput, customerId: string | null, now: string): Promise<string> {
  let id: string | undefined;
  if (guarantor.id) id = (await queryOne<{ id: string }>("SELECT id FROM guarantors WHERE agency_id=? AND id=? AND archived_at IS NULL", [context.agencyId, guarantor.id]))?.id;
  if (!id && guarantor.cnic) {
    const match = await queryOne<{ id: string; archivedAt: string | null }>("SELECT id,archived_at AS archivedAt FROM guarantors WHERE agency_id=? AND cnic_normalized=? LIMIT 1", [context.agencyId, guarantor.cnic]);
    if (match?.archivedAt) await execute("UPDATE guarantors SET archived_at=NULL,updated_at=? WHERE agency_id=? AND id=?", [now, context.agencyId, match.id]);
    id = match?.id;
  }
  if (!id && !guarantor.cnic && guarantor.phone) id = (await queryOne<{ id: string }>("SELECT id FROM guarantors WHERE agency_id=? AND (cnic_normalized IS NULL OR cnic_normalized='') AND lower(name)=lower(?) AND phone_normalized=? AND archived_at IS NULL LIMIT 1", [context.agencyId, guarantor.name, guarantor.phone]))?.id;
  if (!id) {
    id = `gtr_${randomUUID()}`;
    await execute("INSERT INTO guarantors (id,agency_id,name,parentage,cnic_normalized,phone_normalized,address,car_amount,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [id, context.agencyId, guarantor.name, guarantor.parentage, guarantor.cnic || null, guarantor.phone, guarantor.address, guarantor.carAmount ?? 0, now, now]);
    await audit(context, "guarantor.created", id, { name: guarantor.name, source: "booking" }, now);
  }
  // Licence details captured on the booking (often by OCR) fill or refresh the saved guarantor.
  if (guarantor.licenseNumber || guarantor.licenseExpiresAt) await execute("UPDATE guarantors SET license_number=coalesce(?,license_number),license_expires_at=coalesce(?,license_expires_at),updated_at=? WHERE agency_id=? AND id=?", [guarantor.licenseNumber || null, guarantor.licenseExpiresAt || null, now, context.agencyId, id]);
  // A skipped (with-driver guest) renter is not a real customer, so it gets no saved link.
  if (customerId && await insertLink(context, customerId, id, now)) await audit(context, "guarantor.customer_linked", id, { customerId, source: "booking" }, now);
  return id;
}

/**
 * The guarantor to pre-select when this customer is picked for a new booking: the guarantor of their
 * latest booking, otherwise the most recently linked one. Staff can remove or change it.
 */
export async function defaultGuarantorForCustomer(context: RequestContext, customerId: string): Promise<GuarantorDto | null> {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  const row = await queryOne<{ id: string }>(`SELECT g.id FROM guarantors g WHERE g.agency_id=? AND g.archived_at IS NULL AND g.id = coalesce(
      (SELECT bk.guarantor_id FROM bookings bk WHERE bk.agency_id=? AND bk.customer_id=? AND bk.guarantor_id IS NOT NULL AND bk.archived_at IS NULL ORDER BY bk.created_at DESC LIMIT 1),
      (SELECT cg.guarantor_id FROM customer_guarantors cg WHERE cg.agency_id=? AND cg.customer_id=? ORDER BY cg.created_at DESC LIMIT 1)) LIMIT 1`,
    [context.agencyId, context.agencyId, customerId, context.agencyId, customerId]);
  return row ? (await readGuarantor(context.agencyId, row.id)) ?? null : null;
}
