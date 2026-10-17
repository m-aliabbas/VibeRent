import "server-only";

import { randomUUID } from "node:crypto";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";

export type CatalogItem = { id: string; name: string };

const defaultExpenseCategories = [
  "Maintenance",
  "Fuel",
  "Insurance",
  "Cleaning",
  "Tolls",
  "Fines",
  "Registration",
  "Tax",
  "Delivery",
  "Other",
];

function cleanName(value: unknown, label: string) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 60) {
    throw new DomainError("VALIDATION_FAILED", `${label} must be between 2 and 60 characters.`, 400, {
      name: `Enter a ${label.toLowerCase()} between 2 and 60 characters.`,
    });
  }
  return name.replace(/\b\w/g, letter => letter.toUpperCase());
}

async function ensureExpenseDefaults(agencyId: string) {
  const now = new Date().toISOString();
  for (const name of defaultExpenseCategories) {
    await execute(
      `INSERT OR IGNORE INTO expense_categories (id,agency_id,name,active,created_at,updated_at) VALUES (?,?,?,1,?,?)`,
      [`expc_${randomUUID()}`, agencyId, name, now, now],
    );
  }
}

export async function listExpenseCategories(context: RequestContext): Promise<CatalogItem[]> {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  await ensureExpenseDefaults(context.agencyId);
  return queryAll<CatalogItem>(`SELECT id,name FROM expense_categories WHERE agency_id=? AND active=1 ORDER BY name COLLATE NOCASE`, [context.agencyId]);
}

export async function createExpenseCategory(context: RequestContext, rawName: unknown): Promise<CatalogItem> {
  requireRole(context, ["agency_owner", "fleet_manager", "accountant"]);
  const name = cleanName(rawName, "Expense category");
  return inTransaction(async () => {
    await ensureExpenseDefaults(context.agencyId);
    const existing = await queryOne<CatalogItem & { active: number }>(
      `SELECT id,name,active FROM expense_categories WHERE agency_id=? AND lower(name)=lower(?) LIMIT 1`,
      [context.agencyId, name],
    );
    if (existing) {
      if (!existing.active) await execute(`UPDATE expense_categories SET active=1,updated_at=? WHERE agency_id=? AND id=?`, [new Date().toISOString(), context.agencyId, existing.id]);
      return { id: existing.id, name: existing.name };
    }
    const id = `expc_${randomUUID()}`;
    const now = new Date().toISOString();
    await execute(`INSERT INTO expense_categories (id,agency_id,name,active,created_at,updated_at) VALUES (?,?,?,1,?,?)`, [id, context.agencyId, name, now, now]);
    await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`, [randomUUID(), context.agencyId, context.userId, "expense_category.created", "expense_category", id, JSON.stringify({ name }), now]);
    return { id, name };
  });
}

export async function listAgencyCities(context: RequestContext): Promise<CatalogItem[]> {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const now = new Date().toISOString();
  await execute(
    `INSERT OR IGNORE INTO agency_cities (id,agency_id,name,active,created_at,updated_at)
     SELECT 'city_' || lower(replace(city,' ', '_')) || '_' || substr(id,-6), agency_id, city, 1, ?, ? FROM branches WHERE agency_id=?`,
    [now, now, context.agencyId],
  );
  await execute(
    `INSERT OR IGNORE INTO agency_cities (id,agency_id,name,active,created_at,updated_at)
     SELECT 'city_' || lower(replace(destination_city,' ', '_')) || '_' || substr(hex(randomblob(4)),1,8), agency_id, destination_city, 1, ?, ? FROM vehicle_rate_rules WHERE agency_id=?`,
    [now, now, context.agencyId],
  );
  return queryAll<CatalogItem>(`SELECT id,name FROM agency_cities WHERE agency_id=? AND active=1 ORDER BY name COLLATE NOCASE`, [context.agencyId]);
}

export async function createAgencyCity(context: RequestContext, rawName: unknown): Promise<CatalogItem> {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  const name = cleanName(rawName, "City");
  return inTransaction(async () => {
    const existing = await queryOne<CatalogItem & { active: number }>(
      `SELECT id,name,active FROM agency_cities WHERE agency_id=? AND lower(name)=lower(?) LIMIT 1`,
      [context.agencyId, name],
    );
    if (existing) {
      if (!existing.active) await execute(`UPDATE agency_cities SET active=1,updated_at=? WHERE agency_id=? AND id=?`, [new Date().toISOString(), context.agencyId, existing.id]);
      return { id: existing.id, name: existing.name };
    }
    const id = `city_${randomUUID()}`;
    const now = new Date().toISOString();
    await execute(`INSERT INTO agency_cities (id,agency_id,name,active,created_at,updated_at) VALUES (?,?,?,1,?,?)`, [id, context.agencyId, name, now, now]);
    await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`, [randomUUID(), context.agencyId, context.userId, "city.created", "agency_city", id, JSON.stringify({ name }), now]);
    return { id, name };
  });
}
