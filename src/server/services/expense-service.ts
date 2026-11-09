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
import type { AccountExpense } from "@/lib/reports/account-summary";
import { listRecurringExpenses, postDueRecurringExpenses, type RecurringExpenseDto } from "@/server/services/recurring-expense-service";

export type ExpenseDto = { id:string; amount:number; category:string; description:string; status:ExpenseStatus; occurredOn:string; version:number; createdAt:string; updatedAt:string; vehicleId:string|null; plate:string|null; bookingId:string|null; customerId:string|null; customer:string|null; ownerId:string|null; owner:string|null; receipt:boolean; recurringExpenseId:string|null; recovered:number; recoveries:ExpenseRecoveryDto[] };
export type ExpenseRecoverySource = "customer"|"driver"|"owner"|"insurance"|"vendor"|"other";
export const expenseRecoverySources: ExpenseRecoverySource[] = ["customer","driver","owner","insurance","vendor","other"];
export type ExpenseRecoveryDto = { id:string; expenseId:string; amount:number; receivedOn:string; source:ExpenseRecoverySource; method:string; reference:string; note:string|null; status:"posted"|"reversed"; createdAt:string };
export type ExpenseSaveResult = ExpenseDto & {replacesExpenseId?:string};
export type ExpenseOption = { id:string; label:string };
export type ExpenseBookingOption = ExpenseOption & { vehicleId:string|null; customerId:string };
export type ExpenseWorkspaceData = { expenses:ExpenseDto[]; vehicles:ExpenseOption[]; bookings:ExpenseBookingOption[]; customers:ExpenseOption[]; owners:ExpenseOption[]; categories:ExpenseOption[]; recurring:RecurringExpenseDto[] };

const selectExpense = `SELECT e.id, e.amount, e.category, e.description, e.status, e.occurred_on AS occurredOn, e.version, e.created_at AS createdAt, e.updated_at AS updatedAt, e.vehicle_id AS vehicleId, v.plate, e.booking_id AS bookingId, e.customer_id AS customerId, c.name AS customer, e.owner_id AS ownerId, o.name AS owner, e.recurring_expense_id AS recurringExpenseId, coalesce((SELECT sum(r.amount) FROM expense_recoveries r WHERE r.agency_id=e.agency_id AND r.expense_id=e.id AND r.status='posted'),0) AS recovered, EXISTS(SELECT 1 FROM private_files pf WHERE pf.agency_id=e.agency_id AND pf.entity_type='expense' AND pf.entity_id=e.id AND pf.status='ready') AS receipt FROM expenses e LEFT JOIN vehicles v ON v.id=e.vehicle_id AND v.agency_id=e.agency_id LEFT JOIN customers c ON c.id=e.customer_id AND c.agency_id=e.agency_id LEFT JOIN owners o ON o.id=e.owner_id AND o.agency_id=e.agency_id`;

export async function listExpenses(context: RequestContext) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  return hydrate(context.agencyId, await queryAll<RawExpense>(`${selectExpense} WHERE e.agency_id=? ORDER BY e.occurred_on DESC, e.created_at DESC`,[context.agencyId]));
}

export async function getExpenseById(agencyId: string, id: string): Promise<ExpenseDto> {
  const row = await queryOne<RawExpense>(`${selectExpense} WHERE e.agency_id=? AND e.id=?`, [agencyId, id]);
  if (!row) throw new DomainError("NOT_FOUND", "Expense not found.", 404);
  return (await hydrate(agencyId, [row]))[0];
}

export async function getExpenseWorkspace(context: RequestContext): Promise<ExpenseWorkspaceData> {
  await postDueRecurringExpenses(context.agencyId);
  const [expenses,vehicles,bookings,customers,owners,catalogs] = await Promise.all([
    listExpenses(context),
    queryAll<ExpenseOption>(`SELECT id, make || ' ' || model || ' · ' || plate AS label FROM vehicles WHERE agency_id=? AND archived_at IS NULL ORDER BY make,model,plate`,[context.agencyId]),
    queryAll<ExpenseBookingOption>(`SELECT b.id, b.id || ' · ' || c.name || ' · ' || coalesce(b.external_vehicle_plate,v.plate) AS label, b.vehicle_id AS vehicleId, b.customer_id AS customerId FROM bookings b JOIN customers c ON c.id=b.customer_id AND c.agency_id=b.agency_id LEFT JOIN vehicles v ON v.id=b.vehicle_id AND v.agency_id=b.agency_id WHERE b.agency_id=? ORDER BY b.created_at DESC LIMIT 100`,[context.agencyId]),
    queryAll<ExpenseOption>(`SELECT id,name || ' · ' || phone_normalized AS label FROM customers WHERE agency_id=? AND archived_at IS NULL ORDER BY name`,[context.agencyId]),
    queryAll<ExpenseOption>(`SELECT id,name AS label FROM owners WHERE agency_id=? AND status='active' ORDER BY name`,[context.agencyId]),
    listExpenseCategories(context),
  ]);
  const categories = catalogs.map(item => ({ id: item.id, label: item.name }));
  return { expenses, vehicles, bookings, customers, owners, categories, recurring: await listRecurringExpenses(context) };
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
    return getExpenseById(context.agencyId,id);
  });
}

