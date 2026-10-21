import "server-only";
import { randomUUID } from "node:crypto";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { getExpenseById, type ExpenseDto } from "@/server/services/expense-service";
import { nextOccurrenceOnOrAfter, occurrenceAfter, todayInPakistan, type RecurringFrequency } from "@/lib/recurring-schedule";

export type RecurringExpenseStatus = "active" | "paused" | "ended";

export type RecurringExpenseDto = {
  id: string;
  vehicleId: string | null;
  plate: string | null;
  ownerId: string | null;
  owner: string | null;
  amount: number;
  category: string;
  description: string;
  frequency: RecurringFrequency;
  dayOfMonth: number;
  startOn: string;
  endOn: string | null;
  nextDueOn: string;
  autoApprove: boolean;
  status: RecurringExpenseStatus;
  postedCount: number;
  lastPostedOn: string | null;
  version: number;
};

export type CreateRecurringExpenseInput = {
  vehicleId?: string;
  ownerId?: string;
  amount: number;
  category: string;
  description: string;
  startOn: string;
  frequency: RecurringFrequency;
  endOn?: string;
  autoApprove?: boolean;
};

export type UpdateRecurringExpenseInput = {
  amount: number;
  category: string;
  description: string;
  endOn?: string | null;
  autoApprove: boolean;
  version: number;
};

const manageRoles = ["agency_owner", "fleet_manager", "accountant"] as const;
const frequencies: RecurringFrequency[] = ["monthly", "quarterly", "yearly"];
/** Upper bound of catch-up postings per template per run, e.g. after the app was offline for a long time. */
const maxCatchUp = 36;

const selectRecurring = `SELECT r.id, r.vehicle_id AS vehicleId, v.plate, r.owner_id AS ownerId, o.name AS owner, r.amount, r.category, r.description,
    r.frequency, r.day_of_month AS dayOfMonth, r.start_on AS startOn, r.end_on AS endOn, r.next_due_on AS nextDueOn, r.auto_approve AS autoApprove,
    r.status, r.version,
    (SELECT count(*) FROM expenses e WHERE e.agency_id=r.agency_id AND e.recurring_expense_id=r.id) AS postedCount,
    (SELECT max(e.occurred_on) FROM expenses e WHERE e.agency_id=r.agency_id AND e.recurring_expense_id=r.id) AS lastPostedOn
  FROM recurring_expenses r
  LEFT JOIN vehicles v ON v.id=r.vehicle_id AND v.agency_id=r.agency_id
  LEFT JOIN owners o ON o.id=r.owner_id AND o.agency_id=r.agency_id`;

type RecurringRow = Omit<RecurringExpenseDto, "autoApprove"> & { autoApprove: number | boolean };
const mapRow = (row: RecurringRow): RecurringExpenseDto => ({ ...row, autoApprove: Boolean(row.autoApprove) });

function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

async function audit(agencyId: string, actorId: string, action: string, entityId: string, metadata: unknown, now: string) {
  await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",
    [randomUUID(), agencyId, actorId, action, "recurring_expense", entityId, JSON.stringify(metadata), now]);
}

async function activeCategory(agencyId: string, name: string) {
  const category = await queryOne<{ name: string }>("SELECT name FROM expense_categories WHERE agency_id=? AND active=1 AND lower(name)=lower(?) LIMIT 1", [agencyId, name]);
  if (!category) throw new DomainError("VALIDATION_FAILED", "Choose an active expense category.", 400, { category: "Select a saved category." });
  return category.name;
}

async function getRecurring(agencyId: string, id: string) {
  const row = await queryOne<RecurringRow>(`${selectRecurring} WHERE r.agency_id=? AND r.id=? LIMIT 1`, [agencyId, id]);
  if (!row) throw new DomainError("NOT_FOUND", "Recurring expense not found.", 404);
  return mapRow(row);
}

export async function listRecurringExpenses(context: RequestContext): Promise<RecurringExpenseDto[]> {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  return (await queryAll<RecurringRow>(`${selectRecurring} WHERE r.agency_id=? ORDER BY CASE r.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, r.next_due_on, r.description`,
    [context.agencyId])).map(mapRow);
}

/**
 * Posts every occurrence that has fallen due (up to today in Pakistan time) as a normal expense.
 * Safe to call repeatedly: each period can exist only once per template (unique index), and the
 * template's next due date only moves forward inside the same transaction.
 */
