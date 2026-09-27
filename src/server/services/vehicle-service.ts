import "server-only";
import { sqlite } from "@/db/connection";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { vehicleRepository } from "@/server/repositories/drizzle/vehicle-repository";
import { parseVehicleInput } from "@/server/validation/vehicle";

export function listVehicles(context: RequestContext) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  return vehicleRepository.list(context.agencyId);
}

export function getVehicle(context: RequestContext, id: string) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const vehicle = vehicleRepository.getById(context.agencyId, id);
  if (!vehicle) throw new DomainError("NOT_FOUND", "Vehicle not found.", 404);
  return vehicle;
}

export function saveVehicle(context: RequestContext, input: unknown) {
  requireRole(context, ["agency_owner", "fleet_manager"]);
  return vehicleRepository.save(context.agencyId, context.userId, parseVehicleInput(input));
}

export function listAvailableVehicles(context: RequestContext, pickupAt: string, returnAt: string) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  const pickup = Date.parse(pickupAt);
  const returned = Date.parse(returnAt);
  if (!Number.isFinite(pickup) || !Number.isFinite(returned) || returned <= pickup) {
    throw new DomainError("VALIDATION_FAILED", "Enter a valid pickup and return interval.", 400, { returnAt: "Return must be after pickup." });
  }
  return sqlite.prepare(`
    SELECT v.id, v.plate, v.make, v.model, v.year, v.category, v.daily_rate AS dailyRate,
      b.id AS branchId, b.name AS branch, b.city, v.updated_at AS updatedAt
    FROM vehicles v
    JOIN branches b ON b.id=v.branch_id AND b.agency_id=v.agency_id
    WHERE v.agency_id=? AND v.archived_at IS NULL AND v.status NOT IN ('maintenance','out_of_service','archived')
      AND NOT EXISTS (SELECT 1 FROM bookings bk WHERE bk.agency_id=v.agency_id AND bk.vehicle_id=v.id AND bk.status IN ('confirmed','checked_out') AND bk.pickup_at < ? AND bk.return_at > ?)
      AND NOT EXISTS (SELECT 1 FROM availability_blocks ab WHERE ab.agency_id=v.agency_id AND ab.vehicle_id=v.id AND ab.archived_at IS NULL AND ab.start_at < ? AND ab.end_at > ?)
    ORDER BY b.city, v.daily_rate, v.plate
  `).all(context.agencyId, new Date(returned).toISOString(), new Date(pickup).toISOString(), new Date(returned).toISOString(), new Date(pickup).toISOString());
}
