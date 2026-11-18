import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { getPrivateFileRoot } from "@/server/desktop/runtime-paths";

/**
 * CNIC and driving-license images for customers and guarantors. Each side is one slot: a new upload
 * replaces the previous image (kept as `replaced` for history), and staff can remove a slot.
 */
export const personDocumentSlots = ["cnic_front", "cnic_back", "license_front", "license_back"] as const;
export type PersonDocumentSlot = (typeof personDocumentSlots)[number];
/** `customer_draft` holds images picked while a new customer is being created (id `cnd_<uuid>`). */
export type PersonDocumentOwner = "customer" | "customer_draft" | "guarantor";

export type PersonDocumentDto = { id: string; slot: PersonDocumentSlot; originalName: string; mimeType: string; size: number; createdAt: string; url: string };
export type PersonDocumentsDto = { owner: PersonDocumentOwner; ownerId: string; documents: Record<PersonDocumentSlot, PersonDocumentDto | null> };

const MAX_BYTES = 10 * 1024 * 1024;
const MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const storageRoot = getPrivateFileRoot();

const prefix = (owner: PersonDocumentOwner) => owner === "guarantor" ? "guarantor" : "customer";
const classification = (owner: PersonDocumentOwner, slot: PersonDocumentSlot) => `${prefix(owner)}_${slot}`;
const classificationsFor = (owner: PersonDocumentOwner) => personDocumentSlots.map(slot => classification(owner, slot));
const slotOf = (value: string) => personDocumentSlots.find(slot => value.endsWith(`_${slot}`))!;

export function isPersonDocumentOwner(value: unknown): value is PersonDocumentOwner {
  return value === "customer" || value === "customer_draft" || value === "guarantor";
}

export function isPersonDocumentSlot(value: unknown): value is PersonDocumentSlot {
  return typeof value === "string" && (personDocumentSlots as readonly string[]).includes(value);
}

async function assertOwner(context: RequestContext, owner: PersonDocumentOwner, id: string) {
  if (owner === "customer_draft") {
    if (!/^cnd_[0-9a-f-]{36}$/.test(id)) throw new DomainError("VALIDATION_FAILED", "The customer document session is invalid.", 400);
    return;
  }
  const table = owner === "customer" ? "customers" : "guarantors";
  const row = await queryOne(`SELECT id FROM ${table} WHERE agency_id=? AND id=? AND archived_at IS NULL LIMIT 1`, [context.agencyId, id]);
  if (!row) throw new DomainError("NOT_FOUND", owner === "customer" ? "Customer not found." : "Guarantor not found.", 404);
}

type Row = { id: string; classification: string; originalName: string; mimeType: string; size: number; createdAt: string };

/** Latest image per slot, without a role check. Callers must already have authorized the agency scope. */
export async function readPersonDocuments(agencyId: string, owner: PersonDocumentOwner, id: string): Promise<PersonDocumentsDto> {
  const types = classificationsFor(owner);
  const rows = await queryAll<Row>(`SELECT id,classification,original_name AS originalName,mime_type AS mimeType,size,created_at AS createdAt
    FROM private_files WHERE agency_id=? AND entity_type=? AND entity_id=? AND status='ready' AND classification IN (?,?,?,?)
    ORDER BY created_at DESC`, [agencyId, owner, id, ...types]);
  const documents = Object.fromEntries(personDocumentSlots.map(slot => [slot, null])) as PersonDocumentsDto["documents"];
  for (const row of rows) {
    const slot = slotOf(row.classification);
    if (!documents[slot]) documents[slot] = { id: row.id, slot, originalName: row.originalName, mimeType: row.mimeType, size: row.size, createdAt: row.createdAt, url: `/api/v1/files/${row.id}` };
  }
  return { owner, ownerId: id, documents };
}

export async function listPersonDocuments(context: RequestContext, owner: PersonDocumentOwner, id: string) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  await assertOwner(context, owner, id);
  return readPersonDocuments(context.agencyId, owner, id);
}

