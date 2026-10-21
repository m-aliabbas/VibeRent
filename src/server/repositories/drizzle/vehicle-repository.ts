import "server-only";
import { randomUUID } from "node:crypto";
import { sqlite } from "@/db/connection";
import { DomainError } from "@/server/domain/errors";
import type { VehicleRepository } from "@/server/repositories/contracts";
import type { ManagementAgreement, Vehicle, VehicleRateRule } from "@/types/vehicle";
import { summarizeOilChange } from "@/lib/oil-change";

type VehicleRow = {
  id: string;
  branch_id: string;
  plate: string;
  chassis_number: string | null;
  engine_number: string | null;
  make: string;
  model: string;
  year: number;
  category: string;
  color: string;
  transmission: string;
  fuel: string;
  status: string;
  ownership: string;
  daily_rate: number;
  with_driver_rate: number | null;
  city: string;
  owner_id: string | null;
  owner_name: string | null;
  agreement_id: string | null;
  effective_from: string | null;
  effective_to: string | null;
  share_basis: string | null;
  owner_share_percent: number | null;
  owner_share_amount: number | null;
  expense_responsibility: string | null;
  payout_frequency: string | null;
  archived_at: string | null;
  last_odometer: number | null;
  oil_change_interval_km: number;
  last_oil_change_odometer: number | null;
};

const selectSql = `
  SELECT v.*, b.city, o.name AS owner_name,
    a.effective_from, a.effective_to, a.share_basis,
    a.owner_share_percent, a.owner_share_amount,
    a.expense_responsibility, a.payout_frequency,
    (SELECT ri.odometer FROM rental_inspections ri JOIN bookings bk ON bk.id = ri.booking_id AND bk.agency_id = ri.agency_id
      WHERE ri.agency_id = v.agency_id AND bk.vehicle_id = v.id AND bk.archived_at IS NULL
      ORDER BY ri.occurred_at DESC, ri.created_at DESC LIMIT 1) AS last_odometer,
    (SELECT max(sr.odometer) FROM vehicle_service_records sr
      WHERE sr.agency_id = v.agency_id AND sr.vehicle_id = v.id AND sr.kind = 'oil_change' AND sr.voided_at IS NULL) AS last_oil_change_odometer
  FROM vehicles v
  JOIN branches b ON b.id = v.branch_id AND b.agency_id = v.agency_id
  LEFT JOIN owners o ON o.id = v.owner_id AND o.agency_id = v.agency_id
  LEFT JOIN management_agreements a ON a.id = v.agreement_id AND a.agency_id = v.agency_id
`;

function title(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function mapVehicleStatus(value: string): Vehicle["status"] {
  const statuses: Record<string, Vehicle["status"]> = {
    available: "Available",
    booked: "Booked",
    maintenance: "Maintenance",
    out_of_service: "Out of Service",
    archived: "Archived",
  };
  return statuses[value] ?? "Out of Service";
}

function mapAgreement(row: VehicleRow): ManagementAgreement | undefined {
  if (!row.owner_id || !row.agreement_id || !row.effective_from) return undefined;
  return {
    ownerId: row.owner_id,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? "",
    shareMethod: row.share_basis === "fixed_monthly" ? "Fixed monthly" : "Percentage",
    ownerShare: row.share_basis === "fixed_monthly" ? (row.owner_share_amount ?? 0) : (row.owner_share_percent ?? 0),
    expenseResponsibility: title(row.expense_responsibility ?? "shared") as ManagementAgreement["expenseResponsibility"],
    payoutFrequency: title(row.payout_frequency ?? "monthly") as ManagementAgreement["payoutFrequency"],
  };
}

function mapVehicle(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    plate: row.plate,
    chassisNumber: row.chassis_number ?? "",
    engineNumber: row.engine_number ?? "",
    make: row.make,
    model: row.model,
    year: row.year,
    category: (row.category === "suv" ? "SUV" : title(row.category)) as Vehicle["category"],
    city: row.city as Vehicle["city"],
    ownership: row.ownership === "managed" ? "Managed" : "Own",
    status: row.archived_at ? "Archived" : mapVehicleStatus(row.status),
    dailyRate: row.daily_rate,
    withDriverRate: row.with_driver_rate ?? row.daily_rate,
    color: row.color,
    transmission: title(row.transmission) as Vehicle["transmission"],
    fuel: title(row.fuel) as Vehicle["fuel"],
    ownerId: row.owner_id ?? undefined,
    owner: row.owner_name ?? undefined,
    agreement: mapAgreement(row),
    lastOdometer: row.last_odometer ?? undefined,
    oilChange: summarizeOilChange(row.oil_change_interval_km, row.last_oil_change_odometer, row.last_odometer),
  };
}

function listRateRules(agencyId: string, vehicleId: string): VehicleRateRule[] {
  return sqlite.prepare(`SELECT destination_city AS destinationCity, daily_rate AS dailyRate, per_km_rate AS perKmRate, minimum_days AS minimumDays FROM vehicle_rate_rules WHERE agency_id=? AND vehicle_id=? AND active=1 ORDER BY destination_city`)
    .all(agencyId, vehicleId) as VehicleRateRule[];
}

export class SqliteVehicleRepository implements VehicleRepository {
  list(agencyId: string) {
    return (sqlite.prepare(`${selectSql} WHERE v.agency_id = ? ORDER BY v.created_at DESC`).all(agencyId) as VehicleRow[]).map(row => ({ ...mapVehicle(row), rateRules: listRateRules(agencyId, row.id) }));
  }