export async function postDueRecurringExpenses(agencyId: string, onlyId?: string): Promise<string[]> {
  const today = todayInPakistan();
  const due = await queryAll<{ id: string }>(`SELECT id FROM recurring_expenses WHERE agency_id=? AND status='active' AND next_due_on<=?${onlyId ? " AND id=?" : ""}`,
    onlyId ? [agencyId, today, onlyId] : [agencyId, today]);
  const posted: string[] = [];
  for (const { id } of due) {
    await inTransaction(async () => {
      const template = await queryOne<{ id: string; vehicleId: string | null; ownerId: string | null; amount: number; category: string; description: string; frequency: RecurringFrequency; dayOfMonth: number; startOn: string; endOn: string | null; nextDueOn: string; autoApprove: number; actorId: string }>(`SELECT id, vehicle_id AS vehicleId, owner_id AS ownerId, amount, category, description, frequency, day_of_month AS dayOfMonth,
          start_on AS startOn, end_on AS endOn, next_due_on AS nextDueOn, auto_approve AS autoApprove, actor_id AS actorId
        FROM recurring_expenses WHERE agency_id=? AND id=? AND status='active' LIMIT 1 /*postgres:for-update*/`, [agencyId, id]);
      if (!template) return;
      const now = new Date().toISOString();
      let nextDueOn = template.nextDueOn;
      let ended = false;
      for (let count = 0; nextDueOn <= today && count < maxCatchUp; count += 1) {
        if (template.endOn && nextDueOn > template.endOn) { ended = true; break; }
        const expenseId = `EXP-${randomUUID().slice(0, 8).toUpperCase()}`;
        const status = template.autoApprove ? "approved" : "submitted";
        const inserted = await execute(`INSERT OR IGNORE INTO expenses (id,agency_id,vehicle_id,owner_id,amount,category,description,status,occurred_on,recurring_expense_id,version,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)`,
          [expenseId, agencyId, template.vehicleId, template.ownerId, template.amount, template.category, template.description, status, nextDueOn, template.id, now, now]);
        if (inserted.changes) {
          posted.push(expenseId);
          await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",
            [randomUUID(), agencyId, template.actorId, `expense.${status}`, "expense", expenseId, JSON.stringify({ amount: template.amount, category: template.category, vehicleId: template.vehicleId, ownerId: template.ownerId, recurringExpenseId: template.id, period: nextDueOn, source: "recurring" }), now]);
        }
        nextDueOn = occurrenceAfter(template.startOn, template.frequency, template.dayOfMonth, nextDueOn);
      }
      if (template.endOn && nextDueOn > template.endOn) ended = true;
      await execute(`UPDATE recurring_expenses SET next_due_on=?,status=CASE WHEN ?=1 THEN 'ended' ELSE status END,updated_at=? WHERE agency_id=? AND id=?`,
        [nextDueOn, ended ? 1 : 0, now, agencyId, template.id]);
    }, { immediate: true });
  }
  return posted;
}

function parseCreateInput(value: unknown): CreateRecurringExpenseInput {
  const input = value as Partial<CreateRecurringExpenseInput> | null;
  if (!input || typeof input !== "object") throw new DomainError("VALIDATION_FAILED", "Invalid recurring expense payload.", 400);
  const errors: Record<string, string> = {};
  if (!Number.isInteger(input.amount) || input.amount! <= 0) errors.amount = "Amount must be a positive whole PKR value.";
  if (!input.category?.trim()) errors.category = "Category is required.";
  if (!input.description?.trim()) errors.description = "Description is required.";
  if (!isDate(input.startOn)) errors.occurredOn = "Use a valid first date.";
  if (!frequencies.includes(input.frequency as RecurringFrequency)) errors.frequency = "Choose how often it repeats.";
  if (input.endOn !== undefined && input.endOn !== "" && (!isDate(input.endOn) || (isDate(input.startOn) && input.endOn < input.startOn))) errors.endOn = "The end date must be on or after the first date.";
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the recurring expense.", 400, errors);
  return {
    vehicleId: input.vehicleId?.trim() || undefined,
    ownerId: input.ownerId?.trim() || undefined,
    amount: input.amount!, category: input.category!.trim(), description: input.description!.trim(),
    startOn: input.startOn!, frequency: input.frequency!, endOn: input.endOn || undefined, autoApprove: input.autoApprove !== false,
  };
}

