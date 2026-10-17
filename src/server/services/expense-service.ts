import "server-only";
import { randomUUID } from "node:crypto";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { parseCreateExpenseInput } from "@/server/validation/expense";
import type { ExpenseStatus } from "@/server/validation/expense";
import { expenseStatuses } from "@/server/validation/expense";
import { listExpenseCategories } from "@/server/services/catalog-service";

export type ExpenseDto = { id:string; amount:number; category:string; description:string; status:ExpenseStatus; occurredOn:string; version:number; createdAt:string; updatedAt:string; vehicleId:string|null; plate:string|null; bookingId:string|null; customerId:string|null; customer:string|null; ownerId:string|null; owner:string|null; receipt:boolean };
export type ExpenseOption = { id:string; label:string };
export type ExpenseBookingOption = ExpenseOption & { vehicleId:string|null; customerId:string };
export type ExpenseWorkspaceData = { expenses:ExpenseDto[]; vehicles:ExpenseOption[]; bookings:ExpenseBookingOption[]; customers:ExpenseOption[]; owners:ExpenseOption[]; categories:ExpenseOption[] };

const selectExpense = `SELECT e.id, e.amount, e.category, e.description, e.status, e.occurred_on AS occurredOn, e.version, e.created_at AS createdAt, e.updated_at AS updatedAt, e.vehicle_id AS vehicleId, v.plate, e.booking_id AS bookingId, e.customer_id AS customerId, c.name AS customer, e.owner_id AS ownerId, o.name AS owner, EXISTS(SELECT 1 FROM private_files pf WHERE pf.agency_id=e.agency_id AND pf.entity_type='expense' AND pf.entity_id=e.id AND pf.status='ready') AS receipt FROM expenses e LEFT JOIN vehicles v ON v.id=e.vehicle_id AND v.agency_id=e.agency_id LEFT JOIN customers c ON c.id=e.customer_id AND c.agency_id=e.agency_id LEFT JOIN owners o ON o.id=e.owner_id AND o.agency_id=e.agency_id`;

export async function listExpenses(context: RequestContext) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  return (await queryAll<ExpenseDto & {receipt:number|boolean}>(`${selectExpense} WHERE e.agency_id=? ORDER BY e.occurred_on DESC, e.created_at DESC`,[context.agencyId])).map(row=>({...row,receipt:Boolean(row.receipt)}));
}

export async function getExpenseWorkspace(context: RequestContext): Promise<ExpenseWorkspaceData> {
  const [expenses,vehicles,bookings,customers,owners,catalogs] = await Promise.all([
    listExpenses(context),
    queryAll<ExpenseOption>(`SELECT id, make || ' ' || model || ' · ' || plate AS label FROM vehicles WHERE agency_id=? AND archived_at IS NULL ORDER BY make,model,plate`,[context.agencyId]),
    queryAll<ExpenseBookingOption>(`SELECT b.id, b.id || ' · ' || c.name || ' · ' || coalesce(b.external_vehicle_plate,v.plate) AS label, b.vehicle_id AS vehicleId, b.customer_id AS customerId FROM bookings b JOIN customers c ON c.id=b.customer_id AND c.agency_id=b.agency_id LEFT JOIN vehicles v ON v.id=b.vehicle_id AND v.agency_id=b.agency_id WHERE b.agency_id=? ORDER BY b.created_at DESC LIMIT 100`,[context.agencyId]),
    queryAll<ExpenseOption>(`SELECT id,name || ' · ' || phone_normalized AS label FROM customers WHERE agency_id=? AND archived_at IS NULL ORDER BY name`,[context.agencyId]),
    queryAll<ExpenseOption>(`SELECT id,name AS label FROM owners WHERE agency_id=? AND status='active' ORDER BY name`,[context.agencyId]),
    listExpenseCategories(context),
  ]);
  const categories = catalogs.map(item => ({ id: item.id, label: item.name }));
  return { expenses, vehicles, bookings, customers, owners, categories };
}

