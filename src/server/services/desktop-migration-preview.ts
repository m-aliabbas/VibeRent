import "server-only";

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import * as tar from "tar";
import { queryAll, queryOne } from "@/db/query";
import { getDatabaseTarget } from "@/db/database-target";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";

const maxArchiveBytes = 100 * 1024 * 1024;
const maxExpandedBytes = 500 * 1024 * 1024;
const maxEntries = 10_000;

export const operationalTables = [
  "branches", "agency_cities", "owners", "customers", "drivers", "expense_categories",
  "vehicles", "management_agreements", "vehicle_rate_rules", "booking_number_counters",
  "payment_receipt_counters", "booking_drafts", "bookings", "availability_blocks",
  "rental_inspections", "recurring_expenses", "expenses", "vehicle_service_records", "financial_transactions", "owner_payouts",
  "source_payouts", "private_files", "whatsapp_settings", "audit_events", "users",
] as const;

export const migrationBusinessTables = [
  "owners", "customers", "drivers", "vehicles", "management_agreements", "vehicle_rate_rules",
  "booking_drafts", "bookings", "availability_blocks", "rental_inspections", "recurring_expenses", "expenses",
  "vehicle_service_records", "financial_transactions", "owner_payouts", "source_payouts", "private_files",
] as const;

const collisionKeys = [
  { table: "vehicles", column: "plate" },
  { table: "customers", column: "cnic_normalized" },
  { table: "drivers", column: "cnic_normalized" },
  { table: "bookings", column: "public_number" },
  { table: "financial_transactions", column: "receipt_number" },
  { table: "users", column: "email" },
] as const;

type ArchiveManifest = {
  schemaVersion: number;
  application: string;
  databaseFile: string;
  databaseSha256: string;
  includesPrivateFiles: boolean;
};

function invalid(message: string): never {
  throw new DomainError("VALIDATION_FAILED", message, 400);
}

export function safeStorageKey(key: string, agencyId: string) {
  return key.startsWith(`${agencyId}/`)
    && key.split("/").every(segment => segment !== "" && segment !== "." && segment !== "..");
}

export async function previewDesktopMigration(context: RequestContext, file: File) {
  requireRole(context, ["agency_owner"]);
  if (!file.name.endsWith(".viberent-backup.tgz") || file.size <= 0 || file.size > maxArchiveBytes) {
    invalid("Choose a Windows VibeRent backup archive smaller than 100 MB.");
  }

  const directory = await mkdtemp(path.join(os.tmpdir(), "viberent-migration-preview-"));
  const archivePath = path.join(directory, "upload.tgz");
  try {
    await writeFile(archivePath, Buffer.from(await file.arrayBuffer()), { flag: "wx", mode: 0o600 });
    const names = new Set<string>();
    let expandedBytes = 0;
    try {
      await tar.t({
        file: archivePath,
        onReadEntry(entry) {
          const name = entry.path;
          if (
            path.posix.normalize(name) !== name || name.startsWith("/") || name.includes("\\")
            || names.has(name) || !["File", "Directory"].includes(entry.type)
            || !(name === "manifest.json" || name === "database.sqlite" || name === "private-files" || name.startsWith("private-files/"))
          ) invalid("The archive contains an unsafe or unexpected entry.");
          names.add(name);
          expandedBytes += entry.size || 0;
          if (names.size > maxEntries || expandedBytes > maxExpandedBytes) invalid("The archive is too large to inspect safely.");
          entry.resume();
        },
      });
    } catch (error) {
      if (error instanceof DomainError) throw error;
      invalid("The Windows backup archive could not be read.");
    }
    if (!names.has("manifest.json") || !names.has("database.sqlite")) invalid("The archive is missing its manifest or database.");
    await tar.x({ cwd: directory, file: archivePath, strict: true, preservePaths: false });
    // tar extracts at directory level; the archive is isolated in this private temporary directory.
    const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")) as ArchiveManifest;
    if (manifest.schemaVersion !== 1 || manifest.application !== "VibeRent" || manifest.databaseFile !== "database.sqlite") {
      invalid("This Windows backup format is not supported.");
    }
    const dbPath = path.join(directory, "database.sqlite");
    const bytes = await readFile(dbPath);
    if (createHash("sha256").update(bytes).digest("hex") !== manifest.databaseSha256) invalid("The database checksum does not match the manifest.");

    const database = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      if (database.pragma("integrity_check", { simple: true }) !== "ok") invalid("The backup database failed its integrity check.");
      const sourceTables = new Set((database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(row => row.name));
      if (!sourceTables.has("agencies")) invalid("The backup has no agencies table.");
      const agencies = database.prepare("SELECT id,name FROM agencies ORDER BY name").all() as Array<{ id: string; name: string }>;
      const source = agencies.map(agency => {
        const counts: Record<string, number> = {};
        for (const table of operationalTables) {
          counts[table] = sourceTables.has(table)
            ? (database.prepare(`SELECT count(*) AS count FROM "${table}" WHERE agency_id=?`).get(agency.id) as { count: number }).count
            : 0;
        }
        const legacyGuarantors = sourceTables.has("guarantors")
          ? (database.prepare("SELECT count(*) AS count FROM guarantors WHERE agency_id=?").get(agency.id) as { count: number }).count : 0;
        const fileRows = sourceTables.has("private_files")
          ? database.prepare("SELECT storage_key AS storageKey FROM private_files WHERE agency_id=?").all(agency.id) as Array<{ storageKey: string }> : [];
        const missingFiles = fileRows.filter(row => !safeStorageKey(row.storageKey, agency.id) || !names.has(`private-files/${row.storageKey}`)).length;
        return { id: agency.id, name: agency.name, counts, legacyGuarantors, missingFiles, collisions: {} as Record<string, number> };
      });
      for (const key of collisionKeys) {
        const targetValues = new Set((await queryAll<{ value: string | number }>(
          `SELECT ${key.column} AS value FROM ${key.table} WHERE agency_id=? AND ${key.column} IS NOT NULL`,
          [context.agencyId],
        )).map(row => String(row.value).toLowerCase()));
        if (!sourceTables.has(key.table)) continue;
        const sourceQuery = database.prepare(`SELECT ${key.column} AS value FROM ${key.table} WHERE agency_id=? AND ${key.column} IS NOT NULL`);
        for (const agency of source) {
          agency.collisions[`${key.table}.${key.column}`] = (sourceQuery.all(agency.id) as Array<{ value: string | number }>)
            .filter(row => targetValues.has(String(row.value).toLowerCase())).length;
        }
      }
      const targetCounts: Record<string, number> = {};
      for (const table of operationalTables) {
        const row = await queryOne<{ count: number | string }>(`SELECT count(*) AS count FROM ${table} WHERE agency_id=?`, [context.agencyId]);
        targetCounts[table] = Number(row?.count ?? 0);
      }
      const targetHasBusinessData = migrationBusinessTables.some(table => targetCounts[table] > 0);
      return {
        valid: true,
        sourceAgencies: source,
        targetAgencyId: context.agencyId,
        targetCounts,
        targetHasBusinessData,
        fileStorageReady: getDatabaseTarget() !== "postgres" || Boolean(process.env.PRIVATE_FILE_STORAGE_ROOT?.trim()),
        message: targetHasBusinessData
          ? "This web agency already has business data. Import is disabled until those records can be merged safely."
          : "Select one source agency to import. The current web login and organization stay in place; source staff are retained as historical records and need invitations for web access.",
      };
    } finally {
      database.close();
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    invalid("The Windows backup could not be inspected.");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
