import "server-only";
import { randomUUID } from "node:crypto";
import { sqlite } from "@/db/connection";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { parseCreateCustomerInput } from "@/server/validation/customer";

export type CustomerDto = { id: string; name: string; phone: string; cnic: string; email: string | null; licenseNumber: string | null; licenseExpiresAt: string | null; status: string; version: number; updatedAt: string };

export type CustomerDetailDto = CustomerDto & {
  bookingCount: number;
  lifetimeValue: number;
  outstanding: number;
  lastRentalAt: string | null;
  bookings: Array<{ id: string; vehicle: string; plate: string; status: string; pickupAt: string; returnAt: string; totalAmount: number }>;
};

function getCustomerRow(context: RequestContext, id: string) {
  return sqlite.prepare(`SELECT id, name, phone_normalized AS phone, substr(cnic_normalized,1,5) || '-' || substr(cnic_normalized,6,7) || '-' || substr(cnic_normalized,-1) AS cnic, email, license_number AS licenseNumber, license_expires_at AS licenseExpiresAt, status, version, updated_at AS updatedAt FROM customers WHERE agency_id=? AND id=? AND archived_at IS NULL LIMIT 1`).get(context.agencyId, id) as CustomerDto | undefined;
}

export function listCustomers(context: RequestContext) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  return sqlite.prepare(`SELECT id, name, phone_normalized AS phone, substr(cnic_normalized,1,5) || '-' || substr(cnic_normalized,6,7) || '-' || substr(cnic_normalized,-1) AS cnic, email, license_number AS licenseNumber, license_expires_at AS licenseExpiresAt, status, version, updated_at AS updatedAt FROM customers WHERE agency_id=? AND archived_at IS NULL ORDER BY name`).all(context.agencyId) as CustomerDto[];
}

export function getCustomer(context: RequestContext, id: string) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const customer = getCustomerRow(context, id);
  if (!customer) throw new DomainError("NOT_FOUND", "Customer not found.", 404);
  return customer;
}

export function getCustomerDetail(context: RequestContext, id: string): CustomerDetailDto {
  const customer = getCustomer(context, id);
  const bookings = sqlite.prepare(`
    SELECT bk.id, v.make || ' ' || v.model || ' ' || v.year AS vehicle, v.plate,
      bk.status, bk.pickup_at AS pickupAt, bk.return_at AS returnAt, bk.total_amount AS totalAmount,
      coalesce((SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal') THEN -ft.amount ELSE ft.amount END)
        FROM financial_transactions ft WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted' AND lower(ft.kind) IN ('payment','deposit_applied','reversal','refund')),0) AS paid
    FROM bookings bk
    JOIN vehicles v ON v.id=bk.vehicle_id AND v.agency_id=bk.agency_id
    WHERE bk.agency_id=? AND bk.customer_id=?
    ORDER BY bk.pickup_at DESC
  `).all(context.agencyId, id) as Array<{ id: string; vehicle: string; plate: string; status: string; pickupAt: string; returnAt: string; totalAmount: number; paid: number }>;
  return {
    ...customer,
    bookingCount: bookings.length,
    lifetimeValue: bookings.filter(item => item.status === "completed").reduce((sum, item) => sum + item.totalAmount, 0),
    outstanding: bookings.filter(item => !["cancelled", "no_show"].includes(item.status)).reduce((sum, item) => sum + Math.max(0, item.totalAmount - item.paid), 0),
    lastRentalAt: bookings[0]?.returnAt ?? null,
    bookings: bookings.map(booking => ({ id: booking.id, vehicle: booking.vehicle, plate: booking.plate, status: booking.status, pickupAt: booking.pickupAt, returnAt: booking.returnAt, totalAmount: booking.totalAmount })),
  };
}

export function createCustomer(context: RequestContext, rawInput: unknown) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  const input = parseCreateCustomerInput(rawInput);
  return sqlite.transaction(() => {
    const duplicate = sqlite.prepare("SELECT id FROM customers WHERE agency_id=? AND cnic_normalized=? LIMIT 1").get(context.agencyId, input.cnicNormalized) as { id: string } | undefined;
    if (duplicate) throw new DomainError("VALIDATION_FAILED", "A customer with this CNIC already exists.", 409, { cnic: "CNIC must be unique." });
    const id = `cus_${randomUUID()}`;
    const now = new Date().toISOString();
    sqlite.prepare(`INSERT INTO customers (id,agency_id,name,phone_normalized,cnic_normalized,email,license_number,license_expires_at,status,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'active',1,?,?)`).run(id, context.agencyId, input.name, input.phoneNormalized, input.cnicNormalized, input.email ?? null, input.licenseNumber ?? null, input.licenseExpiresAt ?? null, now, now);
    sqlite.prepare(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(), context.agencyId, context.userId, "customer.created", "customer", id, JSON.stringify({ name: input.name }), now);
    return getCustomerRow(context, id)!;
  })();
}

export function updateCustomer(context: RequestContext, id: string, rawInput: unknown) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  const current = sqlite.prepare("SELECT cnic_normalized AS cnic FROM customers WHERE agency_id=? AND id=? AND archived_at IS NULL LIMIT 1")
    .get(context.agencyId, id) as { cnic: string } | undefined;
  if (!current) throw new DomainError("NOT_FOUND", "Customer not found.", 404);
  const raw = rawInput as Record<string, unknown>;
  const input = parseCreateCustomerInput({ ...raw, cnic: typeof raw.cnic === "string" && raw.cnic.includes("•") ? current.cnic : raw.cnic });
  const status = typeof raw.status === "string" ? raw.status.toLowerCase() : "active";
  if (!["active", "preferred", "review", "blacklisted"].includes(status)) throw new DomainError("VALIDATION_FAILED", "Choose a valid customer status.", 400, { status: "Choose a valid status." });
  return sqlite.transaction(() => {
    const duplicate = sqlite.prepare("SELECT id FROM customers WHERE agency_id=? AND cnic_normalized=? AND id<>? LIMIT 1").get(context.agencyId, input.cnicNormalized, id);
    if (duplicate) throw new DomainError("VALIDATION_FAILED", "A customer with this CNIC already exists.", 409, { cnic: "CNIC must be unique." });
    const now = new Date().toISOString();
    sqlite.prepare(`UPDATE customers SET name=?,phone_normalized=?,cnic_normalized=?,email=?,license_number=?,license_expires_at=?,status=?,version=version+1,updated_at=? WHERE agency_id=? AND id=?`)
      .run(input.name, input.phoneNormalized, input.cnicNormalized, input.email ?? null, input.licenseNumber ?? null, input.licenseExpiresAt ?? null, status, now, context.agencyId, id);
    sqlite.prepare(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(randomUUID(), context.agencyId, context.userId, "customer.updated", "customer", id, JSON.stringify({ name: input.name, status }), now);
    return getCustomerRow(context, id)!;
  })();
}
