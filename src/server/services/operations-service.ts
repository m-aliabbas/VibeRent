import "server-only";
import { sqlite } from "@/db/connection";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";

export function getTodaysOperations(context: RequestContext, date?: string) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  const localDate = date ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) throw new DomainError("VALIDATION_FAILED", "Date must use YYYY-MM-DD.", 400, { date: "Use YYYY-MM-DD." });
  const start = new Date(`${localDate}T00:00:00+05:00`);
  if (!Number.isFinite(start.getTime())) throw new DomainError("VALIDATION_FAILED", "Enter a valid date.", 400, { date: "Enter a valid calendar date." });
  const end = new Date(start.getTime() + 86_400_000);
  const rows = sqlite.prepare(`
    SELECT bk.id, bk.pickup_at AS pickupAt, bk.return_at AS returnAt, bk.status, bk.version,
      c.id AS customerId, c.name AS customer, c.phone_normalized AS customerPhone,
      v.id AS vehicleId, coalesce(bk.external_vehicle_plate,v.plate) AS plate, coalesce(bk.external_vehicle_make,v.make) AS make, coalesce(bk.external_vehicle_model,v.model) AS model, br.id AS branchId, br.name AS branch, br.city
    FROM bookings bk
    JOIN customers c ON c.id=bk.customer_id AND c.agency_id=bk.agency_id
    LEFT JOIN vehicles v ON v.id=bk.vehicle_id AND v.agency_id=bk.agency_id
    JOIN branches br ON br.id=bk.branch_id AND br.agency_id=bk.agency_id
    WHERE bk.agency_id=? AND bk.status IN ('confirmed','checked_out')
      AND ((bk.pickup_at>=? AND bk.pickup_at<?) OR (bk.return_at>=? AND bk.return_at<?))
    ORDER BY min(bk.pickup_at,bk.return_at)
  `).all(context.agencyId, start.toISOString(), end.toISOString(), start.toISOString(), end.toISOString()) as Array<Record<string, unknown> & { pickupAt: string; returnAt: string }>;
  return {
    date: localDate,
    pickups: rows.filter((row) => row.pickupAt >= start.toISOString() && row.pickupAt < end.toISOString()),
    returns: rows.filter((row) => row.returnAt >= start.toISOString() && row.returnAt < end.toISOString()),
  };
}
