import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { sqlite } from "@/db/connection";
import { requireRole } from "@/server/auth/authorize";
import { MAX_CNIC_IMAGE_BYTES } from "@/server/cnic-ocr/cnic-ocr-service";
import { extractStoredCnicPair } from "@/server/cnic-ocr/stored-cnic-pair";
import { SUPPORTED_CNIC_IMAGE_MIME_TYPES, type CnicImageMimeType, type CnicOcrResult } from "@/server/cnic-ocr/types";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { getPrivateFileRoot } from "@/server/desktop/runtime-paths";
import type { BookingCnicFileDto, BookingCnicIntakeDto, CnicSide } from "@/server/services/booking-cnic-service";

export type CustomerCnicTarget =
  | { type: "customer"; id: string }
  | { type: "draft"; id: string };

type FileRow = {
  id: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  size: number;
  ocrStatus: BookingCnicFileDto["ocrStatus"] | null;
  ocrResult: string | null;
  createdAt: string;
};

const imageTypes = SUPPORTED_CNIC_IMAGE_MIME_TYPES as readonly string[];
const storageRoot = getPrivateFileRoot();
const emptyResult: CnicOcrResult = { name: null, dob: null, address: null, expiry: null, cnic_no: null };

function entityType(target: CustomerCnicTarget) {
  return target.type === "customer" ? "customer" : "customer_draft";
}

function assertTarget(context: RequestContext, target: CustomerCnicTarget) {
  if (target.type === "draft") {
    if (!/^cnd_[0-9a-f-]{36}$/.test(target.id)) throw new DomainError("VALIDATION_FAILED", "The customer document session is invalid.", 400);
    return;
  }
  const customer = sqlite.prepare("SELECT id FROM customers WHERE agency_id=? AND id=? AND archived_at IS NULL LIMIT 1")
    .get(context.agencyId, target.id);
  if (!customer) throw new DomainError("NOT_FOUND", "Customer not found.", 404);
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "cnic-image";
}

function parseResult(value: string | null): CnicOcrResult {
  if (!value) return emptyResult;
  try {
    const parsed = JSON.parse(value) as Partial<CnicOcrResult> & { cnic?: string | null; id_expiry?: string | null };
    return {
      name: parsed.name ?? null,
      dob: parsed.dob ?? null,
      address: parsed.address ?? null,
      expiry: parsed.expiry ?? parsed.id_expiry ?? null,
      cnic_no: parsed.cnic_no ?? parsed.cnic ?? null,
    };
  }
  catch { return emptyResult; }
}

function fileDto(row: FileRow | undefined, side: CnicSide): BookingCnicFileDto | null {
  if (!row) return null;
  return { id: row.id, side, originalName: row.originalName, mimeType: row.mimeType, size: row.size, ocrStatus: row.ocrStatus ?? "failed", createdAt: row.createdAt, previewUrl: `/api/v1/files/${row.id}` };
}

function latestSide(agencyId: string, target: CustomerCnicTarget, side: CnicSide): FileRow | undefined {
  return sqlite.prepare(`SELECT id,storage_key AS storageKey,original_name AS originalName,mime_type AS mimeType,size,ocr_status AS ocrStatus,ocr_result AS ocrResult,created_at AS createdAt
    FROM private_files WHERE agency_id=? AND entity_type=? AND entity_id=? AND classification=? AND status='ready'
    ORDER BY created_at DESC LIMIT 1`)
    .get(agencyId, entityType(target), target.id, `customer_cnic_${side}`) as FileRow | undefined;
}

function buildIntake(agencyId: string, target: CustomerCnicTarget): BookingCnicIntakeDto {
  const front = latestSide(agencyId, target, "front");
  const back = latestSide(agencyId, target, "back");
  const frontResult = parseResult(front?.ocrResult ?? null);
  const backResult = parseResult(back?.ocrResult ?? null);
  return {
    bookingDraftId: target.id,
    front: fileDto(front, "front"),
    back: fileDto(back, "back"),
    extracted: {
      name: frontResult.name ?? backResult.name,
      dob: frontResult.dob ?? backResult.dob,
      address: backResult.address ?? frontResult.address,
      expiry: frontResult.expiry ?? backResult.expiry,
      cnic_no: frontResult.cnic_no ?? backResult.cnic_no,
    },
  };
}

