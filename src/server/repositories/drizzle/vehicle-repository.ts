import "server-only";
import { randomUUID } from "node:crypto";
import { sqlite } from "@/db/connection";
import { DomainError } from "@/server/domain/errors";
import type { VehicleRepository } from "@/server/repositories/contracts";
import type { ManagementAgreement, Vehicle } from "@/types/vehicle";

type VehicleRow = {
  id: string;
  branch_id: string;
  plate: string;
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
    make: row.make,
    model: row.model,
    year: row.year,
    category: (row.category === "suv" ? "SUV" : title(row.category)) as Vehicle["category"],
    city: row.city as Vehicle["city"],
    ownership: row.ownership === "managed" ? "Managed" : "Own",
    status: title(row.status) as Vehicle["status"],
    dailyRate: row.daily_rate,
    color: row.color,
    transmission: title(row.transmission) as Vehicle["transmission"],
    fuel: title(row.fuel) as Vehicle["fuel"],
    owner: row.owner_name ?? undefined,
    agreement: mapAgreement(row),
  };
}

export class SqliteVehicleRepository implements VehicleRepository {
  list(agencyId: string) {
    return (sqlite.prepare(`${selectSql} WHERE v.agency_id = ? ORDER BY v.created_at DESC`).all(agencyId) as VehicleRow[]).map(mapVehicle);
  }

  getById(agencyId: string, id: string) {
    const row = sqlite.prepare(`${selectSql} WHERE v.agency_id = ? AND v.id = ? LIMIT 1`).get(agencyId, id) as VehicleRow | undefined;
    return row ? mapVehicle(row) : undefined;
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
        const owner = sqlite.prepare("SELECT id FROM owners WHERE agency_id = ? AND name = ? AND status = 'active' LIMIT 1").get(agencyId, input.owner) as { id: string } | undefined;
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
      const values = [branch.id, ownerId, agreementId, input.plate, input.make, input.model, input.year, input.category.toLowerCase(), input.color, input.transmission.toLowerCase(), input.fuel.toLowerCase(), input.status.toLowerCase().replaceAll(" ", "_"), input.ownership === "Managed" ? "managed" : "owned", input.dailyRate, input.status === "Archived" ? now : null, now];
      if (existing) {
        sqlite.prepare(`UPDATE vehicles SET branch_id=?, owner_id=?, agreement_id=?, plate=?, make=?, model=?, year=?, category=?, color=?, transmission=?, fuel=?, status=?, ownership=?, daily_rate=?, archived_at=?, updated_at=?, version=version+1 WHERE agency_id=? AND id=?`).run(...values, agencyId, id);
      } else {
        sqlite.prepare(`INSERT INTO vehicles (id, agency_id, branch_id, owner_id, agreement_id, plate, make, model, year, category, color, transmission, fuel, status, ownership, daily_rate, version, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`).run(id, agencyId, ...values.slice(0, -1), now, now);
      }
      sqlite.prepare(`INSERT INTO audit_events (id, agency_id, actor_id, action, entity_type, entity_id, metadata, occurred_at) VALUES (?, ?, ?, ?, 'vehicle', ?, ?, ?)`).run(randomUUID(), agencyId, actorId, existing ? "vehicle.updated" : "vehicle.created", id, JSON.stringify({ plate: input.plate, status: input.status }), now);
      return this.getById(agencyId, id)!;
    })();
  }
}

export const vehicleRepository = new SqliteVehicleRepository();
