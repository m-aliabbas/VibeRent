import "server-only";

import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { execute, inTransaction, queryAll } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";

const backupFormat = "viberent-agency-sqlite-v1";
const maximumBackupBytes = 100 * 1024 * 1024;

type TableSpec = { name: string; tenantColumn: "agency_id" | "id"; conflictKey: string };

// Dependency order is also the restore order. Authentication credentials,
// sessions, WhatsApp auth state, and file bytes are intentionally excluded.
const tables: TableSpec[] = [
  { name: "agencies", tenantColumn: "id", conflictKey: "id" },
  { name: "branches", tenantColumn: "agency_id", conflictKey: "id" },
  { name: "agency_cities", tenantColumn: "agency_id", conflictKey: "id" },
  { name: "owners", tenantColumn: "agency_id", conflictKey: "id" },
  { name: "customers", tenantColumn: "agency_id", conflictKey: "id" },
  { name: "drivers", tenantColumn: "agency_id", conflictKey: "id" },
  { name: "expense_categories", tenantColumn: "agency_id", conflictKey: "id" },
  { name: "vehicles", tenantColumn: "agency_id", conflictKey: "id" },
  { name: "management_agreements", tenantColumn: "agency_id", conflictKey: "id" },
  { name: "vehicle_rate_rules", tenantColumn: "agency_id", conflictKey: "id" },
  { name: "booking_number_counters", tenantColumn: "agency_id", conflictKey: "agency_id" },
  { name: "payment_receipt_counters", tenantColumn: "agency_id", conflictKey: "agency_id" },
  { name: "booking_drafts", tenantColumn: "agency_id", conflictKey: "id" },
  { name: "bookings", tenantColumn: "agency_id", conflictKey: "id" },
  { name: "availability_blocks", tenantColumn: "agency_id", conflictKey: "id" },
  { name: "rental_inspections", tenantColumn: "agency_id", conflictKey: "id" },
  { name: "expenses", tenantColumn: "agency_id", conflictKey: "id" },
  { name: "financial_transactions", tenantColumn: "agency_id", conflictKey: "id" },
  { name: "owner_payouts", tenantColumn: "agency_id", conflictKey: "id" },
  { name: "source_payouts", tenantColumn: "agency_id", conflictKey: "id" },
  { name: "whatsapp_settings", tenantColumn: "agency_id", conflictKey: "agency_id" },
  { name: "audit_events", tenantColumn: "agency_id", conflictKey: "id" },
];

type BackupManifest = {
  format: string;
  agencyId: string;
  exportedAt: string;
  tables: Record<string, number>;
};

export async function createAgencyPortableBackup(context: RequestContext) {
  requireRole(context, ["agency_owner"]);
  const directory = await mkdtemp(path.join(os.tmpdir(), "viberent-agency-backup-"));
  const filePath = path.join(directory, `${context.agencyId}.sqlite`);
  const counts: Record<string, number> = {};
  const database = new Database(filePath);
  try {
    database.pragma("journal_mode = DELETE");
    database.exec(`
      CREATE TABLE manifest (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE table_rows (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        row_json TEXT NOT NULL
      );
      CREATE INDEX table_rows_table_name_idx ON table_rows(table_name, sequence);
    `);
    const insertRow = database.prepare("INSERT INTO table_rows (table_name,row_json) VALUES (?,?)");
    const insertRows = database.transaction((tableName: string, rows: Record<string, unknown>[]) => {
      for (const row of rows) insertRow.run(tableName, JSON.stringify(row));
    });

    for (const table of tables) {
      const rows = await queryAll<Record<string, unknown>>(
        `SELECT * FROM ${table.name} WHERE ${table.tenantColumn}=?`,
        [context.agencyId],
      );
      counts[table.name] = rows.length;
      insertRows(table.name, rows);
    }

    const manifest: BackupManifest = {
      format: backupFormat,
      agencyId: context.agencyId,
      exportedAt: new Date().toISOString(),
      tables: counts,
    };
    database.prepare("INSERT INTO manifest (key,value) VALUES ('manifest',?)").run(JSON.stringify(manifest));
    database.pragma("wal_checkpoint(TRUNCATE)");
    database.close();
    const bytes = await readFile(filePath);
    return {
      bytes,
      fileName: `viberent-${safeFilePart(context.agencyId)}-${manifest.exportedAt.slice(0, 10)}.sqlite`,
      manifest,
    };
  } finally {
    if (database.open) database.close();
    await rm(directory, { recursive: true, force: true });
  }
}

