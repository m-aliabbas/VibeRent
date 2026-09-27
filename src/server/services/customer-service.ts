import "server-only";
import { randomUUID } from "node:crypto";
import { sqlite } from "@/db/connection";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { parseCreateCustomerInput } from "@/server/validation/customer";

type CustomerDto = { id: string; name: string; phone: string; cnic: string; email: string | null; licenseNumber: string | null; licenseExpiresAt: string | null; status: string; version: number; updatedAt: string };

function getCustomerRow(context: RequestContext, id: string) {
  return sqlite.prepare(`SELECT id, name, phone_normalized AS phone, substr(cnic_normalized,1,5) || '-•••••••-' || substr(cnic_normalized,-1) AS cnic, email, license_number AS licenseNumber, license_expires_at AS licenseExpiresAt, status, version, updated_at AS updatedAt FROM customers WHERE agency_id=? AND id=? AND archived_at IS NULL LIMIT 1`).get(context.agencyId, id) as CustomerDto | undefined;
}

export function listCustomers(context: RequestContext) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  return sqlite.prepare(`SELECT id, name, phone_normalized AS phone, substr(cnic_normalized,1,5) || '-•••••••-' || substr(cnic_normalized,-1) AS cnic, email, license_number AS licenseNumber, license_expires_at AS licenseExpiresAt, status, version, updated_at AS updatedAt FROM customers WHERE agency_id=? AND archived_at IS NULL ORDER BY name`).all(context.agencyId) as CustomerDto[];
}

export function getCustomer(context: RequestContext, id: string) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const customer = getCustomerRow(context, id);
  if (!customer) throw new DomainError("NOT_FOUND", "Customer not found.", 404);
  return customer;
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
