import "server-only";

import { createHash } from "node:crypto";
import { queryOne } from "@/db/query";
import type { RequestContext } from "@/server/context/request-context";

const tables = ["bookings", "vehicles", "customers", "owners", "financial_transactions", "expenses", "drivers", "guarantors", "external_vehicles", "availability_blocks"] as const;

/**
 * An opaque cursor over the agency's latest writes. It moves on any insert, update or delete in the
 * operational tables (latest `updated_at` plus row counts) and on any audited action.
 */
export async function getAgencyChangeCursor(context: RequestContext) {
  const columns = [
    ...tables.flatMap(table => [
      `(SELECT max(updated_at) FROM ${table} WHERE agency_id=?) AS ${table}_at`,
      `(SELECT count(*) FROM ${table} WHERE agency_id=?) AS ${table}_n`,
    ]),
    "(SELECT max(occurred_at) FROM audit_events WHERE agency_id=?) AS audit_at",
  ];
  const params = Array(tables.length * 2 + 1).fill(context.agencyId);
  const row = await queryOne<Record<string, unknown>>(`SELECT ${columns.join(",")}`, params);
  const fingerprint = Object.values(row ?? {}).map(value => String(value ?? "")).join("|");
  return {
    cursor: createHash("sha256").update(fingerprint).digest("hex").slice(0, 24),
    checkedAt: new Date().toISOString(),
  };
}
