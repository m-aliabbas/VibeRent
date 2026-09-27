import "server-only";
import { randomUUID } from "node:crypto";
import { sqlite } from "@/db/connection";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { parseCreateExpenseInput } from "@/server/validation/expense";

const selectExpense = `SELECT e.id, e.amount, e.category, e.description, e.status, e.occurred_on AS occurredOn, e.version, e.created_at AS createdAt, e.updated_at AS updatedAt, e.vehicle_id AS vehicleId, v.plate, e.booking_id AS bookingId, e.owner_id AS ownerId, o.name AS owner FROM expenses e LEFT JOIN vehicles v ON v.id=e.vehicle_id AND v.agency_id=e.agency_id LEFT JOIN owners o ON o.id=e.owner_id AND o.agency_id=e.agency_id`;

export function listExpenses(context: RequestContext) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  return sqlite.prepare(`${selectExpense} WHERE e.agency_id=? ORDER BY e.occurred_on DESC, e.created_at DESC`).all(context.agencyId);
}

export function createExpense(context: RequestContext, rawInput: unknown) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const input = parseCreateExpenseInput(rawInput);
  return sqlite.transaction(() => {
    assertScopedReference(context.agencyId, "vehicles", input.vehicleId);
    assertScopedReference(context.agencyId, "bookings", input.bookingId);
    assertScopedReference(context.agencyId, "owners", input.ownerId);
    const id = `EXP-${randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    sqlite.prepare(`INSERT INTO expenses (id,agency_id,vehicle_id,booking_id,owner_id,amount,category,description,status,occurred_on,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'submitted',?,1,?,?)`).run(id, context.agencyId, input.vehicleId ?? null, input.bookingId ?? null, input.ownerId ?? null, input.amount, input.category, input.description, input.occurredOn, now, now);
    sqlite.prepare(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(), context.agencyId, context.userId, "expense.submitted", "expense", id, JSON.stringify({ amount: input.amount, category: input.category }), now);
    return sqlite.prepare(`${selectExpense} WHERE e.agency_id=? AND e.id=?`).get(context.agencyId, id);
  })();
}

function assertScopedReference(agencyId: string, table: "vehicles" | "bookings" | "owners", id?: string) {
  if (!id) return;
  const row = sqlite.prepare(`SELECT id FROM ${table} WHERE agency_id=? AND id=? LIMIT 1`).get(agencyId, id);
  if (!row) throw new DomainError("VALIDATION_FAILED", `The selected ${table.slice(0, -1)} does not exist.`, 400, { [`${table.slice(0, -1)}Id`]: "Select a valid record." });
}
