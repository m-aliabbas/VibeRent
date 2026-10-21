import "server-only";
import { randomUUID } from "node:crypto";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { listExpenseCategories } from "@/server/services/catalog-service";
import { createExpense } from "@/server/services/expense-service";
import { getLastVehicleOdometer } from "@/server/services/booking-service";
import { summarizeOilChange, type OilChangeSummary } from "@/lib/oil-change";

export type OilChangeRecordDto = {
  id: string;
  servicedOn: string;
  odometer: number;
  cost: number;
  workshop: string;
  notes: string;
  expenseId: string | null;
  recordedBy: string | null;
  createdAt: string;
};

export type OilChangeOverview = OilChangeSummary & { vehicleId: string; history: OilChangeRecordDto[] };

export type RecordOilChangeInput = {
  servicedOn: string;
  odometer: number;
  cost: number;
  workshop: string;
  notes?: string;
  addExpense?: boolean;
};

const viewRoles = ["agency_owner", "fleet_manager", "rental_agent", "accountant"] as const;
const recordRoles = ["agency_owner", "fleet_manager", "rental_agent"] as const;
const manageRoles = ["agency_owner", "fleet_manager"] as const;

async function requireVehicle(agencyId: string, vehicleId: string) {
  const vehicle = await queryOne<{ id: string; plate: string; intervalKm: number; archivedAt: string | null }>("SELECT id, plate, oil_change_interval_km AS intervalKm, archived_at AS archivedAt FROM vehicles WHERE agency_id=? AND id=? LIMIT 1", [agencyId, vehicleId]);
  if (!vehicle) throw new DomainError("NOT_FOUND", "Vehicle not found.", 404);
  return vehicle;
}

function parseRecordOilChangeInput(value: unknown): RecordOilChangeInput {
  const input = value as Partial<RecordOilChangeInput> | null;
  if (!input || typeof input !== "object") throw new DomainError("VALIDATION_FAILED", "Invalid oil change payload.", 400);
  const errors: Record<string, string> = {};
  const servicedOn = typeof input.servicedOn === "string" ? input.servicedOn.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(servicedOn) || !Number.isFinite(Date.parse(`${servicedOn}T00:00:00Z`))) errors.servicedOn = "Use a valid date.";
  else if (Date.parse(`${servicedOn}T00:00:00Z`) > Date.now() + 86_400_000) errors.servicedOn = "The service date cannot be in the future.";
  if (!Number.isInteger(input.odometer) || input.odometer! < 0) errors.odometer = "Enter a valid odometer reading.";
  if (!Number.isInteger(input.cost) || input.cost! < 0) errors.cost = "Enter a whole PKR cost of 0 or more.";
  const workshop = typeof input.workshop === "string" ? input.workshop.trim() : "";
  if (workshop.length < 2 || workshop.length > 120) errors.workshop = "Enter the workshop name.";
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  if (notes.length > 500) errors.notes = "Keep notes under 500 characters.";
  if (input.addExpense && !(input.cost! > 0)) errors.cost = "Enter the cost to add it as an expense.";
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the oil change details.", 400, errors);
  return { servicedOn, odometer: input.odometer!, cost: input.cost!, workshop, notes, addExpense: Boolean(input.addExpense) };
}

export async function getOilChangeOverview(context: RequestContext, vehicleId: string): Promise<OilChangeOverview> {
  requireRole(context, [...viewRoles]);
  const vehicle = await requireVehicle(context.agencyId, vehicleId);
  const history = await queryAll<OilChangeRecordDto>(`SELECT sr.id, sr.serviced_on AS servicedOn, sr.odometer, sr.cost, sr.workshop, coalesce(sr.notes,'') AS notes,
      sr.expense_id AS expenseId, u.name AS recordedBy, sr.created_at AS createdAt
    FROM vehicle_service_records sr LEFT JOIN users u ON u.id=sr.actor_id
    WHERE sr.agency_id=? AND sr.vehicle_id=? AND sr.kind='oil_change' AND sr.voided_at IS NULL
    ORDER BY sr.odometer DESC, sr.serviced_on DESC, sr.created_at DESC`, [context.agencyId, vehicleId]);
  const summary = summarizeOilChange(vehicle.intervalKm, history[0]?.odometer, await getLastVehicleOdometer(context.agencyId, vehicleId));
  return { ...summary, vehicleId, history };
}

