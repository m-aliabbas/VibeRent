import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { getPrivateFileRoot } from "@/server/desktop/runtime-paths";
import { readImageDimensions } from "@/server/files/image-dimensions";

export type PrivateFileDto = {
  id: string;
  entityType: string;
  entityId: string;
  originalName: string;
  mimeType: string;
  size: number;
  classification: "vehicle_photo" | "vehicle_document" | "customer_cnic_front" | "customer_cnic_back" | "guarantor_cnic_front" | "guarantor_cnic_back" | "agreement_terms_image" | "notification_document";
  createdAt: string;
  downloadUrl: string;
};

type PrivateFileRow = Omit<PrivateFileDto, "downloadUrl"> & { storageKey: string };

const storageRoot = getPrivateFileRoot();
const allowed = {
  vehicle_photo: { max: 8 * 1024 * 1024, mime: ["image/jpeg", "image/png", "image/webp"] },
  vehicle_document: { max: 12 * 1024 * 1024, mime: ["application/pdf", "image/jpeg", "image/png", "image/webp"] },
  agreement_terms_image: { max: 8 * 1024 * 1024, mime: ["image/jpeg", "image/png"] },
} as const;

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "attachment";
}

async function assertVehicle(context: RequestContext, entityId: string) {
  const row = await queryOne(`SELECT id FROM vehicles WHERE agency_id=? AND id=? AND archived_at IS NULL LIMIT 1`,[context.agencyId, entityId]);
  if (!row) throw new DomainError("NOT_FOUND", "Vehicle not found.", 404);
}

async function assertBookingDraft(context: RequestContext, entityId: string) {
  const row = await queryOne(`SELECT id FROM booking_drafts WHERE agency_id=? AND id=? LIMIT 1`,[context.agencyId, entityId]);
  if (!row) throw new DomainError("NOT_FOUND", "Booking draft not found.", 404);
}

async function assertCustomer(context: RequestContext, entityId: string) {
  const row = await queryOne(`SELECT id FROM customers WHERE agency_id=? AND id=? AND archived_at IS NULL LIMIT 1`,[context.agencyId, entityId]);
  if (!row) throw new DomainError("NOT_FOUND", "Customer not found.", 404);
}

async function assertBooking(context: RequestContext, entityId: string) {
  const row = await queryOne(`SELECT id FROM bookings WHERE agency_id=? AND id=? LIMIT 1`,[context.agencyId, entityId]);
  if (!row) throw new DomainError("NOT_FOUND", "Booking not found.", 404);
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

export async function listVehicleFiles(context: RequestContext, vehicleId: string): Promise<PrivateFileDto[]> {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  await assertVehicle(context, vehicleId);
  const rows = await queryAll<PrivateFileRow>(`SELECT id,entity_type AS entityType,entity_id AS entityId,storage_key AS storageKey,original_name AS originalName,mime_type AS mimeType,size,classification,created_at AS createdAt FROM private_files WHERE agency_id=? AND entity_type='vehicle' AND entity_id=? AND status='ready' ORDER BY created_at DESC`,[context.agencyId, vehicleId]);
  return rows.map(toDto);
}

export async function uploadVehicleFile(context: RequestContext, vehicleId: string, classification: string, file: File): Promise<PrivateFileDto> {
  requireRole(context, ["agency_owner", "fleet_manager"]);
  await assertVehicle(context, vehicleId);
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
    await inTransaction(async () => {
      await execute(`INSERT INTO private_files (id,agency_id,entity_type,entity_id,storage_key,original_name,mime_type,size,classification,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'ready',?,?)`,[id, context.agencyId, "vehicle", vehicleId, storageKey, safeName(file.name), file.type, file.size, classification, now, now]);
      await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,[randomUUID(), context.agencyId, context.userId, "vehicle.file_uploaded", "vehicle", vehicleId, JSON.stringify({ fileId: id, classification, mimeType: file.type, size: file.size }), now]);
    },{immediate:true});
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    await unlink(absolutePath).catch(() => undefined);
    throw error;
  }
  return { id, entityType: "vehicle", entityId: vehicleId, originalName: safeName(file.name), mimeType: file.type, size: file.size, classification: classification as PrivateFileDto["classification"], createdAt: now, downloadUrl: `/api/v1/files/${id}` };
}