export async function createExpense(context: RequestContext, rawInput: unknown) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const input = parseCreateExpenseInput(rawInput);
  return inTransaction(async () => {
    let vehicleId = input.vehicleId;
    let customerId = input.customerId;
    if (input.bookingId) {
      const booking = await queryOne<{vehicleId:string|null;customerId:string}>(`SELECT vehicle_id AS vehicleId,customer_id AS customerId FROM bookings WHERE agency_id=? AND id=? LIMIT 1`,[context.agencyId,input.bookingId]);
      if (!booking) throw new DomainError("VALIDATION_FAILED", "The selected booking does not exist.", 400, { bookingId: "Select a valid booking." });
      if (vehicleId && vehicleId !== booking.vehicleId) throw new DomainError("VALIDATION_FAILED", "The selected booking belongs to a different vehicle.", 400, { vehicleId: "Use the booking vehicle." });
      if (customerId && customerId !== booking.customerId) throw new DomainError("VALIDATION_FAILED", "The selected booking belongs to a different customer.", 400, { customerId: "Use the booking customer." });
      vehicleId = booking.vehicleId ?? undefined;
      customerId = booking.customerId;
    }
    await assertScopedReference(context.agencyId, "vehicles", vehicleId);
    await assertScopedReference(context.agencyId, "customers", customerId);
    await assertScopedReference(context.agencyId, "owners", input.ownerId);
    const category = await queryOne<{name:string}>(`SELECT name FROM expense_categories WHERE agency_id=? AND active=1 AND lower(name)=lower(?) LIMIT 1`,[context.agencyId,input.category]);
    if (!category) throw new DomainError("VALIDATION_FAILED", "Choose an active expense category.", 400, { category: "Select a saved category." });
    const id = `EXP-${randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    await execute(`INSERT INTO expenses (id,agency_id,vehicle_id,booking_id,customer_id,owner_id,amount,category,description,status,occurred_on,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'submitted',?,1,?,?)`,[id, context.agencyId, vehicleId ?? null, input.bookingId ?? null, customerId ?? null, input.ownerId ?? null, input.amount, category.name, input.description, input.occurredOn, now, now]);
    await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,[randomUUID(), context.agencyId, context.userId, "expense.submitted", "expense", id, JSON.stringify({ amount: input.amount, category: category.name, vehicleId, customerId, bookingId: input.bookingId }), now]);
    const row=(await queryOne<ExpenseDto&{receipt:number|boolean}>(`${selectExpense} WHERE e.agency_id=? AND e.id=?`,[context.agencyId, id]))!;return {...row,receipt:Boolean(row.receipt)};
  });
}

const transitions: Record<ExpenseStatus, ExpenseStatus[]> = {
  draft: ["submitted"], submitted: ["approved", "rejected"], approved: ["reversed"], rejected: ["draft"], reversed: [],
};

export async function transitionExpense(context: RequestContext, id: string, nextStatus: ExpenseStatus): Promise<ExpenseDto> {
  requireRole(context, ["agency_owner", "fleet_manager", "accountant"]);
  if (!expenseStatuses.includes(nextStatus)) throw new DomainError("VALIDATION_FAILED", "Choose a valid expense status.", 400);
  return inTransaction(async () => {
    const current = await queryOne<{status:ExpenseStatus}>(`SELECT status FROM expenses WHERE agency_id=? AND id=?`,[context.agencyId,id]);
    if (!current) throw new DomainError("NOT_FOUND", "Expense not found.", 404);
    if (!transitions[current.status]?.includes(nextStatus)) throw new DomainError("INVALID_STATUS_TRANSITION", `Expense cannot move from ${current.status} to ${nextStatus}.`, 409);
    const now = new Date().toISOString();
    await execute(`UPDATE expenses SET status=?,version=version+1,updated_at=? WHERE agency_id=? AND id=?`,[nextStatus,now,context.agencyId,id]);
    await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,[randomUUID(),context.agencyId,context.userId,`expense.${nextStatus}`,"expense",id,JSON.stringify({from:current.status,to:nextStatus}),now]);
    const row=(await queryOne<ExpenseDto&{receipt:number|boolean}>(`${selectExpense} WHERE e.agency_id=? AND e.id=?`,[context.agencyId,id]))!;return {...row,receipt:Boolean(row.receipt)};
  });
}

async function assertScopedReference(agencyId: string, table: "vehicles" | "customers" | "owners", id?: string) {
  if (!id) return;
  const row = await queryOne(`SELECT id FROM ${table} WHERE agency_id=? AND id=? LIMIT 1`,[agencyId, id]);
  if (!row) throw new DomainError("VALIDATION_FAILED", `The selected ${table.slice(0, -1)} does not exist.`, 400, { [`${table.slice(0, -1)}Id`]: "Select a valid record." });
}