export function createCustomerCnicDraft(context: RequestContext) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  return { id: `cnd_${randomUUID()}` };
}

export function getCustomerCnicIntake(context: RequestContext, target: CustomerCnicTarget) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  assertTarget(context, target);
  return buildIntake(context.agencyId, target);
}

export async function uploadCustomerCnic(context: RequestContext, target: CustomerCnicTarget, side: CnicSide, file: File) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  assertTarget(context, target);
  if (side !== "front" && side !== "back") throw new DomainError("VALIDATION_FAILED", "Choose the front or back CNIC side.", 400);
  if (!imageTypes.includes(file.type)) throw new DomainError("VALIDATION_FAILED", "Use a JPEG, PNG, WEBP, or non-animated GIF image.", 415, { image: "Unsupported image type." });
  if (file.size <= 0 || file.size > MAX_CNIC_IMAGE_BYTES) throw new DomainError("VALIDATION_FAILED", "The image must be 10 MiB or smaller.", 413, { image: "Choose a smaller image." });

  const id = `file_${randomUUID()}`;
  const targetType = entityType(target);
  const storageKey = `${context.agencyId}/${targetType}/${target.id}/cnic/${side}-${randomUUID()}`;
  const absolutePath = path.join(storageRoot, storageKey);
  const temporaryPath = `${absolutePath}.uploading`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
  await writeFile(temporaryPath, Buffer.from(bytes), { flag: "wx", mode: 0o600 });
  await rename(temporaryPath, absolutePath);

  const ocrStatus: BookingCnicFileDto["ocrStatus"] = "waiting_for_pair";

  const now = new Date().toISOString();
  try {
    sqlite.transaction(() => {
      sqlite.prepare(`UPDATE private_files SET status='replaced',updated_at=? WHERE agency_id=? AND entity_type=? AND entity_id=? AND classification=? AND status='ready'`)
        .run(now, context.agencyId, targetType, target.id, `customer_cnic_${side}`);
      sqlite.prepare(`INSERT INTO private_files (id,agency_id,entity_type,entity_id,storage_key,original_name,mime_type,size,classification,status,ocr_status,ocr_result,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'ready',?,?,?,?)`)
        .run(id, context.agencyId, targetType, target.id, storageKey, safeName(file.name), file.type, file.size, `customer_cnic_${side}`, ocrStatus, null, now, now);
      sqlite.prepare(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`)
        .run(randomUUID(), context.agencyId, context.userId, "customer.cnic_received", targetType, target.id, JSON.stringify({ fileId: id, side, ocrStatus }), now);
    })();
  } catch (error) {
    await unlink(absolutePath).catch(() => undefined);
    throw error;
  }
  await refreshCustomerCnicExtraction(context.agencyId, target);
  return buildIntake(context.agencyId, target);
}

async function refreshCustomerCnicExtraction(agencyId: string, target: CustomerCnicTarget) {
  const front = latestSide(agencyId, target, "front");
  const back = latestSide(agencyId, target, "back");
  const extraction = await extractStoredCnicPair(
    front ? { absolutePath: path.join(storageRoot, front.storageKey), mimeType: front.mimeType as CnicImageMimeType } : undefined,
    back ? { absolutePath: path.join(storageRoot, back.storageKey), mimeType: back.mimeType as CnicImageMimeType } : undefined,
  );
  sqlite.prepare(`UPDATE private_files SET ocr_status=?,ocr_result=?,updated_at=? WHERE agency_id=? AND entity_type=? AND entity_id=? AND classification IN ('customer_cnic_front','customer_cnic_back') AND status='ready'`)
    .run(extraction.status, extraction.result ? JSON.stringify(extraction.result) : null, new Date().toISOString(), agencyId, entityType(target), target.id);
}

export function attachCustomerCnicDraft(context: RequestContext, draftId: string, customerId: string, now: string) {
  if (!/^cnd_[0-9a-f-]{36}$/.test(draftId)) throw new DomainError("VALIDATION_FAILED", "The customer document session is invalid.", 400);
  sqlite.prepare(`UPDATE private_files SET entity_type='customer',entity_id=?,updated_at=?
    WHERE agency_id=? AND entity_type='customer_draft' AND entity_id=? AND classification IN ('customer_cnic_front','customer_cnic_back') AND status='ready'`)
    .run(customerId, now, context.agencyId, draftId);
}