export async function createRecurringExpense(context: RequestContext, rawInput: unknown): Promise<{ recurring: RecurringExpenseDto; posted: ExpenseDto[] }> {
  requireRole(context, [...manageRoles]);
  const input = parseCreateInput(rawInput);
  const id = `REC-${randomUUID().slice(0, 8).toUpperCase()}`;
  await inTransaction(async () => {
    if (input.vehicleId && !await queryOne("SELECT id FROM vehicles WHERE agency_id=? AND id=? AND archived_at IS NULL", [context.agencyId, input.vehicleId])) throw new DomainError("VALIDATION_FAILED", "Select an active vehicle.", 400, { vehicleId: "Select an active vehicle." });
    if (input.ownerId && !await queryOne("SELECT id FROM owners WHERE agency_id=? AND id=?", [context.agencyId, input.ownerId])) throw new DomainError("VALIDATION_FAILED", "Select a valid owner.", 400, { ownerId: "Select a valid owner." });
    const category = await activeCategory(context.agencyId, input.category);
    const dayOfMonth = Number(input.startOn.slice(8, 10));
    const now = new Date().toISOString();
    await execute(`INSERT INTO recurring_expenses (id,agency_id,vehicle_id,owner_id,amount,category,description,frequency,day_of_month,start_on,end_on,next_due_on,auto_approve,status,actor_id,version,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,1,?,?)`,
      [id, context.agencyId, input.vehicleId ?? null, input.ownerId ?? null, input.amount, category, input.description, input.frequency, dayOfMonth, input.startOn, input.endOn ?? null, input.startOn, input.autoApprove ? 1 : 0, context.userId, now, now]);
    await audit(context.agencyId, context.userId, "recurring_expense.created", id, { amount: input.amount, category, frequency: input.frequency, startOn: input.startOn, endOn: input.endOn, vehicleId: input.vehicleId, ownerId: input.ownerId, autoApprove: input.autoApprove }, now);
  }, { immediate: true });
  const posted = await Promise.all((await postDueRecurringExpenses(context.agencyId, id)).map(expenseId => getExpenseById(context.agencyId, expenseId)));
  return { recurring: await getRecurring(context.agencyId, id), posted };
}

export async function updateRecurringExpense(context: RequestContext, id: string, rawInput: unknown): Promise<RecurringExpenseDto> {
  requireRole(context, [...manageRoles]);
  const input = rawInput as Partial<UpdateRecurringExpenseInput> | null;
  const errors: Record<string, string> = {};
  if (!input || typeof input !== "object") throw new DomainError("VALIDATION_FAILED", "Invalid recurring expense payload.", 400);
  if (!Number.isInteger(input.amount) || input.amount! <= 0) errors.amount = "Amount must be a positive whole PKR value.";
  if (!input.description?.trim()) errors.description = "Description is required.";
  if (!input.category?.trim()) errors.category = "Category is required.";
  if (input.endOn && !isDate(input.endOn)) errors.endOn = "Use a valid end date.";
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the recurring expense.", 400, errors);
  await inTransaction(async () => {
    await queryOne("SELECT id FROM recurring_expenses WHERE agency_id=? AND id=? /*postgres:for-update*/", [context.agencyId, id]);
    const current = await getRecurring(context.agencyId, id);
    if (current.status === "ended") throw new DomainError("INVALID_STATUS_TRANSITION", "An ended recurring expense cannot be edited.", 409);
    if (typeof input.version === "number" && input.version !== current.version) throw new DomainError("VERSION_CONFLICT", "This recurring expense changed since it was loaded.", 409);
    if (input.endOn && input.endOn < (current.lastPostedOn ?? current.startOn)) throw new DomainError("VALIDATION_FAILED", "The end date cannot be before the last posted charge.", 400, { endOn: `Choose ${current.lastPostedOn ?? current.startOn} or later.` });
    const category = await activeCategory(context.agencyId, input.category!);
    const now = new Date().toISOString();
    const endOn = input.endOn || null;
    const ended = endOn !== null && current.nextDueOn > endOn;
    await execute("UPDATE recurring_expenses SET amount=?,category=?,description=?,end_on=?,auto_approve=?,status=CASE WHEN ?=1 THEN 'ended' ELSE status END,version=version+1,updated_at=? WHERE agency_id=? AND id=?",
      [input.amount, category, input.description!.trim(), endOn, input.autoApprove ? 1 : 0, ended ? 1 : 0, now, context.agencyId, id]);
    await audit(context.agencyId, context.userId, "recurring_expense.updated", id, { from: { amount: current.amount, category: current.category, endOn: current.endOn, autoApprove: current.autoApprove }, to: { amount: input.amount, category, endOn, autoApprove: Boolean(input.autoApprove) } }, now);
  }, { immediate: true });
  return getRecurring(context.agencyId, id);
}