export async function updateExpense(context: RequestContext, id: string, rawInput: unknown): Promise<ExpenseSaveResult> {
  requireRole(context, ["agency_owner", "fleet_manager", "accountant"]);
  const input = parseCreateExpenseInput(rawInput);
  return inTransaction(async () => {
    const current = await queryOne<{status:ExpenseStatus}>("SELECT status FROM expenses WHERE agency_id=? AND id=?", [context.agencyId, id]);
    if (!current) throw new DomainError("NOT_FOUND", "Expense not found.", 404);
    if (current.status === "reversed") throw new DomainError("INVALID_STATUS_TRANSITION", "A reversed expense cannot be edited.", 409);
    let vehicleId = input.vehicleId, customerId = input.customerId;
    if (input.bookingId) {
      const booking = await queryOne<{vehicleId:string|null;customerId:string}>("SELECT vehicle_id AS vehicleId,customer_id AS customerId FROM bookings WHERE agency_id=? AND id=? LIMIT 1", [context.agencyId,input.bookingId]);
      if (!booking) throw new DomainError("VALIDATION_FAILED", "The selected booking does not exist.", 400);
      if ((vehicleId && vehicleId !== booking.vehicleId) || (customerId && customerId !== booking.customerId)) throw new DomainError("VALIDATION_FAILED", "Vehicle or customer does not match the selected booking.", 400);
      vehicleId = booking.vehicleId ?? undefined; customerId = booking.customerId;
    }
    await assertScopedReference(context.agencyId, "vehicles", vehicleId);
    await assertScopedReference(context.agencyId, "customers", customerId);
    await assertScopedReference(context.agencyId, "owners", input.ownerId);
    const category = await queryOne<{name:string}>("SELECT name FROM expense_categories WHERE agency_id=? AND active=1 AND lower(name)=lower(?) LIMIT 1", [context.agencyId,input.category]);
    if (!category) throw new DomainError("VALIDATION_FAILED", "Choose an active expense category.", 400);
    const recovered = await postedRecoveryTotal(context.agencyId, id);
    if (input.amount < recovered) throw new DomainError("VALIDATION_FAILED", `This expense already has ${recovered.toLocaleString("en-PK")} PKR recovered. The amount cannot be lower than that.`, 400, { amount: "Amount is below the recovered total." });
    const now = new Date().toISOString();
    let savedId = id;
    if (current.status === "approved") {
      savedId = `EXP-${randomUUID().slice(0,8).toUpperCase()}`;
      await execute("UPDATE expenses SET status='reversed',version=version+1,updated_at=? WHERE agency_id=? AND id=?", [now,context.agencyId,id]);
      await execute("INSERT INTO expenses (id,agency_id,vehicle_id,booking_id,customer_id,owner_id,amount,category,description,status,occurred_on,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'submitted',?,1,?,?)", [savedId,context.agencyId,vehicleId??null,input.bookingId??null,customerId??null,input.ownerId??null,input.amount,category.name,input.description,input.occurredOn,now,now]);
      if (recovered) await execute("UPDATE expense_recoveries SET expense_id=?,updated_at=? WHERE agency_id=? AND expense_id=? AND status='posted'", [savedId,now,context.agencyId,id]);
    } else {
      await execute("UPDATE expenses SET vehicle_id=?,booking_id=?,customer_id=?,owner_id=?,amount=?,category=?,description=?,occurred_on=?,version=version+1,updated_at=? WHERE agency_id=? AND id=?", [vehicleId??null,input.bookingId??null,customerId??null,input.ownerId??null,input.amount,category.name,input.description,input.occurredOn,now,context.agencyId,id]);
    }
    await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)", [randomUUID(),context.agencyId,context.userId,current.status==="approved"?"expense.corrected":"expense.updated","expense",id,JSON.stringify({replacementId:savedId===id?undefined:savedId,amount:input.amount}),now]);
    const row = await getExpenseById(context.agencyId,savedId);
    return {...row,...(savedId!==id?{replacesExpenseId:id}:{})};
  }, {immediate:true});
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
    if (nextStatus === "reversed" && await postedRecoveryTotal(context.agencyId, id)) throw new DomainError("INVALID_STATUS_TRANSITION", "Reverse the recoveries recorded on this expense before reversing the expense.", 409);
    const now = new Date().toISOString();
    await execute(`UPDATE expenses SET status=?,version=version+1,updated_at=? WHERE agency_id=? AND id=?`,[nextStatus,now,context.agencyId,id]);
    await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,[randomUUID(),context.agencyId,context.userId,`expense.${nextStatus}`,"expense",id,JSON.stringify({from:current.status,to:nextStatus}),now]);
    return getExpenseById(context.agencyId,id);
  });
}

