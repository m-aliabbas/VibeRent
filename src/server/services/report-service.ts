import "server-only";

import { sqlite } from "@/db/connection";
import { buildLedgerEntries, summarizeLedger } from "@/lib/reports/ledger";
import type { LedgerEntry, LedgerSummary } from "@/lib/reports/ledger";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";

type Vehicle = { id: string; name: string; plate: string; city: string; ownership: string; ownerId: string | null; archivedAt: string | null };
type Booking = { id: string; vehicleId: string | null; ownerId: string | null; source: string; pickupAt: string; returnAt: string; completedAt: string | null; status: string; totalAmount: number; shareBasis: string | null; ownerSharePercent: number | null; ownerShareAmount: number | null; fulfillmentType:"fleet"|"external"; externalVehicle:string|null; externalPlate:string|null; externalSupplierName:string|null; city:string };
type Cost = { id: string; vehicleId: string | null; ownerId: string | null; date: string; category: string; description: string; amount: number; status: string; receipt: number };
type Transaction = { id: string; bookingId: string | null; date: string; amount: number; kind: string; originalKind:string|null; status: string; method: string; reference:string };
type Payout = { id: string; ownerId: string; vehicleId:string|null; paidAt: string; amount: number; method: string; reference: string };
type SourcePayout = {id:string;bookingId:string;supplierName:string;paidAt:string;amount:number;method:string;reference:string};
type Block = { vehicleId: string; startAt: string; endAt: string };

export type { LedgerEntry, LedgerSummary } from "@/lib/reports/ledger";
export { summarizeLedger } from "@/lib/reports/ledger";

export type ReportSource = { id: string; label: string; amount: number };
export type VehicleReportRow = { id: string; vehicle: string; city: string; ownership: string; revenue: number; expenses: number; ownerShare: number; utilization: number; availableDays: number; downtime: number; sources: ReportSource[] };
export type ReportPeriod = {
  key: string;
  label: string;
  from: string;
  to: string;
  vehicles: VehicleReportRow[];
  ledger: { entries: LedgerEntry[]; summary: LedgerSummary };
  collections: { booked: number; collected: number; outstanding: number; overdue: number; channels: Array<{ name: string; count: number; collected: number }> };
  expenses: { approved: number; ownerResponsibility: number; receiptExceptions: number; categories: Array<{ name: string; amount: number }> };
  owners: { managedRevenue: number; ownerShare: number; paid: number; payable: number; vehicleCount: number; rows: Array<{ id: string; name: string; revenue: number; share: number; paid: number; payable: number; openingBalance: number }> };
};
export type ReportsData = {
  agencyName: string;
  periods: ReportPeriod[];
  cities: string[];
  ledgerEntries: LedgerEntry[];
  dateBounds: { min: string; max: string };
  ledgerAccounts: {
    vehicles: Array<{ id: string; label: string; city: string; ownership: "Owned" | "Managed"; ownerId: string | null; archived: boolean }>;
    owners: Array<{ id: string; label: string }>;
  };
};

function periodBounds(key: string) {
  const [year, month] = key.split("-").map(Number);
  return { from: new Date(Date.UTC(year, month - 1, 1)).toISOString(), to: new Date(Date.UTC(year, month, 1)).toISOString() };
}

function overlapDays(start: string, end: string, from: string, to: string) {
  const a = Math.max(Date.parse(start), Date.parse(from));
  const b = Math.min(Date.parse(end), Date.parse(to));
  return Math.max(0, (b - a) / 86_400_000);
}

function ownerShare(total: number, row: Booking) {
  return row.shareBasis === "percentage" ? Math.round(total * (row.ownerSharePercent ?? 0) / 100) : row.ownerShareAmount ?? 0;
}

function bookingMonth(row: Booking) {
  return (row.completedAt ?? row.pickupAt).slice(0, 7);
}