export async function recordOilChange(context: RequestContext, vehicleId: string, rawInput: unknown): Promise<OilChangeOverview> {
  requireRole(context, [...recordRoles]);
  const input = parseRecordOilChangeInput(rawInput);
  if (input.addExpense) await listExpenseCategories(context);
  await inTransaction(async () => {
    const vehicle = await requireVehicle(context.agencyId, vehicleId);
    if (vehicle.archivedAt) throw new DomainError("INVALID_STATUS_TRANSITION", "Restore this vehicle before recording maintenance.", 409);
    const expenseId = input.addExpense
      ? (await createExpense(context, { vehicleId, amount: input.cost, category: "Maintenance", description: `Oil change at ${input.odometer.toLocaleString("en-PK")} km · ${input.workshop}`, occurredOn: input.servicedOn })).id
      : null;
    const id = `SRV-${randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    await execute(`INSERT INTO vehicle_service_records (id,agency_id,vehicle_id,kind,serviced_on,odometer,cost,workshop,notes,expense_id,actor_id,created_at,updated_at) VALUES (?,?,?,'oil_change',?,?,?,?,?,?,?,?,?)`,
      [id, context.agencyId, vehicleId, input.servicedOn, input.odometer, input.cost, input.workshop, input.notes || null, expenseId, context.userId, now, now]);
    await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,
      [randomUUID(), context.agencyId, context.userId, "vehicle.oil_change_recorded", "vehicle", vehicleId, JSON.stringify({ recordId: id, servicedOn: input.servicedOn, odometer: input.odometer, cost: input.cost, workshop: input.workshop, expenseId }), now]);
  }, { immediate: true });
  return getOilChangeOverview(context, vehicleId);
}

export async function setOilChangeInterval(context: RequestContext, vehicleId: string, rawInterval: unknown): Promise<OilChangeOverview> {
  requireRole(context, [...manageRoles]);
  const intervalKm = typeof rawInterval === "number" ? rawInterval : Number.NaN;
  if (!Number.isInteger(intervalKm) || intervalKm < 500 || intervalKm > 50_000) throw new DomainError("VALIDATION_FAILED", "Enter an interval between 500 and 50,000 km.", 400, { intervalKm: "Use a whole number of kilometres between 500 and 50,000." });
  await inTransaction(async () => {
    const vehicle = await requireVehicle(context.agencyId, vehicleId);
    const now = new Date().toISOString();
    await execute("UPDATE vehicles SET oil_change_interval_km=?,updated_at=? WHERE agency_id=? AND id=?", [intervalKm, now, context.agencyId, vehicleId]);
    await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,
      [randomUUID(), context.agencyId, context.userId, "vehicle.oil_change_interval_set", "vehicle", vehicleId, JSON.stringify({ from: vehicle.intervalKm, to: intervalKm }), now]);
  }, { immediate: true });
  return getOilChangeOverview(context, vehicleId);
}

/** Hides a mistaken record from the schedule. A linked expense is left for finance to reject or keep. */
export async function voidOilChange(context: RequestContext, vehicleId: string, recordId: string, rawReason: unknown): Promise<OilChangeOverview> {
  requireRole(context, [...manageRoles]);
  const reason = typeof rawReason === "string" ? rawReason.trim() : "";
  if (reason.length < 3) throw new DomainError("VALIDATION_FAILED", "Explain why this record is being removed.", 400, { reason: "Use at least 3 characters." });
  await inTransaction(async () => {
    await requireVehicle(context.agencyId, vehicleId);
    const now = new Date().toISOString();
    const result = await execute("UPDATE vehicle_service_records SET voided_at=?,void_reason=?,updated_at=? WHERE agency_id=? AND vehicle_id=? AND id=? AND voided_at IS NULL",
      [now, reason, now, context.agencyId, vehicleId, recordId]);
    if (!result.changes) throw new DomainError("NOT_FOUND", "Oil change record not found.", 404);
    await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,
      [randomUUID(), context.agencyId, context.userId, "vehicle.oil_change_voided", "vehicle", vehicleId, JSON.stringify({ recordId, reason }), now]);
  }, { immediate: true });
  return getOilChangeOverview(context, vehicleId);
}