export async function setRecurringExpenseStatus(context: RequestContext, id: string, next: unknown): Promise<{ recurring: RecurringExpenseDto; posted: ExpenseDto[] }> {
  requireRole(context, [...manageRoles]);
  if (next !== "active" && next !== "paused" && next !== "ended") throw new DomainError("VALIDATION_FAILED", "Choose a valid status.", 400);
  await inTransaction(async () => {
    await queryOne("SELECT id FROM recurring_expenses WHERE agency_id=? AND id=? /*postgres:for-update*/", [context.agencyId, id]);
    const current = await getRecurring(context.agencyId, id);
    if (current.status === "ended") throw new DomainError("INVALID_STATUS_TRANSITION", "An ended recurring expense cannot be changed. Create a new one instead.", 409);
    if (current.status === next) return;
    const now = new Date().toISOString();
    if (next === "active") {
      // Resuming skips the paused periods: the next charge is the first occurrence from today.
      const nextDueOn = nextOccurrenceOnOrAfter(current.startOn, current.frequency, current.dayOfMonth, todayInPakistan() > current.nextDueOn ? todayInPakistan() : current.nextDueOn);
      const ended = current.endOn !== null && nextDueOn > current.endOn;
      await execute("UPDATE recurring_expenses SET status=?,next_due_on=?,version=version+1,updated_at=? WHERE agency_id=? AND id=?", [ended ? "ended" : "active", nextDueOn, now, context.agencyId, id]);
    } else {
      await execute("UPDATE recurring_expenses SET status=?,end_on=CASE WHEN ?='ended' THEN coalesce(end_on,?) ELSE end_on END,version=version+1,updated_at=? WHERE agency_id=? AND id=?",
        [next, next, todayInPakistan(), now, context.agencyId, id]);
    }
    await audit(context.agencyId, context.userId, `recurring_expense.${next === "active" ? "resumed" : next}`, id, { from: current.status }, now);
  }, { immediate: true });
  const posted = next === "active" ? await Promise.all((await postDueRecurringExpenses(context.agencyId, id)).map(expenseId => getExpenseById(context.agencyId, expenseId))) : [];
  return { recurring: await getRecurring(context.agencyId, id), posted };
}

type SchedulerState = { running: boolean; timer?: NodeJS.Timeout; lastError?: string };
const globalState = globalThis as typeof globalThis & { __viberentRecurringExpenses?: SchedulerState };
const schedulerState = globalState.__viberentRecurringExpenses ??= { running: false };

export async function runRecurringExpensePosting() {
  const agencies = await queryAll<{ agencyId: string }>("SELECT DISTINCT agency_id AS agencyId FROM recurring_expenses WHERE status='active' AND next_due_on<=?", [todayInPakistan()]);
  for (const { agencyId } of agencies) {
    try { await postDueRecurringExpenses(agencyId); }
    catch (error) {
      schedulerState.lastError = error instanceof Error ? error.message : "Recurring expense posting failed";
      console.error(JSON.stringify({ event: "recurring_expense.post_failed", agencyId, message: schedulerState.lastError }));
    }
  }
}

/** Posts due charges at startup and then hourly, so reports stay current even if nobody opens Expenses. */
export function startRecurringExpenseScheduler() {
  if (schedulerState.running) return;
  schedulerState.running = true;
  const tick = () => { void runRecurringExpensePosting().catch(error => console.error(JSON.stringify({ event: "recurring_expense.scheduler_failed", message: error instanceof Error ? error.message : String(error) }))); };
  tick();
  schedulerState.timer = setInterval(tick, 60 * 60 * 1000);
  schedulerState.timer.unref();
}