function allocatedOwnerShares(rows: Booking[]) {
  const fixed = new Set<string>();
  const values = new Map<string, number>();
  for (const row of [...rows].sort((a,b)=>(a.completedAt??a.pickupAt).localeCompare(b.completedAt??b.pickupAt)||a.id.localeCompare(b.id))) {
    if (row.shareBasis !== "fixed_monthly") {
      values.set(row.id, ownerShare(row.totalAmount, row));
      continue;
    }
    const key = `${row.vehicleId}-${bookingMonth(row)}`;
    values.set(row.id, fixed.has(key) ? 0 : ownerShare(row.totalAmount, row));
    fixed.add(key);
  }
  return values;
}

function totalOwnerShare(rows: Booking[]) {
  return [...allocatedOwnerShares(rows).values()].reduce((sum, value) => sum + value, 0);
}

export function getReports(context: RequestContext): ReportsData {
  requireRole(context, ["agency_owner", "fleet_manager", "accountant"]);
  const agency = (sqlite.prepare("SELECT name FROM agencies WHERE id=? LIMIT 1").get(context.agencyId) as { name: string } | undefined)?.name ?? "VibeRent agency";
  const vehicles = sqlite.prepare(`
    SELECT v.id, v.make || ' ' || v.model || ' - ' || v.plate AS name, v.plate,
           b.city, v.ownership, v.owner_id AS ownerId, v.archived_at AS archivedAt
    FROM vehicles v
    JOIN branches b ON b.id=v.branch_id AND b.agency_id=v.agency_id
    WHERE v.agency_id=?
    ORDER BY v.archived_at IS NOT NULL, v.make, v.model
  `).all(context.agencyId) as Vehicle[];
  const bookings = sqlite.prepare(`
    SELECT b.id, b.vehicle_id AS vehicleId, v.owner_id AS ownerId, b.source,
           b.pickup_at AS pickupAt, b.return_at AS returnAt, b.completed_at AS completedAt,
           b.status, b.total_amount AS totalAmount, a.share_basis AS shareBasis,
           a.owner_share_percent AS ownerSharePercent, a.owner_share_amount AS ownerShareAmount,
           b.fulfillment_type AS fulfillmentType,
           CASE WHEN b.fulfillment_type='external' THEN b.external_vehicle_make||' '||b.external_vehicle_model||coalesce(' '||b.external_vehicle_year,'') END AS externalVehicle,
           b.external_vehicle_plate AS externalPlate,b.external_supplier_name AS externalSupplierName,br.city
    FROM bookings b
    LEFT JOIN vehicles v ON v.id=b.vehicle_id AND v.agency_id=b.agency_id
    LEFT JOIN management_agreements a ON a.id=v.agreement_id AND a.agency_id=v.agency_id
    JOIN branches br ON br.id=b.branch_id AND br.agency_id=b.agency_id
    WHERE b.agency_id=?
  `).all(context.agencyId) as Booking[];
  const costs = sqlite.prepare(`
    SELECT e.id, e.vehicle_id AS vehicleId, e.owner_id AS ownerId, e.occurred_on AS date,
           e.category, e.description, e.amount, e.status,
           EXISTS(SELECT 1 FROM private_files pf WHERE pf.agency_id=e.agency_id AND pf.entity_type='expense' AND pf.entity_id=e.id AND pf.status='ready') AS receipt
    FROM expenses e WHERE e.agency_id=?
  `).all(context.agencyId) as Cost[];
  const transactions = sqlite.prepare(`SELECT ft.id,ft.booking_id AS bookingId,ft.posted_at AS date,ft.amount,ft.kind,original.kind AS originalKind,ft.status,ft.method,ft.reference FROM financial_transactions ft LEFT JOIN financial_transactions original ON original.id=ft.linked_transaction_id AND original.agency_id=ft.agency_id WHERE ft.agency_id=?`)
    .all(context.agencyId) as Transaction[];
  const payouts = sqlite.prepare("SELECT id,owner_id AS ownerId,vehicle_id AS vehicleId,paid_at AS paidAt,amount,method,reference FROM owner_payouts WHERE agency_id=? AND status='posted'")
    .all(context.agencyId) as Payout[];
  const sourcePayouts=sqlite.prepare("SELECT id,booking_id AS bookingId,supplier_name AS supplierName,paid_at AS paidAt,amount,method,reference FROM source_payouts WHERE agency_id=? AND status='posted'")
    .all(context.agencyId) as SourcePayout[];
  const blocks = sqlite.prepare("SELECT vehicle_id AS vehicleId,start_at AS startAt,end_at AS endAt FROM availability_blocks WHERE agency_id=? AND archived_at IS NULL")
    .all(context.agencyId) as Block[];
  const owners = sqlite.prepare("SELECT id,name FROM owners WHERE agency_id=? ORDER BY name")
    .all(context.agencyId) as Array<{ id: string; name: string }>;

  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const ownerById = new Map(owners.map((owner) => [owner.id, owner]));
  const bookingById=new Map(bookings.map(booking=>[booking.id,booking]));
  const completedBookings = bookings.filter((row) => row.status === "completed");
  const approvedCosts = costs.filter((row) => row.status === "approved");
  const ledgerEntries: LedgerEntry[] = [
    ...transactions.filter(row=>{const kind=row.kind.toLowerCase();return row.status==="posted"&&(["payment","late_return_charge","deposit_applied","deposit_forfeited"].includes(kind)||(["refund","reversal"].includes(kind)&&["payment","late_return_charge","deposit_applied","deposit_forfeited"].includes(row.originalKind?.toLowerCase()??"")))}).map((transaction) => {
      const row=transaction.bookingId?bookingById.get(transaction.bookingId):undefined;
      const vehicle = row?.vehicleId?vehicleById.get(row.vehicleId):undefined;
      const owner = row?.ownerId ? ownerById.get(row.ownerId) : undefined;
      const amount=["refund","reversal"].includes(transaction.kind.toLowerCase())?-transaction.amount:transaction.amount;
      return {
        id: `TXN-${transaction.id}`,
        date: transaction.date.slice(0,10),
        vehicleId: row?.vehicleId??null,
        vehicle: vehicle?.name??row?.externalVehicle??"Unlinked booking payment",
        city: vehicle?.city??row?.city??"Unknown city",
        ownership: vehicle?.ownerId||row?.fulfillmentType==="external" ? "Managed" as const : "Owned" as const,
        ownerId: row?.ownerId??null,
        owner: owner?.name??row?.externalSupplierName??null,
        kind: "Rental income" as const,
        reference: transaction.reference||transaction.id,
        description: `${transaction.kind.replaceAll("_"," ")} · ${transaction.method}`,
        income: amount,
        expense: 0,
        ownerMovement: 0,
        operatingResult: amount,
      };
    }),
    ...approvedCosts.map((row) => {
      const vehicle = row.vehicleId ? vehicleById.get(row.vehicleId) : undefined;
      const owner = row.ownerId ? ownerById.get(row.ownerId) : undefined;
      return {
        id: `COST-${row.id}`,
        date: row.date.slice(0, 10),
        vehicleId: row.vehicleId,
        vehicle: vehicle?.name ?? (row.vehicleId ? `Historical vehicle (${row.vehicleId})` : "Agency-wide"),
        city: vehicle?.city ?? "All cities",
        ownership: vehicle?.ownerId || row.ownerId ? "Managed" as const : "Owned" as const,
        ownerId: row.ownerId,
        owner: owner?.name ?? null,
        kind: "Expense" as const,
        reference: row.id,
        description: `${row.category} - ${row.description}`,
        income: 0,
        expense: row.amount,
        ownerMovement: row.ownerId ? -row.amount : 0,
        operatingResult: -row.amount,
      };
    }),
    ...payouts.map((row) => ({
      id: `PAY-${row.id}`,
      date: row.paidAt.slice(0, 10),
      vehicleId: row.vehicleId,
      vehicle: row.vehicleId?vehicleById.get(row.vehicleId)?.name??"Historical managed vehicle":"Owner account",
      city: row.vehicleId?vehicleById.get(row.vehicleId)?.city??"Unknown city":"All cities",
      ownership: "Managed" as const,
      ownerId: row.ownerId,
      owner: ownerById.get(row.ownerId)?.name ?? "Owner",
      kind: "Owner settlement" as const,
      reference: row.reference || row.id,
      description: `${row.method.replaceAll("_", " ")} payout`,
      income: 0,
      expense: 0,
      ownerMovement: -row.amount,
      operatingResult: -row.amount,
    })),
    ...sourcePayouts.map(row=>{const booking=bookingById.get(row.bookingId);return {id:`SRC-${row.id}`,date:row.paidAt.slice(0,10),vehicleId:null,vehicle:booking?.externalVehicle??"Externally sourced vehicle",city:booking?.city??"Unknown city",ownership:"Managed" as const,ownerId:null,owner:row.supplierName,kind:"Source settlement" as const,reference:row.reference||row.id,description:`${row.method.replaceAll("_"," ")} source payment`,income:0,expense:0,ownerMovement:-row.amount,operatingResult:-row.amount}}),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));

  const today = new Date().toISOString().slice(0, 10);
  const dates = ledgerEntries.map((row) => row.date);
  const latestDate = dates.at(-1);
  const dateBounds = { min: dates[0] ?? `${today.slice(0, 7)}-01`, max: latestDate && latestDate > today ? latestDate : today };
  const dateKeys = [
    ...bookings.map((row) => (row.completedAt ?? row.pickupAt).slice(0, 7)),
    ...costs.map((row) => row.date.slice(0, 7)),
    ...transactions.map((row) => row.date.slice(0, 7)),
    ...payouts.map((row) => row.paidAt.slice(0, 7)),
    ...sourcePayouts.map((row) => row.paidAt.slice(0, 7)),
  ];
  const periods = [...new Set(dateKeys.length ? dateKeys : [today.slice(0, 7)])].sort().reverse().map((key) => {
    const { from, to } = periodBounds(key);
    const fromDate = from.slice(0, 10);
    const toDate = new Date(Date.parse(to) - 86_400_000).toISOString().slice(0, 10);
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    const periodBookings = completedBookings.filter((row) => (row.completedAt ?? row.pickupAt) >= from && (row.completedAt ?? row.pickupAt) < to);
    const bookedBookings = bookings.filter((row) => row.pickupAt >= from && row.pickupAt < to && !["draft", "cancelled", "no_show"].includes(row.status));
    const periodCosts = approvedCosts.filter((row) => row.date >= fromDate && row.date < to.slice(0, 10));
    const periodTransactions = transactions.filter((row) => row.date >= from && row.date < to && row.status === "posted");
    const periodPayouts = payouts.filter((row) => row.paidAt >= from && row.paidAt < to);
    const rows = vehicles.map((vehicle) => {
      const rental = periodBookings.filter((row) => row.vehicleId === vehicle.id);
      const expense = periodCosts.filter((row) => row.vehicleId === vehicle.id);
      const occupied = bookings.filter((row) => row.vehicleId === vehicle.id && ["confirmed", "checked_out", "completed"].includes(row.status))
        .reduce((sum, row) => sum + overlapDays(row.pickupAt, row.returnAt, from, to), 0);
      const downtime = blocks.filter((row) => row.vehicleId === vehicle.id).reduce((sum, row) => sum + overlapDays(row.startAt, row.endAt, from, to), 0);
      const availableDays = Math.max(0, days - downtime);
      const revenue = rental.reduce((sum, row) => sum + row.totalAmount, 0);
      const expenses = expense.reduce((sum, row) => sum + row.amount, 0);
      const share = vehicle.ownerId ? totalOwnerShare(rental) : 0;
      return {
        id: vehicle.id,
        vehicle: vehicle.name,
        city: vehicle.city,
        ownership: vehicle.ownership === "managed" ? "Managed" : "Owned",
        revenue,
        expenses,
        ownerShare: share,
        utilization: availableDays ? Math.min(100, Math.round(occupied / availableDays * 100)) : 0,
        availableDays: Math.round(availableDays * 10) / 10,
        downtime: Math.round(downtime * 10) / 10,
        sources: [
          ...rental.map((row) => ({ id: row.id, label: "Completed rental", amount: row.totalAmount })),
          ...expense.map((row) => ({ id: row.id, label: row.description, amount: -row.amount })),
        ],
      };
    });
    const channels = [...new Set(periodTransactions.map((row) => row.method || "Unspecified"))].map((name) => ({
      name,
      count: periodTransactions.filter((row) => (row.method || "Unspecified") === name).length,
      collected: periodTransactions.filter((row) => (row.method || "Unspecified") === name)
        .reduce((sum, row) => sum + (["refund", "reversal"].includes(row.kind) ? -row.amount : row.amount), 0),
    })).sort((a, b) => b.collected - a.collected);
    const booked = bookedBookings.reduce((sum, row) => sum + row.totalAmount, 0);
    const collected = periodTransactions.reduce((sum, row) => sum + (["refund", "reversal"].includes(row.kind) ? -row.amount : row.amount), 0);
    const categories = [...new Set(periodCosts.map((row) => row.category))].map((name) => ({
      name,
      amount: periodCosts.filter((row) => row.category === name).reduce((sum, row) => sum + row.amount, 0),
    })).sort((a, b) => b.amount - a.amount);
    const ownerRows = owners.map((owner) => {
      const rentals = periodBookings.filter((row) => row.ownerId === owner.id);
      const revenue = rentals.reduce((sum, row) => sum + row.totalAmount, 0);
      const share = totalOwnerShare(rentals);
      const paid = periodPayouts.filter((row) => row.ownerId === owner.id).reduce((sum, row) => sum + row.amount, 0);
      const ownerLedger = buildLedgerEntries(ledgerEntries, { from: fromDate, to: toDate, city: "All cities", ownership: "All ownership", scope: { type: "owner", ownerId: owner.id } });
      const openingBalance = ownerLedger.filter((row) => row.kind === "Opening owner balance").reduce((sum, row) => sum + row.ownerMovement, 0);
      return { id: owner.id, name: owner.name, revenue, share, paid, openingBalance, payable: openingBalance + share - periodCosts.filter((row) => row.ownerId === owner.id).reduce((sum, row) => sum + row.amount, 0) - paid };
    }).filter((row) => row.revenue || row.share || row.paid || row.payable || row.openingBalance);
    const periodLedgerEntries = buildLedgerEntries(ledgerEntries, { from: fromDate, to: toDate, city: "All cities", ownership: "All ownership", scope: { type: "overall" } });
    return {
      key,
      label: new Intl.DateTimeFormat("en-PK", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(from)),
      from,
      to,
      vehicles: rows,
      ledger: { entries: periodLedgerEntries, summary: summarizeLedger(periodLedgerEntries) },
      collections: { booked, collected, outstanding: Math.max(0, booked - collected), overdue: bookedBookings.filter((row) => row.returnAt < new Date().toISOString()).reduce((sum, row) => sum + row.totalAmount, 0), channels },
      expenses: { approved: periodCosts.reduce((sum, row) => sum + row.amount, 0), ownerResponsibility: periodCosts.filter((row) => row.ownerId).reduce((sum, row) => sum + row.amount, 0), receiptExceptions: periodCosts.filter((row) => !row.receipt).length, categories },
      owners: { managedRevenue: ownerRows.reduce((sum, row) => sum + row.revenue, 0), ownerShare: ownerRows.reduce((sum, row) => sum + row.share, 0), paid: ownerRows.reduce((sum, row) => sum + row.paid, 0), payable: ownerRows.reduce((sum, row) => sum + row.payable, 0), vehicleCount: vehicles.filter((row) => row.ownerId).length, rows: ownerRows },
    } satisfies ReportPeriod;
  });

  return {
    agencyName: agency,
    periods,
    cities: [...new Set(vehicles.map((vehicle) => vehicle.city))].sort(),
    ledgerEntries,
    dateBounds,
    ledgerAccounts: {
      vehicles: vehicles.map((vehicle) => ({ id: vehicle.id, label: vehicle.name, city: vehicle.city, ownership: vehicle.ownership === "managed" ? "Managed" : "Owned", ownerId: vehicle.ownerId, archived: Boolean(vehicle.archivedAt) })),
      owners: owners.map((owner) => ({ id: owner.id, label: owner.name })),
    },
  };
}