export async function uploadPersonDocument(context: RequestContext, owner: PersonDocumentOwner, id: string, slot: PersonDocumentSlot, file: File) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  if (!isPersonDocumentOwner(owner)) throw new DomainError("VALIDATION_FAILED", "Choose a customer or guarantor.", 400);
  if (!isPersonDocumentSlot(slot)) throw new DomainError("VALIDATION_FAILED", "Choose the CNIC or license side.", 400);
  await assertOwner(context, owner, id);
  if (!MIME_TYPES.includes(file.type)) throw new DomainError("VALIDATION_FAILED", "Use a JPG, PNG, or WebP image.", 415, { file: "Unsupported image type." });
  if (file.size <= 0 || file.size > MAX_BYTES) throw new DomainError("VALIDATION_FAILED", "The image must be 10 MB or smaller.", 413, { file: "Choose a smaller image." });

  const fileId = `file_${randomUUID()}`;
  const type = classification(owner, slot);
  const storageKey = `${context.agencyId}/${owner}/${id}/${slot}-${randomUUID()}`;
  const absolutePath = path.join(storageRoot, storageKey);
  const temporaryPath = `${absolutePath}.uploading`;
  await mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
  await writeFile(temporaryPath, Buffer.from(await file.arrayBuffer()), { flag: "wx", mode: 0o600 });
  await rename(temporaryPath, absolutePath);
  const name = file.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || `${slot}.jpg`;
  const now = new Date().toISOString();
  try {
    await inTransaction(async () => {
      await execute(`UPDATE private_files SET status='replaced',updated_at=? WHERE agency_id=? AND entity_type=? AND entity_id=? AND classification=? AND status='ready'`, [now, context.agencyId, owner, id, type]);
      await execute(`INSERT INTO private_files (id,agency_id,entity_type,entity_id,storage_key,original_name,mime_type,size,classification,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'ready',?,?)`, [fileId, context.agencyId, owner, id, storageKey, name, file.type, file.size, type, now, now]);
      await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`, [randomUUID(), context.agencyId, context.userId, `${prefix(owner)}.document_uploaded`, owner, id, JSON.stringify({ fileId, slot }), now]);
    }, { immediate: true });
  } catch (error) {
    await unlink(absolutePath).catch(() => undefined);
    throw error;
  }
  return readPersonDocuments(context.agencyId, owner, id);
}

export async function removePersonDocument(context: RequestContext, owner: PersonDocumentOwner, id: string, fileId: string) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  await assertOwner(context, owner, id);
  const types = classificationsFor(owner);
  const now = new Date().toISOString();
  await inTransaction(async () => {
    const result = await execute(`UPDATE private_files SET status='removed',updated_at=? WHERE agency_id=? AND id=? AND entity_type=? AND entity_id=? AND status='ready' AND classification IN (?,?,?,?)`, [now, context.agencyId, fileId, owner, id, ...types]);
    if (!result.changes) throw new DomainError("NOT_FOUND", "Document not found.", 404);
    await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`, [randomUUID(), context.agencyId, context.userId, `${prefix(owner)}.document_removed`, owner, id, JSON.stringify({ fileId }), now]);
  }, { immediate: true });
  return readPersonDocuments(context.agencyId, owner, id);
}

/** Moves images picked for a new customer onto the saved customer. */
export async function attachCustomerDocumentDraft(context: RequestContext, draftId: string, customerId: string, now: string) {
  if (!/^cnd_[0-9a-f-]{36}$/.test(draftId)) throw new DomainError("VALIDATION_FAILED", "The customer document session is invalid.", 400);
  await execute(`UPDATE private_files SET entity_type='customer',entity_id=?,updated_at=?
    WHERE agency_id=? AND entity_type='customer_draft' AND entity_id=? AND classification IN ('customer_license_front','customer_license_back') AND status='ready'`, [customerId, now, context.agencyId, draftId]);
}
