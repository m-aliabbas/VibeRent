import "server-only";
import { randomUUID } from "node:crypto";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { DomainError } from "@/server/domain/errors";
import type { VehicleRepository } from "@/server/repositories/contracts";
import type { ManagementAgreement, Vehicle, VehicleRateRule } from "@/types/vehicle";

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
};

const selectSql = `
  SELECT v.*, b.city, o.name AS owner_name,
    a.effective_from, a.effective_to, a.share_basis,
    a.owner_share_percent, a.owner_share_amount,
    a.expense_responsibility, a.payout_frequency
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
  };
}

function listRateRules(agencyId: string, vehicleId: string): Promise<VehicleRateRule[]> {
  return queryAll<VehicleRateRule>(`SELECT destination_city AS destinationCity, daily_rate AS dailyRate, per_km_rate AS perKmRate, minimum_days AS minimumDays FROM vehicle_rate_rules WHERE agency_id=? AND vehicle_id=? AND active=1 ORDER BY destination_city`,[agencyId, vehicleId]);
}

export class DatabaseVehicleRepository implements VehicleRepository {
  async list(agencyId: string) {
    const rows=await queryAll<VehicleRow>(`${selectSql} WHERE v.agency_id = ? ORDER BY v.created_at DESC`,[agencyId]);
    return Promise.all(rows.map(async row => ({ ...mapVehicle(row), rateRules: await listRateRules(agencyId, row.id) })));
  }

  async getById(agencyId: string, id: string) {
    const row = await queryOne<VehicleRow>(`${selectSql} WHERE v.agency_id = ? AND v.id = ? LIMIT 1`,[agencyId, id]);
    return row ? { ...mapVehicle(row), rateRules: await listRateRules(agencyId, row.id) } : undefined;
  }

  async save(agencyId: string, actorId: string, input: Vehicle) {
    return inTransaction(async () => {
      const existing = await queryOne<{ id: string; version: number }>("SELECT id, version FROM vehicles WHERE agency_id = ? AND id = ?",[agencyId, input.id]);
      const duplicate = await queryOne<{ id: string }>("SELECT id FROM vehicles WHERE agency_id = ? AND upper(plate) = upper(?) AND id <> ? LIMIT 1",[agencyId, input.plate, existing?.id ?? ""]);
      if (duplicate) throw new DomainError("VALIDATION_FAILED", `Plate ${input.plate} already belongs to another vehicle.`, 409, { plate: "Plate number must be unique." });

      const branch = await queryOne<{ id: string }>("SELECT id FROM branches WHERE agency_id = ? AND city = ? AND active = 1 LIMIT 1",[agencyId, input.city]);
      if (!branch) throw new DomainError("VALIDATION_FAILED", "No active branch exists for that city.", 400, { city: "Choose a city with an active branch." });

      let ownerId: string | null = null;
      let agreementId: string | null = null;
      const now = new Date().toISOString();
      if (input.ownership === "Managed") {
        const owner = await queryOne<{ id: string }>("SELECT id FROM owners WHERE agency_id = ? AND id = ? AND status = 'active' LIMIT 1",[agencyId, input.ownerId]);
        if (!owner) throw new DomainError("VALIDATION_FAILED", "The selected owner is not active.", 400, { owner: "Select an active owner." });
        ownerId = owner.id;
        const agreement = input.agreement;
        if (!agreement?.effectiveFrom || !agreement.effectiveTo) throw new DomainError("VALIDATION_FAILED", "Managed vehicle terms are required.", 400, { agreement: "Enter the agreement period." });
        const nextVersion = (await queryOne<{ version: number }>("SELECT coalesce(max(version), 0) + 1 AS version FROM management_agreements WHERE agency_id = ? AND owner_id = ?",[agencyId, ownerId]))!.version;
        agreementId = `agr_${randomUUID()}`;
        await execute(`INSERT INTO management_agreements (id, agency_id, owner_id, version, effective_from, effective_to, share_basis, owner_share_percent, owner_share_amount, expense_responsibility, payout_frequency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,[
          agreementId, agencyId, ownerId, nextVersion, agreement.effectiveFrom, agreement.effectiveTo,
          agreement.shareMethod === "Fixed monthly" ? "fixed_monthly" : "percentage",
          agreement.shareMethod === "Percentage" ? agreement.ownerShare : null,
          agreement.shareMethod === "Fixed monthly" ? agreement.ownerShare : null,
          agreement.expenseResponsibility.toLowerCase(), agreement.payoutFrequency.toLowerCase(), now, now,
        ]);
      }

      const id = existing?.id ?? `veh_${randomUUID()}`;
      const values = [branch.id, ownerId, agreementId, input.plate, input.chassisNumber!, input.engineNumber!, input.make, input.model, input.year, input.category.toLowerCase(), input.color, input.transmission.toLowerCase(), input.fuel.toLowerCase(), input.status.toLowerCase().replaceAll(" ", "_"), input.ownership === "Managed" ? "managed" : "owned", input.dailyRate, input.withDriverRate!, input.status === "Archived" ? now : null, now];
      if (existing) {
        await execute(`UPDATE vehicles SET branch_id=?, owner_id=?, agreement_id=?, plate=?, chassis_number=?, engine_number=?, make=?, model=?, year=?, category=?, color=?, transmission=?, fuel=?, status=?, ownership=?, daily_rate=?, with_driver_rate=?, archived_at=?, updated_at=?, version=version+1 WHERE agency_id=? AND id=?`,[...values, agencyId, id]);
      } else {
        await execute(`INSERT INTO vehicles (id, agency_id, branch_id, owner_id, agreement_id, plate, chassis_number, engine_number, make, model, year, category, color, transmission, fuel, status, ownership, daily_rate, with_driver_rate, version, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,[id, agencyId, ...values.slice(0, -1), now, now]);
      }
      await execute("DELETE FROM vehicle_rate_rules WHERE agency_id=? AND vehicle_id=?",[agencyId, id]);
      for (const rule of input.rateRules ?? []) {
        await execute(`INSERT INTO vehicle_rate_rules (id,agency_id,vehicle_id,destination_city,daily_rate,per_km_rate,minimum_days,active,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,1,?,?)`,[`vrr_${randomUUID()}`, agencyId, id, rule.destinationCity.trim(), rule.dailyRate, rule.perKmRate, rule.minimumDays, now, now]);
      }
      await execute(`INSERT INTO audit_events (id, agency_id, actor_id, action, entity_type, entity_id, metadata, occurred_at) VALUES (?, ?, ?, ?, 'vehicle', ?, ?, ?)`,[randomUUID(), agencyId, actorId, existing ? "vehicle.updated" : "vehicle.created", id, JSON.stringify({ plate: input.plate, status: input.status }), now]);
      return (await this.getById(agencyId, id))!;
    });
  }
}

export const vehicleRepository = new DatabaseVehicleRepository();