  getById(agencyId: string, id: string) {
    const row = sqlite.prepare(`${selectSql} WHERE v.agency_id = ? AND v.id = ? LIMIT 1`).get(agencyId, id) as VehicleRow | undefined;
    return row ? { ...mapVehicle(row), rateRules: listRateRules(agencyId, row.id) } : undefined;
  }

  save(agencyId: string, actorId: string, input: Vehicle) {
    return sqlite.transaction(() => {
      const existing = sqlite.prepare("SELECT id, version FROM vehicles WHERE agency_id = ? AND id = ?").get(agencyId, input.id) as { id: string; version: number } | undefined;
      const duplicate = sqlite.prepare("SELECT id FROM vehicles WHERE agency_id = ? AND upper(plate) = upper(?) AND id <> ? LIMIT 1").get(agencyId, input.plate, existing?.id ?? "") as { id: string } | undefined;
      if (duplicate) throw new DomainError("VALIDATION_FAILED", `Plate ${input.plate} already belongs to another vehicle.`, 409, { plate: "Plate number must be unique." });

      const branch = sqlite.prepare("SELECT id FROM branches WHERE agency_id = ? AND city = ? AND active = 1 LIMIT 1").get(agencyId, input.city) as { id: string } | undefined;
      if (!branch) throw new DomainError("VALIDATION_FAILED", "No active branch exists for that city.", 400, { city: "Choose a city with an active branch." });

      let ownerId: string | null = null;
      let agreementId: string | null = null;
      const now = new Date().toISOString();
      if (input.ownership === "Managed") {
        const owner = sqlite.prepare("SELECT id FROM owners WHERE agency_id = ? AND id = ? AND status = 'active' LIMIT 1").get(agencyId, input.ownerId) as { id: string } | undefined;
        if (!owner) throw new DomainError("VALIDATION_FAILED", "The selected owner is not active.", 400, { owner: "Select an active owner." });
        ownerId = owner.id;
        const agreement = input.agreement;
        if (!agreement?.effectiveFrom || !agreement.effectiveTo) throw new DomainError("VALIDATION_FAILED", "Managed vehicle terms are required.", 400, { agreement: "Enter the agreement period." });
        const nextVersion = (sqlite.prepare("SELECT coalesce(max(version), 0) + 1 AS version FROM management_agreements WHERE agency_id = ? AND owner_id = ?").get(agencyId, ownerId) as { version: number }).version;
        agreementId = `agr_${randomUUID()}`;
        sqlite.prepare(`INSERT INTO management_agreements (id, agency_id, owner_id, version, effective_from, effective_to, share_basis, owner_share_percent, owner_share_amount, expense_responsibility, payout_frequency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          agreementId, agencyId, ownerId, nextVersion, agreement.effectiveFrom, agreement.effectiveTo,
          agreement.shareMethod === "Fixed monthly" ? "fixed_monthly" : "percentage",
          agreement.shareMethod === "Percentage" ? agreement.ownerShare : null,
          agreement.shareMethod === "Fixed monthly" ? agreement.ownerShare : null,
          agreement.expenseResponsibility.toLowerCase(), agreement.payoutFrequency.toLowerCase(), now, now,
        );
      }

      const id = existing?.id ?? `veh_${randomUUID()}`;
      const values = [branch.id, ownerId, agreementId, input.plate, input.chassisNumber!, input.engineNumber!, input.make, input.model, input.year, input.category.toLowerCase(), input.color, input.transmission.toLowerCase(), input.fuel.toLowerCase(), input.status.toLowerCase().replaceAll(" ", "_"), input.ownership === "Managed" ? "managed" : "owned", input.dailyRate, input.withDriverRate!, input.status === "Archived" ? now : null, now];
      if (existing) {
        sqlite.prepare(`UPDATE vehicles SET branch_id=?, owner_id=?, agreement_id=?, plate=?, chassis_number=?, engine_number=?, make=?, model=?, year=?, category=?, color=?, transmission=?, fuel=?, status=?, ownership=?, daily_rate=?, with_driver_rate=?, archived_at=?, updated_at=?, version=version+1 WHERE agency_id=? AND id=?`).run(...values, agencyId, id);
      } else {
        sqlite.prepare(`INSERT INTO vehicles (id, agency_id, branch_id, owner_id, agreement_id, plate, chassis_number, engine_number, make, model, year, category, color, transmission, fuel, status, ownership, daily_rate, with_driver_rate, version, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`).run(id, agencyId, ...values.slice(0, -1), now, now);
      }
      sqlite.prepare("DELETE FROM vehicle_rate_rules WHERE agency_id=? AND vehicle_id=?").run(agencyId, id);
      const insertRule = sqlite.prepare(`INSERT INTO vehicle_rate_rules (id,agency_id,vehicle_id,destination_city,daily_rate,per_km_rate,minimum_days,active,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,1,?,?)`);
      for (const rule of input.rateRules ?? []) {
        insertRule.run(`vrr_${randomUUID()}`, agencyId, id, rule.destinationCity.trim(), rule.dailyRate, rule.perKmRate, rule.minimumDays, now, now);
      }
      sqlite.prepare(`INSERT INTO audit_events (id, agency_id, actor_id, action, entity_type, entity_id, metadata, occurred_at) VALUES (?, ?, ?, ?, 'vehicle', ?, ?, ?)`).run(randomUUID(), agencyId, actorId, existing ? "vehicle.updated" : "vehicle.created", id, JSON.stringify({ plate: input.plate, status: input.status }), now);
      return this.getById(agencyId, id)!;
    })();
  }
}

export const vehicleRepository = new SqliteVehicleRepository();