async function assertScopedReference(agencyId: string, table: "vehicles" | "customers" | "owners", id?: string) {
  if (!id) return;
  const row = await queryOne(`SELECT id FROM ${table} WHERE agency_id=? AND id=? LIMIT 1`,[agencyId, id]);
  if (!row) throw new DomainError("VALIDATION_FAILED", `The selected ${table.slice(0, -1)} does not exist.`, 400, { [`${table.slice(0, -1)}Id`]: "Select a valid record." });
}

type RawExpense = Omit<ExpenseDto, "receipt" | "recoveries"> & { receipt: number | boolean };

async function hydrate(agencyId: string, rows: RawExpense[]): Promise<ExpenseDto[]> {
  if (!rows.length) return [];
  const recoveries = await queryAll<ExpenseRecoveryDto>(`SELECT id,expense_id AS expenseId,amount,received_on AS receivedOn,source,method,reference,note,status,created_at AS createdAt FROM expense_recoveries WHERE agency_id=? ORDER BY received_on,created_at`, [agencyId]);
  const byExpense = new Map<string, ExpenseRecoveryDto[]>();
  for (const item of recoveries) byExpense.set(item.expenseId, [...(byExpense.get(item.expenseId) ?? []), item]);
  return rows.map(row => ({ ...row, receipt: Boolean(row.receipt), recovered: Number(row.recovered) || 0, recoveries: byExpense.get(row.id) ?? [] }));
}

async function postedRecoveryTotal(agencyId: string, expenseId: string) {
  const row = await queryOne<{ total: number | string | null }>("SELECT coalesce(sum(amount),0) AS total FROM expense_recoveries WHERE agency_id=? AND expense_id=? AND status='posted'", [agencyId, expenseId]);
  return Number(row?.total) || 0;
}

/**
 * Reconciliation: money returned to the agency against an approved expense (a customer paying for damage,
 * a driver returning unused fuel cash, an insurance claim). Partial and multiple recoveries are allowed up to
 * the expense amount; each one is dated so ledgers show it on the day the cash came back.
 */
export async function recordExpenseRecovery(context: RequestContext, expenseId: string, raw: unknown): Promise<ExpenseDto> {
  requireRole(context, ["agency_owner", "fleet_manager", "accountant"]);
  const input = (raw ?? {}) as Record<string, unknown>;
  const amount = Number(input.amount);
  const receivedOn = typeof input.receivedOn === "string" ? input.receivedOn : "";
  const source = input.source as ExpenseRecoverySource;
  const method = typeof input.method === "string" ? input.method.trim().slice(0, 40) : "";
  const reference = typeof input.reference === "string" ? input.reference.trim().slice(0, 80) : "";
  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, 240) : null;
  const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  const errors: Record<string, string> = {};
  if (!Number.isSafeInteger(amount) || amount <= 0) errors.amount = "Enter a whole PKR amount above zero.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedOn) || Number.isNaN(Date.parse(`${receivedOn}T00:00:00Z`))) errors.receivedOn = "Choose the date the money was returned.";
  if (!expenseRecoverySources.includes(source)) errors.source = "Choose who returned the money.";
  if (!method) errors.method = "Choose a payment method.";
  if (idempotencyKey.length < 8 || idempotencyKey.length > 80) errors.idempotencyKey = "Retry from the expense screen.";
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the recovery details.", 400, errors);
  return inTransaction(() => applyExpenseRecovery(context, expenseId, { amount, receivedOn, source, method, reference, note, idempotencyKey }), { immediate: true });
}

