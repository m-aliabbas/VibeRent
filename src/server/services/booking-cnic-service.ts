import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { sqlite } from "@/db/connection";
import { requireRole } from "@/server/auth/authorize";
import { MAX_CNIC_IMAGE_BYTES } from "@/server/cnic-ocr/cnic-ocr-service";
import { extractStoredCnicPair } from "@/server/cnic-ocr/stored-cnic-pair";
import { SUPPORTED_CNIC_IMAGE_MIME_TYPES, type CnicImageMimeType, type CnicOcrResult, type CnicOcrStatus } from "@/server/cnic-ocr/types";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { getPrivateFileRoot } from "@/server/desktop/runtime-paths";

export type CnicSide = "front" | "back";
export type BookingCnicFileDto = {
  id: string;
  side: CnicSide;
  originalName: string;
  mimeType: string;
  size: number;
  ocrStatus: CnicOcrStatus;
  createdAt: string;
  previewUrl: string;
};
export type BookingCnicIntakeDto = {
  bookingDraftId: string;
  front: BookingCnicFileDto | null;
  back: BookingCnicFileDto | null;
  extracted: CnicOcrResult;
};

type DraftRow = { id: string; status: string; expiresAt: string };
type FileRow = {
  id: string; originalName: string; mimeType: string; size: number; classification: string;
  storageKey: string; ocrStatus: BookingCnicFileDto["ocrStatus"] | null; ocrResult: string | null; createdAt: string;
};

const imageTypes = SUPPORTED_CNIC_IMAGE_MIME_TYPES as readonly string[];
const storageRoot = getPrivateFileRoot();
const emptyResult: CnicOcrResult = { name: null, dob: null, address: null, expiry: null, cnic_no: null };

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "cnic-image";
}

function getDraft(agencyId: string, draftId: string): DraftRow {
  const draft = sqlite.prepare(`SELECT id,status,expires_at AS expiresAt FROM booking_drafts WHERE agency_id=? AND id=? LIMIT 1`)
    .get(agencyId, draftId) as DraftRow | undefined;
  if (!draft) throw new DomainError("NOT_FOUND", "Booking draft not found.", 404);
  if (draft.status !== "active" || draft.expiresAt <= new Date().toISOString()) throw new DomainError("INVALID_STATUS_TRANSITION", "This booking ID is no longer active.", 409);
  return draft;
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
  return { id:row.id, side, originalName:row.originalName, mimeType:row.mimeType, size:row.size, ocrStatus:row.ocrStatus ?? "failed", createdAt:row.createdAt, previewUrl:`/api/v1/files/${row.id}` };
}

function latestSide(agencyId: string, draftId: string, side: CnicSide): FileRow | undefined {
  return sqlite.prepare(`SELECT id,storage_key AS storageKey,original_name AS originalName,mime_type AS mimeType,size,classification,ocr_status AS ocrStatus,ocr_result AS ocrResult,created_at AS createdAt
    FROM private_files WHERE agency_id=? AND entity_type='booking_draft' AND entity_id=? AND classification=? AND status='ready'
    ORDER BY created_at DESC LIMIT 1`).get(agencyId,draftId,`customer_cnic_${side}`) as FileRow | undefined;
}

function buildIntake(agencyId: string, draftId: string): BookingCnicIntakeDto {
  const front=latestSide(agencyId,draftId,"front");
  const back=latestSide(agencyId,draftId,"back");
  const frontResult=parseResult(front?.ocrResult??null);
  const backResult=parseResult(back?.ocrResult??null);
  return {
    bookingDraftId:draftId,
    front:fileDto(front,"front"),
    back:fileDto(back,"back"),
    extracted:{
      name:frontResult.name??backResult.name,
      dob:frontResult.dob??backResult.dob,
      address:backResult.address??frontResult.address,
      expiry:frontResult.expiry??backResult.expiry,
      cnic_no:frontResult.cnic_no??backResult.cnic_no,
    },
  };
}

export function getBookingCnicIntake(context: RequestContext, draftId: string) {
  requireRole(context,["agency_owner","fleet_manager","rental_agent"]);
  getDraft(context.agencyId,draftId);
  return buildIntake(context.agencyId,draftId);
}

type IngestInput = {
  agencyId: string; draftId: string; actorId?: string; side: CnicSide; bytes: Uint8Array;
  mimeType: string; originalName: string; sourceMessageId?: string;
};

