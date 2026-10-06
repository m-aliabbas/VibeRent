import "server-only";
import { sqlite } from "@/db/connection";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";

export type DashboardData = {
  totalVehicles: number;
  activeRentals: number;
  todayRevenue: number;
  monthRevenue: number;
  todayExpenses: number;
  monthExpenses: number;
  utilization: number;
  activeRentalRows: Array<{ id:string; customer:string; vehicle:string; plate:string; returnAt:string; destinationCity:string }>;
  schedule: Array<{ id: string; time: string; type: "Pickup" | "Return"; customer: string; vehicle: string; plate: string; location: string }>;
  activity: Array<{ id: string; title: string; detail: string; occurredAt: string; kind: "booking" | "vehicle" | "customer" | "finance" | "other" }>;
};

export function getDashboard(context: RequestContext): DashboardData {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const start = new Date(`${localDate}T00:00:00+05:00`).toISOString();
  const end = new Date(`${localDate}T24:00:00+05:00`).toISOString();
  const nextLocalDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(end));
  const monthStart = new Date(`${localDate.slice(0, 7)}-01T00:00:00+05:00`).toISOString();
  const counts = sqlite.prepare(`
    SELECT
      (SELECT count(*) FROM vehicles WHERE agency_id=? AND archived_at IS NULL) AS totalVehicles,
      (SELECT count(*) FROM bookings WHERE agency_id=? AND status='checked_out') AS activeRentals,
      (SELECT coalesce(sum(CASE WHEN lower(ft.kind) IN ('payment','deposit_applied','deposit_forfeited') THEN ft.amount WHEN lower(ft.kind) IN ('refund','reversal') AND lower(coalesce(original.kind,'')) IN ('payment','deposit_applied','deposit_forfeited') THEN -ft.amount ELSE 0 END),0) FROM financial_transactions ft LEFT JOIN financial_transactions original ON original.id=ft.linked_transaction_id AND original.agency_id=ft.agency_id WHERE ft.agency_id=? AND ft.status='posted' AND ft.posted_at>=? AND ft.posted_at<?) AS todayRevenue,
      (SELECT coalesce(sum(CASE WHEN lower(ft.kind) IN ('payment','deposit_applied','deposit_forfeited') THEN ft.amount WHEN lower(ft.kind) IN ('refund','reversal') AND lower(coalesce(original.kind,'')) IN ('payment','deposit_applied','deposit_forfeited') THEN -ft.amount ELSE 0 END),0) FROM financial_transactions ft LEFT JOIN financial_transactions original ON original.id=ft.linked_transaction_id AND original.agency_id=ft.agency_id WHERE ft.agency_id=? AND ft.status='posted' AND ft.posted_at>=? AND ft.posted_at<?) AS monthRevenue,
      (SELECT coalesce(sum(amount),0) FROM expenses WHERE agency_id=? AND status='approved' AND occurred_on>=? AND occurred_on<?) AS todayExpenses,
      (SELECT coalesce(sum(amount),0) FROM expenses WHERE agency_id=? AND status='approved' AND occurred_on>=? AND occurred_on<?) AS monthExpenses,
      (SELECT count(DISTINCT vehicle_id) FROM bookings WHERE agency_id=? AND status='checked_out') AS utilizedVehicles
  `).get(context.agencyId, context.agencyId, context.agencyId, start, end, context.agencyId, monthStart, end, context.agencyId, localDate, nextLocalDate, context.agencyId, `${localDate.slice(0,7)}-01`, nextLocalDate, context.agencyId) as { totalVehicles: number; activeRentals: number; todayRevenue: number; monthRevenue:number; todayExpenses:number; monthExpenses:number; utilizedVehicles: number };
  const scheduleRows = sqlite.prepare(`
    SELECT bk.id, bk.status, bk.pickup_at AS pickupAt, bk.return_at AS returnAt, c.name AS customer,
      v.make || ' ' || v.model || ' ' || v.year AS vehicle, v.plate, br.name || ', ' || br.city AS location
    FROM bookings bk
    JOIN customers c ON c.id=bk.customer_id AND c.agency_id=bk.agency_id
    JOIN vehicles v ON v.id=bk.vehicle_id AND v.agency_id=bk.agency_id
    JOIN branches br ON br.id=bk.branch_id AND br.agency_id=bk.agency_id
    WHERE bk.agency_id=? AND bk.status IN ('confirmed','checked_out')
      AND ((bk.pickup_at>=? AND bk.pickup_at<?) OR (bk.return_at>=? AND bk.return_at<?))
    ORDER BY min(bk.pickup_at,bk.return_at)
  `).all(context.agencyId, start, end, start, end) as Array<{ id: string; status: "confirmed" | "checked_out"; pickupAt: string; returnAt: string; customer: string; vehicle: string; plate: string; location: string }>;
  const schedule = scheduleRows.flatMap(row => {
    const events: DashboardData["schedule"] = [];
    if (row.status === "confirmed" && row.pickupAt >= start && row.pickupAt < end) events.push({ id: `${row.id}-pickup`, time: row.pickupAt, type: "Pickup", customer: row.customer, vehicle: row.vehicle, plate: row.plate, location: row.location });
    if (row.status === "checked_out" && row.returnAt >= start && row.returnAt < end) events.push({ id: `${row.id}-return`, time: row.returnAt, type: "Return", customer: row.customer, vehicle: row.vehicle, plate: row.plate, location: row.location });
    return events;
  }).sort((a, b) => a.time.localeCompare(b.time));
  const activeRentalRows = sqlite.prepare(`
    SELECT bk.id,c.name AS customer,v.make || ' ' || v.model || ' ' || v.year AS vehicle,v.plate,bk.return_at AS returnAt,bk.destination_city AS destinationCity
    FROM bookings bk JOIN customers c ON c.id=bk.customer_id AND c.agency_id=bk.agency_id JOIN vehicles v ON v.id=bk.vehicle_id AND v.agency_id=bk.agency_id
    WHERE bk.agency_id=? AND bk.status='checked_out' ORDER BY bk.return_at ASC
  `).all(context.agencyId) as DashboardData["activeRentalRows"];
  const activityRows = sqlite.prepare(`SELECT id,action,entity_type AS entityType,entity_id AS entityId,metadata,occurred_at AS occurredAt FROM audit_events WHERE agency_id=? ORDER BY occurred_at DESC,id DESC LIMIT 6`)
    .all(context.agencyId) as Array<{ id: string; action: string; entityType: string; entityId: string; metadata: string | Record<string, unknown> | null; occurredAt: string }>;
  const activity = activityRows.map(row => {
    const metadata = typeof row.metadata === "string" ? JSON.parse(row.metadata) as Record<string, unknown> : row.metadata ?? {};
    const title = row.action.replaceAll(".", " ").replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
    const detail = [metadata.name, metadata.plate, metadata.status, row.entityId].filter(Boolean).join(" · ");
    const kind: DashboardData["activity"][number]["kind"] = row.entityType === "booking" ? "booking" : row.entityType === "vehicle" ? "vehicle" : row.entityType === "customer" ? "customer" : row.entityType.includes("payment") || row.entityType.includes("transaction") ? "finance" : "other";
    return { id: row.id, title, detail, occurredAt: row.occurredAt, kind };
  });
  return { ...counts, utilization: counts.totalVehicles ? Math.round(counts.utilizedVehicles / counts.totalVehicles * 100) : 0, schedule, activeRentalRows, activity };
}