export async function restoreAgencyPortableBackup(context: RequestContext, file: File, confirmationAgencyId: string) {
  requireRole(context, ["agency_owner"]);
  if (confirmationAgencyId !== context.agencyId) {
    throw new DomainError("VALIDATION_FAILED", "Type the current agency ID to confirm this restore.", 400, { confirmationAgencyId: "Agency ID does not match." });
  }
  if (file.size <= 0 || file.size > maximumBackupBytes) {
    throw new DomainError("VALIDATION_FAILED", "Choose a VibeRent SQLite backup smaller than 100 MB.", 413, { file: "Invalid backup size." });
  }

  const directory = await mkdtemp(path.join(os.tmpdir(), "viberent-agency-restore-"));
  const filePath = path.join(directory, "restore.sqlite");
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()), { flag: "wx", mode: 0o600 });
  const database = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    if (database.pragma("integrity_check", { simple: true }) !== "ok") {
      throw new DomainError("VALIDATION_FAILED", "The SQLite backup failed its integrity check.", 400);
    }
    const rawManifest = database.prepare("SELECT value FROM manifest WHERE key='manifest' LIMIT 1").pluck().get();
    if (typeof rawManifest !== "string") throw new DomainError("VALIDATION_FAILED", "This is not a VibeRent agency backup.", 400);
    const manifest = parseManifest(rawManifest);
    if (manifest.agencyId !== context.agencyId) {
      throw new DomainError("FORBIDDEN", "This backup belongs to a different agency.", 403);
    }

    const restored: Record<string, number> = {};
    await inTransaction(async () => {
      for (const table of tables) {
        const payloads = database.prepare("SELECT row_json AS rowJson FROM table_rows WHERE table_name=? ORDER BY sequence").all(table.name) as Array<{ rowJson: string }>;
        restored[table.name] = payloads.length;
        for (const payload of payloads) {
          const row = parseRow(payload.rowJson, table, context.agencyId);
          // Break the vehicles/agreements cycle while inserting. Agreement IDs
          // are restored after both sides exist.
          const agreementId = table.name === "vehicles" ? row.agreement_id : undefined;
          if (table.name === "vehicles") row.agreement_id = null;
          await upsertRow(table, row);
          if (table.name === "vehicles" && agreementId) row.agreement_id = agreementId;
        }
      }

      const vehiclePayloads = database.prepare("SELECT row_json AS rowJson FROM table_rows WHERE table_name='vehicles' ORDER BY sequence").all() as Array<{ rowJson: string }>;
      for (const payload of vehiclePayloads) {
        const row = parseRow(payload.rowJson, tables.find(item => item.name === "vehicles")!, context.agencyId);
        if (row.agreement_id) await execute("UPDATE vehicles SET agreement_id=? WHERE agency_id=? AND id=?",[row.agreement_id, context.agencyId, row.id]);
      }
      await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",[
        `aud_${randomUUID()}`, context.agencyId, context.userId, "agency.backup_restored", "agency", context.agencyId,
        JSON.stringify({ format: manifest.format, exportedAt: manifest.exportedAt, restored }), new Date().toISOString(),
      ]);
    }, { immediate: true });

    return { manifest, restored };
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("VALIDATION_FAILED", "The backup could not be read or restored.", 400);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
}

async function upsertRow(table: TableSpec, row: Record<string, unknown>) {
  const columns = Object.keys(row);
  if (!columns.length || !columns.includes(table.conflictKey)) throw new DomainError("VALIDATION_FAILED", `Invalid ${table.name} backup row.`, 400);
  const quoted = columns.map(quoteIdentifier);
  const updates = columns.filter(column => column !== table.conflictKey).map(column => `${quoteIdentifier(column)}=excluded.${quoteIdentifier(column)}`);
  const conflict = updates.length ? `DO UPDATE SET ${updates.join(",")}` : "DO NOTHING";
  await execute(
    `INSERT INTO ${table.name} (${quoted.join(",")}) VALUES (${columns.map(() => "?").join(",")}) ON CONFLICT(${quoteIdentifier(table.conflictKey)}) ${conflict}`,
    columns.map(column => row[column]),
  );
}

function parseManifest(value: string): BackupManifest {
  const parsed = JSON.parse(value) as Partial<BackupManifest>;
  if (parsed.format !== backupFormat || typeof parsed.agencyId !== "string" || typeof parsed.exportedAt !== "string" || !parsed.tables) {
    throw new DomainError("VALIDATION_FAILED", "This backup format is not supported.", 400);
  }
  return parsed as BackupManifest;
}

function parseRow(value: string, table: TableSpec, agencyId: string): Record<string, unknown> {
  const row = JSON.parse(value) as Record<string, unknown>;
  const tenantValue = row[table.tenantColumn];
  if (tenantValue !== agencyId) throw new DomainError("FORBIDDEN", `The ${table.name} backup contains data for another agency.`, 403);
  return row;
}

function quoteIdentifier(value: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new DomainError("VALIDATION_FAILED", "The backup contains an invalid column name.", 400);
  return `"${value}"`;
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "-").slice(0, 60) || "agency";
}
