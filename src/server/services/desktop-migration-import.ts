import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import * as tar from "tar";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { getDatabaseTarget } from "@/db/database-target";
import type { RequestContext } from "@/server/context/request-context";
import { getPrivateFileRoot } from "@/server/desktop/runtime-paths";
import { DomainError } from "@/server/domain/errors";
import { migrationBusinessTables, previewDesktopMigration, safeStorageKey } from "@/server/services/desktop-migration-preview";

type Row = Record<string, string | number | null>;
const insertOrder = [
  "owners", "customers", "drivers", "vehicles", "management_agreements", "vehicle_rate_rules",
  "booking_drafts", "bookings", "availability_blocks", "rental_inspections", "expenses",
  "financial_transactions", "owner_payouts", "source_payouts", "private_files", "audit_events",
] as const;

function reject(message: string): never {
  throw new DomainError("VALIDATION_FAILED", message, 400);
}

function rows(database: Database.Database, table: string, agencyId: string): Row[] {
  const present = database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
  if (!present) return [];
  return database.prepare(`SELECT * FROM "${table}" WHERE agency_id=?`).all(agencyId) as Row[];
}

function number(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

async function insert(table: string, row: Row) {
  const columns = Object.keys(row);
  if (!columns.length || columns.some(column => !/^[a-z_][a-z0-9_]*$/i.test(column))) reject("The archive contains an invalid database column.");
  await execute(
    `INSERT INTO "${table}" (${columns.map(column => `"${column}"`).join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
    columns.map(column => row[column]),
  );
}

export async function importDesktopAgency(
  context: RequestContext,
  file: File,
  sourceAgencyId: string,
  confirmationAgencyId: string,
) {
  if (confirmationAgencyId !== context.agencyId) reject("Confirm the current web agency ID before importing.");
  const preview = await previewDesktopMigration(context, file);
  const source = preview.sourceAgencies.find(agency => agency.id === sourceAgencyId);
  if (!source) reject("Select an agency found in this Windows backup.");
  if (source.missingFiles) reject("The selected agency has missing attachments in this backup.");
  if (getDatabaseTarget() === "postgres" && source.counts.private_files && !process.env.PRIVATE_FILE_STORAGE_ROOT?.trim()) {
    reject("Configure durable PRIVATE_FILE_STORAGE_ROOT before importing private files on the web server.");
  }

  const directory = await mkdtemp(path.join(os.tmpdir(), "viberent-agency-import-"));
  const createdFiles: string[] = [];
  const importedAt = new Date().toISOString();
  try {
    const archive = path.join(directory, "upload.tgz");
    await writeFile(archive, Buffer.from(await file.arrayBuffer()), { flag: "wx", mode: 0o600 });
    // The same immutable File was validated by previewDesktopMigration above.
    await tar.x({ cwd: directory, file: archive, strict: true, preservePaths: false });
    const database = new Database(path.join(directory, "database.sqlite"), { readonly: true, fileMustExist: true });
    try {
      const userMap = new Map<string, string>();
      const branchMap = new Map<string, string>();
      const fileKeys = new Map<string, string>();
      const imported: Record<string, number> = {};
      const fileRoot = getPrivateFileRoot();

      // Copy files first; a failed SQL transaction removes every new copy.
      for (const row of rows(database, "private_files", sourceAgencyId)) {
        const key = String(row.storage_key ?? "");
        if (!safeStorageKey(key, sourceAgencyId)) reject("The backup contains an invalid private-file path.");
        const bytes = await readFile(path.join(directory, "private-files", key));
        if (bytes.length !== number(row.size)) reject("An attachment size does not match its database record.");
        const replacement = `${context.agencyId}/${randomUUID()}`;
        const destination = path.join(fileRoot, replacement);
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
        createdFiles.push(destination);
        fileKeys.set(key, replacement);
      }

      await inTransaction(async () => {
        const agency = await queryOne<{ id: string }>(
          "SELECT id FROM agencies WHERE id=? /*postgres:for-update*/", [context.agencyId],
        );
        if (!agency) reject("The current web agency was not found.");
        for (const table of migrationBusinessTables) {
          const result = await queryOne<{ count: number | string }>(`SELECT count(*) AS count FROM ${table} WHERE agency_id=?`, [context.agencyId]);
          if (number(result?.count) > 0) reject("This web agency already has business records. A reviewed merge is required before importing this backup.");
        }

        const existingBranches = await queryAll<{ id: string; name: string; city: string }>(
          "SELECT id,name,city FROM branches WHERE agency_id=?", [context.agencyId],
        );
        for (const sourceRow of rows(database, "branches", sourceAgencyId)) {
          const match = existingBranches.find(row => row.name.toLowerCase() === String(sourceRow.name).toLowerCase() && row.city.toLowerCase() === String(sourceRow.city).toLowerCase());
          if (match) branchMap.set(String(sourceRow.id), match.id);
          else {
            await insert("branches", { ...sourceRow, agency_id: context.agencyId });
            branchMap.set(String(sourceRow.id), String(sourceRow.id));
          }
        }
        imported.branches = branchMap.size;

        for (const table of ["agency_cities", "expense_categories"] as const) {
          let count = 0;
          for (const sourceRow of rows(database, table, sourceAgencyId)) {
            const match = await queryOne<{ id: string }>(`SELECT id FROM ${table} WHERE agency_id=? AND lower(name)=lower(?) LIMIT 1`, [context.agencyId, sourceRow.name]);
            if (!match) { await insert(table, { ...sourceRow, agency_id: context.agencyId }); count += 1; }
          }
          imported[table] = count;
        }

        for (const sourceRow of rows(database, "users", sourceAgencyId)) {
          const match = await queryOne<{ id: string }>("SELECT id FROM users WHERE agency_id=? AND lower(email)=lower(?) LIMIT 1", [context.agencyId, sourceRow.email]);
          if (match) userMap.set(String(sourceRow.id), match.id);
          else {
            await insert("users", {
              ...sourceRow, agency_id: context.agencyId,
              branch_id: sourceRow.branch_id ? branchMap.get(String(sourceRow.branch_id)) ?? null : null,
              auth_user_id: null, membership_id: null, active: 0,
            });
            userMap.set(String(sourceRow.id), String(sourceRow.id));
          }
        }
        imported.users = userMap.size;

        for (const table of insertOrder) {
          let count = 0;
          for (const sourceRow of rows(database, table, sourceAgencyId)) {
            const row: Row = { ...sourceRow, agency_id: context.agencyId };
            if ("branch_id" in row && row.branch_id) row.branch_id = branchMap.get(String(row.branch_id)) ?? reject("A source branch is missing.");
            if ("actor_id" in row && row.actor_id) row.actor_id = userMap.get(String(row.actor_id)) ?? reject("A source staff actor is missing.");
            if (table === "vehicles") row.agreement_id = null;
            if (table === "private_files") {
              row.storage_key = fileKeys.get(String(sourceRow.storage_key)) ?? reject("An attachment was not copied.");
              if (row.entity_type === "agency") row.entity_id = context.agencyId;
            }
            if (table === "audit_events" && row.entity_type === "agency") row.entity_id = context.agencyId;
            await insert(table, row);
            count += 1;
          }
          imported[table] = count;
        }

        for (const vehicle of rows(database, "vehicles", sourceAgencyId)) {
          if (vehicle.agreement_id) await execute("UPDATE vehicles SET agreement_id=? WHERE agency_id=? AND id=?", [vehicle.agreement_id, context.agencyId, vehicle.id]);
        }
        for (const [counter, reference, column] of [
          ["booking_number_counters", "bookings", "public_number"],
          ["payment_receipt_counters", "financial_transactions", "receipt_number"],
        ] as const) {
          const sourceCounter = rows(database, counter, sourceAgencyId)[0];
          const max = await queryOne<{ max: number | string | null }>(`SELECT max(${column}) AS max FROM ${reference} WHERE agency_id=?`, [context.agencyId]);
          const next = Math.max(1, number(sourceCounter?.next_number), number(max?.max) + 1);
          await execute(`INSERT INTO ${counter} (agency_id,next_number,created_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(agency_id) DO UPDATE SET next_number=?,updated_at=?`, [context.agencyId,next,importedAt,importedAt,next,importedAt]);
          imported[counter] = sourceCounter ? 1 : 0;
        }

        // A desktop WhatsApp session cannot be reused on the hosted server.
        // Preserve its settings, source agency profile, and retired tables verbatim.
        for (const table of ["agencies", "guarantors", "external_vehicles", "whatsapp_settings"] as const) {
          const sourceRows = table === "agencies"
            ? database.prepare("SELECT * FROM agencies WHERE id=?").all(sourceAgencyId) as Row[]
            : rows(database, table, sourceAgencyId);
          for (const row of sourceRows) {
            await execute("INSERT INTO legacy_import_records (id,agency_id,source_agency_id,source_table,source_id,row_json,imported_at) VALUES (?,?,?,?,?,?,?)", [
              `legacy_${randomUUID()}`, context.agencyId, sourceAgencyId, table, String(row.id ?? row.agency_id), JSON.stringify(row), importedAt,
            ]);
          }
          imported[`legacy_${table}`] = sourceRows.length;
        }
        if (context.membershipId) {
          for (const branchId of new Set(branchMap.values())) {
            await execute("INSERT INTO member_branch_access (membership_id,branch_id) VALUES (?,?) ON CONFLICT DO NOTHING", [context.membershipId, branchId]);
          }
        }
        for (const table of migrationBusinessTables) {
          const actual = await queryOne<{ count: number | string }>(`SELECT count(*) AS count FROM ${table} WHERE agency_id=?`, [context.agencyId]);
          if (number(actual?.count) !== source.counts[table]) reject(`The imported ${table} count did not match the backup.`);
        }
        await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)", [
          `aud_${randomUUID()}`, context.agencyId, context.userId, "agency.desktop_migration_imported", "agency", context.agencyId,
          JSON.stringify({ sourceAgencyId, imported }), importedAt,
        ]);
      }, { immediate: true });

      return { sourceAgencyId, targetAgencyId: context.agencyId, imported, attachments: createdFiles.length };
    } finally {
      database.close();
    }
  } catch (error) {
    await Promise.all(createdFiles.map(filePath => rm(filePath, { force: true })));
    if (error instanceof DomainError) throw error;
    throw new DomainError("VALIDATION_FAILED", "The import failed. No database records were changed. Check the archive and target data for conflicts.", 400);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