export async function ingestBookingCnic(input: IngestInput): Promise<BookingCnicIntakeDto> {
  getDraft(input.agencyId,input.draftId);
  if (!imageTypes.includes(input.mimeType)) throw new DomainError("VALIDATION_FAILED","Use a JPEG, PNG, WEBP, or non-animated GIF image.",415,{image:"Unsupported image type."});
  if (!input.bytes.byteLength || input.bytes.byteLength > MAX_CNIC_IMAGE_BYTES) throw new DomainError("VALIDATION_FAILED","The image must be 10 MiB or smaller.",413,{image:"Choose a smaller image."});
  if (input.sourceMessageId) {
    const existing=sqlite.prepare("SELECT id FROM private_files WHERE agency_id=? AND source_message_id=? LIMIT 1").get(input.agencyId,input.sourceMessageId);
    if(existing)return buildIntake(input.agencyId,input.draftId);
  }

  const id=`file_${randomUUID()}`;
  const storageKey=`${input.agencyId}/booking-drafts/${input.draftId}/cnic/${input.side}-${randomUUID()}`;
  const absolutePath=path.join(storageRoot,storageKey);
  const temporaryPath=`${absolutePath}.uploading`;
  await mkdir(path.dirname(absolutePath),{recursive:true,mode:0o700});
  await writeFile(temporaryPath,Buffer.from(input.bytes),{flag:"wx",mode:0o600});
  await rename(temporaryPath,absolutePath);

  const ocrStatus: BookingCnicFileDto["ocrStatus"]="waiting_for_pair";

  const now=new Date().toISOString();
  try {
    sqlite.transaction(()=>{
      sqlite.prepare(`UPDATE private_files SET status='replaced',updated_at=? WHERE agency_id=? AND entity_type='booking_draft' AND entity_id=? AND classification=? AND status='ready'`)
        .run(now,input.agencyId,input.draftId,`customer_cnic_${input.side}`);
      sqlite.prepare(`INSERT INTO private_files (id,agency_id,entity_type,entity_id,storage_key,original_name,mime_type,size,classification,status,ocr_status,ocr_result,source_message_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'ready',?,?,?,?,?)`)
        .run(id,input.agencyId,"booking_draft",input.draftId,storageKey,safeName(input.originalName),input.mimeType,input.bytes.byteLength,`customer_cnic_${input.side}`,ocrStatus,null,input.sourceMessageId??null,now,now);
      sqlite.prepare(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`)
        .run(randomUUID(),input.agencyId,input.actorId??null,"booking.cnic_received","booking_draft",input.draftId,JSON.stringify({fileId:id,side:input.side,source:input.sourceMessageId?"whatsapp":"upload",ocrStatus}),now);
    })();
  } catch(error) {
    await unlink(absolutePath).catch(()=>undefined);
    throw error;
  }
  await refreshBookingCnicExtraction(input.agencyId,input.draftId);
  return buildIntake(input.agencyId,input.draftId);
}

async function refreshBookingCnicExtraction(agencyId: string, draftId: string) {
  const front=latestSide(agencyId,draftId,"front");
  const back=latestSide(agencyId,draftId,"back");
  const extraction=await extractStoredCnicPair(
    front ? {absolutePath:path.join(storageRoot,front.storageKey),mimeType:front.mimeType as CnicImageMimeType} : undefined,
    back ? {absolutePath:path.join(storageRoot,back.storageKey),mimeType:back.mimeType as CnicImageMimeType} : undefined,
  );
  const updatedAt=new Date().toISOString();
  sqlite.prepare(`UPDATE private_files SET ocr_status=?,ocr_result=?,updated_at=? WHERE agency_id=? AND entity_type='booking_draft' AND entity_id=? AND classification IN ('customer_cnic_front','customer_cnic_back') AND status='ready'`)
    .run(extraction.status,extraction.result?JSON.stringify(extraction.result):null,updatedAt,agencyId,draftId);
}

export async function uploadBookingCnic(context: RequestContext, draftId: string, side: CnicSide, file: File) {
  requireRole(context,["agency_owner","fleet_manager","rental_agent"]);
  if(side!=="front"&&side!=="back")throw new DomainError("VALIDATION_FAILED","Choose the front or back CNIC side.",400);
  return ingestBookingCnic({agencyId:context.agencyId,draftId,actorId:context.userId,side,bytes:new Uint8Array(await file.arrayBuffer()),mimeType:file.type,originalName:file.name});
}

export function findActiveDraftByNumber(agencyId: string, publicNumber: number) {
  return sqlite.prepare(`SELECT id FROM booking_drafts WHERE agency_id=? AND public_number=? AND status='active' AND expires_at>? LIMIT 1`)
    .get(agencyId,publicNumber,new Date().toISOString()) as {id:string}|undefined;
}
