import "server-only";

import { randomUUID } from "node:crypto";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";

/** One agency-wide monthly charge applied to every owner-managed car (for example a tracker or management fee). */
export type OwnerFixedChargeSettings = { amount: number; label: string; fromMonth: string | null };

export type OwnerFixedChargeRow = {
  id: string;
  date: string;
  month: string;
  vehicleId: string;
  ownerId: string;
  vehicle: string;
  plate: string;
  city: string;
  amount: number;
  label: string;
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

async function readSettings(agencyId: string): Promise<OwnerFixedChargeSettings> {
  const row = await queryOne<{ amount: number | null; label: string | null; fromMonth: string | null }>(
    "SELECT owner_fixed_charge_amount AS amount, owner_fixed_charge_label AS label, owner_fixed_charge_from AS fromMonth FROM agencies WHERE id=? LIMIT 1",
    [agencyId],
  );
  return { amount: Number(row?.amount ?? 0), label: row?.label?.trim() || "Fixed charges", fromMonth: row?.fromMonth ?? null };
}

export async function getOwnerFixedChargeSettings(context: RequestContext) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  return readSettings(context.agencyId);
}

export async function saveOwnerFixedChargeSettings(context: RequestContext, raw: unknown) {
  requireRole(context, ["agency_owner", "accountant"]);
  const input = (raw ?? {}) as Record<string, unknown>;
  const amount = Number(input.amount);
  const label = typeof input.label === "string" ? input.label.trim() : "";
  const fromMonth = typeof input.fromMonth === "string" ? input.fromMonth.trim() : "";
  const errors: Record<string, string> = {};
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 10_000_000) errors.amount = "Enter a whole amount from 0 to 10,000,000.";
  if (!label || label.length > 60) errors.label = "Enter a name of up to 60 characters.";
  if (amount > 0 && !MONTH.test(fromMonth)) errors.fromMonth = "Choose the first month to charge.";
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the fixed charge.", 400, errors);
  const now = new Date().toISOString();
  return inTransaction(async () => {
    await execute(
      "UPDATE agencies SET owner_fixed_charge_amount=?,owner_fixed_charge_label=?,owner_fixed_charge_from=?,version=version+1,updated_at=? WHERE id=?",
      [amount, label, MONTH.test(fromMonth) ? fromMonth : null, now, context.agencyId],
    );
    await execute(
      "INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",
      [randomUUID(), context.agencyId, context.userId, "owner_fixed_charge.updated", "agency", context.agencyId, JSON.stringify({ amount, label, fromMonth: fromMonth || null }), now],
    );
    return readSettings(context.agencyId);
  });
}

function nextMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  return value === 12 ? `${year + 1}-01` : `${year}-${String(value + 1).padStart(2, "0")}`;
}

/**
 * Monthly fixed-charge rows for every owner-managed car, from the later of the charge start month and the car's
 * first month with the agency, through the current month (or the month the car left). Rows are derived from the
 * current setting, so editing the amount re-applies it to every car and month.
 */
export async function listOwnerFixedCharges(agencyId: string, ownerId?: string): Promise<OwnerFixedChargeRow[]> {
  const settings = await readSettings(agencyId);
  if (settings.amount <= 0 || !settings.fromMonth) return [];
  const vehicles = await queryAll<{ id: string; ownerId: string; vehicle: string; plate: string; city: string; createdAt: string; firstPickup: string | null; archivedAt: string | null; status: string; updatedAt: string }>(
    `SELECT v.id, v.owner_id AS ownerId, v.make || ' ' || v.model AS vehicle, v.plate, b.city, v.created_at AS createdAt,
      (SELECT min(bk.pickup_at) FROM bookings bk WHERE bk.agency_id=v.agency_id AND bk.vehicle_id=v.id) AS firstPickup,
      v.archived_at AS archivedAt, v.status, v.updated_at AS updatedAt
     FROM vehicles v JOIN branches b ON b.id=v.branch_id AND b.agency_id=v.agency_id
     WHERE v.agency_id=? AND v.owner_id IS NOT NULL${ownerId ? " AND v.owner_id=?" : ""}`,
    ownerId ? [agencyId, ownerId] : [agencyId],
  );
  const currentMonth = new Date().toISOString().slice(0, 7);
  const rows: OwnerFixedChargeRow[] = [];
  for (const car of vehicles) {
    const joined = [car.createdAt.slice(0, 7), car.firstPickup?.slice(0, 7)].filter(Boolean).sort()[0]!;
    const left = car.archivedAt ?? (car.status === "deleted" ? car.updatedAt : null);
    const last = left ? left.slice(0, 7) : currentMonth;
    for (let month = joined > settings.fromMonth ? joined : settings.fromMonth; month <= last; month = nextMonth(month)) {
      rows.push({ id: `FIX-${car.id}-${month}`, date: `${month}-01`, month, vehicleId: car.id, ownerId: car.ownerId, vehicle: car.vehicle, plate: car.plate, city: car.city, amount: settings.amount, label: settings.label });
    }
  }
  return rows;
}