/** Posts a recovery without the role check; callers (this module, customer balance payments) authorize first. */
export async function applyExpenseRecovery(context: RequestContext, expenseId: string, input: { amount: number; receivedOn: string; source: ExpenseRecoverySource; method: string; reference: string; note: string | null; idempotencyKey: string }): Promise<ExpenseDto> {
  const { amount, receivedOn, source, method, reference, note, idempotencyKey } = input;
  {
    const existing = await queryOne<{ id: string }>("SELECT id FROM expense_recoveries WHERE agency_id=? AND idempotency_key=? LIMIT 1", [context.agencyId, idempotencyKey]);
    if (existing) return getExpenseById(context.agencyId, expenseId);
    const expense = await queryOne<{ amount: number; status: ExpenseStatus; occurredOn: string }>("SELECT amount,status,occurred_on AS occurredOn FROM expenses WHERE agency_id=? AND id=? LIMIT 1", [context.agencyId, expenseId]);
    if (!expense) throw new DomainError("NOT_FOUND", "Expense not found.", 404);
    if (expense.status !== "approved") throw new DomainError("INVALID_STATUS_TRANSITION", "Only approved expenses can be reconciled.", 409);
    if (receivedOn < expense.occurredOn.slice(0, 10)) throw new DomainError("VALIDATION_FAILED", "The return date cannot be before the expense date.", 400, { receivedOn: "Use a date on or after the expense." });
    const recovered = await postedRecoveryTotal(context.agencyId, expenseId);
    const remaining = expense.amount - recovered;
    if (amount > remaining) throw new DomainError("VALIDATION_FAILED", `Only ${remaining.toLocaleString("en-PK")} PKR of this expense is still unrecovered.`, 400, { amount: "Amount is more than the unrecovered balance." });
    const id = `REC-${randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    await execute("INSERT INTO expense_recoveries (id,agency_id,expense_id,amount,received_on,source,method,reference,note,idempotency_key,status,actor_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'posted',?,?,?)", [id, context.agencyId, expenseId, amount, receivedOn, source, method, reference, note, idempotencyKey, context.userId, now, now]);
    await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)", [randomUUID(), context.agencyId, context.userId, "expense.recovery_posted", "expense", expenseId, JSON.stringify({ recoveryId: id, amount, source }), now]);
    return getExpenseById(context.agencyId, expenseId);
  }
}

export async function reverseExpenseRecovery(context: RequestContext, expenseId: string, recoveryId: string): Promise<ExpenseDto> {
  requireRole(context, ["agency_owner", "fleet_manager", "accountant"]);
  return inTransaction(async () => {
    const row = await queryOne<{ amount: number; status: string }>("SELECT amount,status FROM expense_recoveries WHERE agency_id=? AND expense_id=? AND id=? LIMIT 1", [context.agencyId, expenseId, recoveryId]);
    if (!row) throw new DomainError("NOT_FOUND", "Recovery not found.", 404);
    if (row.status !== "posted") throw new DomainError("INVALID_STATUS_TRANSITION", "This recovery is already reversed.", 409);
    const now = new Date().toISOString();
    await execute("UPDATE expense_recoveries SET status='reversed',reversed_at=?,updated_at=? WHERE agency_id=? AND id=?", [now, now, context.agencyId, recoveryId]);
    await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)", [randomUUID(), context.agencyId, context.userId, "expense.recovery_reversed", "expense", expenseId, JSON.stringify({ recoveryId, amount: row.amount }), now]);
    return getExpenseById(context.agencyId, expenseId);
  }, { immediate: true });
}

/** Approved expenses charged to a customer, or incurred on bookings a driver drove, with recovered totals. */
export async function listAccountExpenses(agencyId: string, account: { customerId: string } | { driverId: string }): Promise<AccountExpense[]> {
  const where = "customerId" in account
    ? "e.customer_id=?"
    : "e.booking_id IN (SELECT b.id FROM bookings b WHERE b.agency_id=e.agency_id AND b.driver_id=?)";
  const rows = await queryAll<AccountExpense & { recovered: number | string }>(`SELECT e.id, e.occurred_on AS date, e.category AS head, e.description, v.plate, e.booking_id AS bookingId, e.amount,
      coalesce((SELECT sum(r.amount) FROM expense_recoveries r WHERE r.agency_id=e.agency_id AND r.expense_id=e.id AND r.status='posted'),0) AS recovered
    FROM expenses e LEFT JOIN vehicles v ON v.id=e.vehicle_id AND v.agency_id=e.agency_id
    WHERE e.agency_id=? AND e.status='approved' AND ${where} ORDER BY e.occurred_on, e.id`, [agencyId, "customerId" in account ? account.customerId : account.driverId]);
  return rows.map(row => ({ ...row, date: row.date.slice(0, 10), recovered: Number(row.recovered) || 0 }));
}
