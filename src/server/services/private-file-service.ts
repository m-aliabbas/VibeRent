import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { sqlite } from "@/db/connection";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { getPrivateFileRoot } from "@/server/desktop/runtime-paths";

export type PrivateFileDto = {
  id: string;
  entityType: string;
  entityId: string;
  originalName: string;
  mimeType: string;
  size: number;
  classification: "vehicle_photo" | "vehicle_document" | "customer_cnic_front" | "customer_cnic_back";
  createdAt: string;
  downloadUrl: string;
};

type PrivateFileRow = Omit<PrivateFileDto, "downloadUrl"> & { storageKey: string };

const storageRoot = getPrivateFileRoot();
const allowed = {
  vehicle_photo: { max: 8 * 1024 * 1024, mime: ["image/jpeg", "image/png", "image/webp"] },
  vehicle_document: { max: 12 * 1024 * 1024, mime: ["application/pdf", "image/jpeg", "image/png", "image/webp"] },
} as const;

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "attachment";
}

function assertVehicle(context: RequestContext, entityId: string) {
  const row = sqlite.prepare(`SELECT id FROM vehicles WHERE agency_id=? AND id=? AND archived_at IS NULL LIMIT 1`).get(context.agencyId, entityId);
  if (!row) throw new DomainError("NOT_FOUND", "Vehicle not found.", 404);
}

function assertBookingDraft(context: RequestContext, entityId: string) {
  const row = sqlite.prepare(`SELECT id FROM booking_drafts WHERE agency_id=? AND id=? LIMIT 1`).get(context.agencyId, entityId);
  if (!row) throw new DomainError("NOT_FOUND", "Booking draft not found.", 404);
}

function assertCustomer(context: RequestContext, entityId: string) {
  const row = sqlite.prepare(`SELECT id FROM customers WHERE agency_id=? AND id=? AND archived_at IS NULL LIMIT 1`).get(context.agencyId, entityId);
  if (!row) throw new DomainError("NOT_FOUND", "Customer not found.", 404);
}

function toDto(row: PrivateFileRow): PrivateFileDto {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    classification: row.classification,
    createdAt: row.createdAt,
    downloadUrl: `/api/v1/files/${row.id}`,
  };
}

export function listVehicleFiles(context: RequestContext, vehicleId: string): PrivateFileDto[] {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  assertVehicle(context, vehicleId);
  const rows = sqlite.prepare(`SELECT id,entity_type AS entityType,entity_id AS entityId,storage_key AS storageKey,original_name AS originalName,mime_type AS mimeType,size,classification,created_at AS createdAt FROM private_files WHERE agency_id=? AND entity_type='vehicle' AND entity_id=? AND status='ready' ORDER BY created_at DESC`)
    .all(context.agencyId, vehicleId) as PrivateFileRow[];
  return rows.map(toDto);
}

export async function uploadVehicleFile(context: RequestContext, vehicleId: string, classification: string, file: File): Promise<PrivateFileDto> {
  requireRole(context, ["agency_owner", "fleet_manager"]);
  assertVehicle(context, vehicleId);
  if (!(classification in allowed)) throw new DomainError("VALIDATION_FAILED", "Choose a valid attachment type.", 400);
  const rule = allowed[classification as keyof typeof allowed];
  if (!rule.mime.includes(file.type as never)) throw new DomainError("VALIDATION_FAILED", "This file type is not supported.", 415, { file: "Use PDF, JPG, PNG, or WebP as appropriate." });
  if (file.size <= 0 || file.size > rule.max) throw new DomainError("VALIDATION_FAILED", `File must be smaller than ${Math.round(rule.max / 1024 / 1024)} MB.`, 413, { file: "Choose a smaller file." });

  const id = `file_${randomUUID()}`;
  const storageKey = `${context.agencyId}/${randomUUID()}`;
  const absolutePath = path.join(storageRoot, storageKey);
  const temporaryPath = `${absolutePath}.uploading`;
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(temporaryPath, Buffer.from(await file.arrayBuffer()), { flag: "wx", mode: 0o600 });
  await rename(temporaryPath, absolutePath);
  const now = new Date().toISOString();
  try {
    sqlite.transaction(() => {
      sqlite.prepare(`INSERT INTO private_files (id,agency_id,entity_type,entity_id,storage_key,original_name,mime_type,size,classification,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'ready',?,?)`)
        .run(id, context.agencyId, "vehicle", vehicleId, storageKey, safeName(file.name), file.type, file.size, classification, now, now);
      sqlite.prepare(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`)
        .run(randomUUID(), context.agencyId, context.userId, "vehicle.file_uploaded", "vehicle", vehicleId, JSON.stringify({ fileId: id, classification, mimeType: file.type, size: file.size }), now);
    })();
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    await unlink(absolutePath).catch(() => undefined);
    throw error;
  }
  return { id, entityType: "vehicle", entityId: vehicleId, originalName: safeName(file.name), mimeType: file.type, size: file.size, classification: classification as PrivateFileDto["classification"], createdAt: now, downloadUrl: `/api/v1/files/${id}` };
}

export async function readPrivateFile(context: RequestContext, id: string) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const row = sqlite.prepare(`SELECT id,entity_type AS entityType,entity_id AS entityId,storage_key AS storageKey,original_name AS originalName,mime_type AS mimeType,size,classification,created_at AS createdAt FROM private_files WHERE agency_id=? AND id=? AND status='ready' LIMIT 1`)
    .get(context.agencyId, id) as PrivateFileRow | undefined;
  if (!row) throw new DomainError("NOT_FOUND", "File not found.", 404);
  if (row.entityType === "vehicle") assertVehicle(context, row.entityId);
  if (row.entityType === "booking_draft") assertBookingDraft(context, row.entityId);
  if (row.entityType === "customer") assertCustomer(context, row.entityId);
  const absolutePath = path.resolve(storageRoot, row.storageKey);
  if (!absolutePath.startsWith(`${storageRoot}${path.sep}`)) throw new DomainError("INTERNAL_ERROR", "File storage path is invalid.", 500);
  try { return { file: toDto(row), bytes: await readFile(absolutePath) }; }
  catch { throw new DomainError("NOT_FOUND", "The stored file is unavailable.", 404); }
}