export async function uploadAgreementTermsImage(context: RequestContext, file: File): Promise<PrivateFileDto> {
  requireRole(context, ["agency_owner", "fleet_manager"]);
  const rule = allowed.agreement_terms_image;
  if (!rule.mime.includes(file.type as never)) throw new DomainError("VALIDATION_FAILED", "This image type is not supported.", 415, { file: "Use a JPG or PNG image." });
  if (file.size <= 0 || file.size > rule.max) throw new DomainError("VALIDATION_FAILED", "Image must be smaller than 8 MB.", 413, { file: "Choose a smaller image." });

  const bytes = Buffer.from(await file.arrayBuffer());
  readImageDimensions(bytes);
  const id = `file_${randomUUID()}`;
  const storageKey = `${context.agencyId}/${randomUUID()}`;
  const absolutePath = path.join(storageRoot, storageKey);
  const temporaryPath = `${absolutePath}.uploading`;
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
  await rename(temporaryPath, absolutePath);
  const now = new Date().toISOString();
  try {
    await inTransaction(async () => {
      await execute(`INSERT INTO private_files (id,agency_id,entity_type,entity_id,storage_key,original_name,mime_type,size,classification,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'ready',?,?)`,[id, context.agencyId, "agency", context.agencyId, storageKey, safeName(file.name), file.type, file.size, "agreement_terms_image", now, now]);
      await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,[randomUUID(), context.agencyId, context.userId, "agreement.terms_image_uploaded", "agency", context.agencyId, JSON.stringify({ fileId: id, mimeType: file.type, size: file.size }), now]);
    },{immediate:true});
  } catch (error) {
    await unlink(absolutePath).catch(() => undefined);
    throw error;
  }
  return { id, entityType: "agency", entityId: context.agencyId, originalName: safeName(file.name), mimeType: file.type, size: file.size, classification: "agreement_terms_image", createdAt: now, downloadUrl: `/api/v1/files/${id}` };
}

export async function readPrivateFile(context: RequestContext, id: string) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const row = await queryOne<PrivateFileRow>(`SELECT id,entity_type AS entityType,entity_id AS entityId,storage_key AS storageKey,original_name AS originalName,mime_type AS mimeType,size,classification,created_at AS createdAt FROM private_files WHERE agency_id=? AND id=? AND status='ready' LIMIT 1`,[context.agencyId, id]);
  if (!row) throw new DomainError("NOT_FOUND", "File not found.", 404);
  if (row.entityType === "vehicle") await assertVehicle(context, row.entityId);
  if (row.entityType === "booking_draft") await assertBookingDraft(context, row.entityId);
  if (row.entityType === "customer") await assertCustomer(context, row.entityId);
  if (row.entityType === "booking") await assertBooking(context, row.entityId);
  if (row.entityType === "agency" && row.entityId !== context.agencyId) throw new DomainError("NOT_FOUND", "File not found.", 404);
  const absolutePath = path.resolve(storageRoot, row.storageKey);
  if (!absolutePath.startsWith(`${storageRoot}${path.sep}`)) throw new DomainError("INTERNAL_ERROR", "File storage path is invalid.", 500);
  try { return { file: toDto(row), bytes: await readFile(absolutePath) }; }
  catch { throw new DomainError("NOT_FOUND", "The stored file is unavailable.", 404); }
}

/**
 * Stores bytes produced by the server itself (rendered receipts and agreements) without a user
 * session. Callers are background jobs that already scoped the work to `agencyId`.
 */
export async function storeSystemFile(input: { agencyId: string; entityType: string; entityId: string; bytes: Buffer; originalName: string; mimeType: string; classification: PrivateFileDto["classification"] }) {
  const id = `file_${randomUUID()}`;
  const storageKey = `${input.agencyId}/${randomUUID()}`;
  const absolutePath = path.join(storageRoot, storageKey);
  const temporaryPath = `${absolutePath}.uploading`;
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(temporaryPath, input.bytes, { flag: "wx", mode: 0o600 });
  await rename(temporaryPath, absolutePath);
  const now = new Date().toISOString();
  try {
    await execute(`INSERT INTO private_files (id,agency_id,entity_type,entity_id,storage_key,original_name,mime_type,size,classification,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'ready',?,?)`,[id, input.agencyId, input.entityType, input.entityId, storageKey, safeName(input.originalName), input.mimeType, input.bytes.byteLength, input.classification, now, now]);
  } catch (error) {
    await unlink(absolutePath).catch(() => undefined);
    throw error;
  }
  return id;
}

/** Reads a stored file for a background job. Tenant scope comes from the caller's `agencyId`. */
export async function readSystemFile(agencyId: string, id: string) {
  const row = await queryOne<{ storageKey: string }>(`SELECT storage_key AS storageKey FROM private_files WHERE agency_id=? AND id=? AND status='ready' LIMIT 1`,[agencyId, id]);
  if (!row) throw new Error("The stored file is unavailable.");
  const absolutePath = path.resolve(storageRoot, row.storageKey);
  if (!absolutePath.startsWith(`${storageRoot}${path.sep}`)) throw new Error("File storage path is invalid.");
  return readFile(absolutePath);
}
