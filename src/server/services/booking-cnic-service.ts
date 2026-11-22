import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import { MAX_CNIC_IMAGE_BYTES } from "@/server/cnic-ocr/cnic-ocr-service";
import { extractStoredCnicPair } from "@/server/cnic-ocr/stored-cnic-pair";
import { SUPPORTED_CNIC_IMAGE_MIME_TYPES, type CnicImageMimeType, type CnicOcrResult, type CnicOcrStatus } from "@/server/cnic-ocr/types";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { getPrivateFileRoot } from "@/server/desktop/runtime-paths";
import { extractStoredLicense, parseStoredLicenseResult, type LicenseOcrResult } from "@/server/cnic-ocr/license-ocr";

export type CnicSide = "front" | "back";
export type BookingCnicPurpose = "customer" | "guarantor";
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
const emptyResult: CnicOcrResult = { name: null, father_name: null, dob: null, address: null, expiry: null, cnic_no: null };

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "cnic-image";
}

async function getDraft(agencyId: string, draftId: string): Promise<DraftRow> {
  const draft = await queryOne<DraftRow>(`SELECT id,status,expires_at AS expiresAt FROM booking_drafts WHERE agency_id=? AND id=? LIMIT 1`,[agencyId, draftId]);
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
      father_name: parsed.father_name ?? null,
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

function classification(purpose: BookingCnicPurpose, side: CnicSide) { return `${purpose}_cnic_${side}`; }

function latestSide(agencyId: string, draftId: string, side: CnicSide, purpose: BookingCnicPurpose): Promise<FileRow | undefined> {
  return queryOne<FileRow>(`SELECT id,storage_key AS storageKey,original_name AS originalName,mime_type AS mimeType,size,classification,ocr_status AS ocrStatus,ocr_result AS ocrResult,created_at AS createdAt
    FROM private_files WHERE agency_id=? AND entity_type='booking_draft' AND entity_id=? AND classification=? AND status='ready'
    ORDER BY created_at DESC LIMIT 1`,[agencyId,draftId,classification(purpose,side)]);
}

async function buildIntake(agencyId: string, draftId: string, purpose: BookingCnicPurpose): Promise<BookingCnicIntakeDto> {
  const [front,back]=await Promise.all([latestSide(agencyId,draftId,"front",purpose),latestSide(agencyId,draftId,"back",purpose)]);
  const frontResult=parseResult(front?.ocrResult??null);
  const backResult=parseResult(back?.ocrResult??null);
  return {
    bookingDraftId:draftId,
    front:fileDto(front,"front"),
    back:fileDto(back,"back"),
    extracted:{
      name:frontResult.name??backResult.name,
      father_name:frontResult.father_name??backResult.father_name,
      dob:frontResult.dob??backResult.dob,
      address:backResult.address??frontResult.address,
      expiry:frontResult.expiry??backResult.expiry,
      cnic_no:frontResult.cnic_no??backResult.cnic_no,
    },
  };
}

export async function getBookingCnicIntake(context: RequestContext, draftId: string, purpose: BookingCnicPurpose = "customer") {
  requireRole(context,["agency_owner","fleet_manager","rental_agent"]);
  await getDraft(context.agencyId,draftId);
  return buildIntake(context.agencyId,draftId,purpose);
}

type IngestInput = {
  agencyId: string; draftId: string; actorId?: string; side: CnicSide; bytes: Uint8Array;
  mimeType: string; originalName: string; sourceMessageId?: string; purpose?: BookingCnicPurpose;
};

export async function ingestBookingCnic(input: IngestInput): Promise<BookingCnicIntakeDto> {
  const purpose=input.purpose??"customer";
  await getDraft(input.agencyId,input.draftId);
  if (!imageTypes.includes(input.mimeType)) throw new DomainError("VALIDATION_FAILED","Use a JPEG, PNG, WEBP, or non-animated GIF image.",415,{image:"Unsupported image type."});
  if (!input.bytes.byteLength || input.bytes.byteLength > MAX_CNIC_IMAGE_BYTES) throw new DomainError("VALIDATION_FAILED","The image must be 10 MiB or smaller.",413,{image:"Choose a smaller image."});
  if (input.sourceMessageId) {
    const existing=await queryOne("SELECT id FROM private_files WHERE agency_id=? AND source_message_id=? LIMIT 1",[input.agencyId,input.sourceMessageId]);
    if(existing)return buildIntake(input.agencyId,input.draftId,purpose);
  }

  const id=`file_${randomUUID()}`;
  const storageKey=`${input.agencyId}/booking-drafts/${input.draftId}/${purpose}-cnic/${input.side}-${randomUUID()}`;
  const absolutePath=path.join(storageRoot,storageKey);
  const temporaryPath=`${absolutePath}.uploading`;
  await mkdir(path.dirname(absolutePath),{recursive:true,mode:0o700});
  await writeFile(temporaryPath,Buffer.from(input.bytes),{flag:"wx",mode:0o600});
  await rename(temporaryPath,absolutePath);

  const ocrStatus: BookingCnicFileDto["ocrStatus"]="waiting_for_pair";

  const now=new Date().toISOString();
  try {
    await inTransaction(async ()=>{
      await execute(`UPDATE private_files SET status='replaced',updated_at=? WHERE agency_id=? AND entity_type='booking_draft' AND entity_id=? AND classification=? AND status='ready'`,[now,input.agencyId,input.draftId,classification(purpose,input.side)]);
      await execute(`INSERT INTO private_files (id,agency_id,entity_type,entity_id,storage_key,original_name,mime_type,size,classification,status,ocr_status,ocr_result,source_message_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'ready',?,?,?,?,?)`,[id,input.agencyId,"booking_draft",input.draftId,storageKey,safeName(input.originalName),input.mimeType,input.bytes.byteLength,classification(purpose,input.side),ocrStatus,null,input.sourceMessageId??null,now,now]);
      await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,[randomUUID(),input.agencyId,input.actorId??null,"booking.cnic_received","booking_draft",input.draftId,JSON.stringify({fileId:id,side:input.side,purpose,source:input.sourceMessageId?"whatsapp":"upload",ocrStatus}),now]);
    },{immediate:true});
  } catch(error) {
    await unlink(absolutePath).catch(()=>undefined);
    throw error;
  }
  await refreshBookingCnicExtraction(input.agencyId,input.draftId,purpose);
  return buildIntake(input.agencyId,input.draftId,purpose);
}

async function refreshBookingCnicExtraction(agencyId: string, draftId: string, purpose: BookingCnicPurpose) {
  const [front,back]=await Promise.all([latestSide(agencyId,draftId,"front",purpose),latestSide(agencyId,draftId,"back",purpose)]);
  const extraction=await extractStoredCnicPair(
    front ? {absolutePath:path.join(storageRoot,front.storageKey),mimeType:front.mimeType as CnicImageMimeType} : undefined,
    back ? {absolutePath:path.join(storageRoot,back.storageKey),mimeType:back.mimeType as CnicImageMimeType} : undefined,
  );
  const updatedAt=new Date().toISOString();
  await execute(`UPDATE private_files SET ocr_status=?,ocr_result=?,updated_at=? WHERE agency_id=? AND entity_type='booking_draft' AND entity_id=? AND classification IN (?,?) AND status='ready'`,[extraction.status,extraction.result?JSON.stringify(extraction.result):null,updatedAt,agencyId,draftId,classification(purpose,"front"),classification(purpose,"back")]);
}

export async function uploadBookingCnic(context: RequestContext, draftId: string, side: CnicSide, file: File, purpose: BookingCnicPurpose = "customer") {
  requireRole(context,["agency_owner","fleet_manager","rental_agent"]);
  if(side!=="front"&&side!=="back")throw new DomainError("VALIDATION_FAILED","Choose the front or back CNIC side.",400);
  return ingestBookingCnic({agencyId:context.agencyId,draftId,actorId:context.userId,side,bytes:new Uint8Array(await file.arrayBuffer()),mimeType:file.type,originalName:file.name,purpose});
}

export async function clearBookingDraft(context: RequestContext, draftId: string) {
  requireRole(context,["agency_owner","fleet_manager","rental_agent"]);
  const draft = await queryOne<{id:string}>(`SELECT id FROM booking_drafts WHERE agency_id=? AND actor_id=? AND id=? AND status='active' LIMIT 1`,[context.agencyId,context.userId,draftId]);
  if(!draft) throw new DomainError("NOT_FOUND","The booking draft is no longer active.",404);
  const files = await queryAll<{storageKey:string}>(`SELECT storage_key AS storageKey FROM private_files WHERE agency_id=? AND entity_type='booking_draft' AND entity_id=?`,[context.agencyId,draftId]);
  const now=new Date().toISOString();
  await inTransaction(async ()=>{
    await execute(`UPDATE booking_drafts SET status='expired',updated_at=? WHERE agency_id=? AND id=?`,[now,context.agencyId,draftId]);
    await execute(`DELETE FROM private_files WHERE agency_id=? AND entity_type='booking_draft' AND entity_id=?`,[context.agencyId,draftId]);
    await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,[randomUUID(),context.agencyId,context.userId,"booking.draft_cleared","booking_draft",draftId,JSON.stringify({documentsRemoved:files.length}),now]);
  },{immediate:true});
  await Promise.all(files.map(file=>unlink(path.join(storageRoot,file.storageKey)).catch(()=>undefined)));
}

export function findActiveDraftByNumber(agencyId: string, publicNumber: number) {
  return queryOne<{id:string}>(`SELECT id FROM booking_drafts WHERE agency_id=? AND public_number=? AND status='active' AND expires_at>? LIMIT 1`,[agencyId,publicNumber,new Date().toISOString()]);
}

// ─── Driving licence intake ────────────────────────────────────────────────
// Licence images picked during a booking live on the draft (classification `<purpose>_license_<side>`)
// and are read by OCR as soon as the front (or back) arrives. Confirming the booking moves them onto
// the customer or guarantor, like the CNIC images.

export type BookingLicenseIntakeDto = {
  bookingDraftId: string;
  front: BookingCnicFileDto | null;
  back: BookingCnicFileDto | null;
  extracted: LicenseOcrResult;
};

function licenseClassification(purpose: BookingCnicPurpose, side: CnicSide) { return `${purpose}_license_${side}`; }

function latestLicenseSide(agencyId: string, draftId: string, side: CnicSide, purpose: BookingCnicPurpose): Promise<FileRow | undefined> {
  return queryOne<FileRow>(`SELECT id,storage_key AS storageKey,original_name AS originalName,mime_type AS mimeType,size,classification,ocr_status AS ocrStatus,ocr_result AS ocrResult,created_at AS createdAt
    FROM private_files WHERE agency_id=? AND entity_type='booking_draft' AND entity_id=? AND classification=? AND status='ready'
    ORDER BY created_at DESC LIMIT 1`,[agencyId,draftId,licenseClassification(purpose,side)]);
}

async function buildLicenseIntake(agencyId: string, draftId: string, purpose: BookingCnicPurpose): Promise<BookingLicenseIntakeDto> {
  const [front,back]=await Promise.all([latestLicenseSide(agencyId,draftId,"front",purpose),latestLicenseSide(agencyId,draftId,"back",purpose)]);
  return { bookingDraftId:draftId, front:fileDto(front,"front"), back:fileDto(back,"back"), extracted:parseStoredLicenseResult(front?.ocrResult??back?.ocrResult??null) };
}

export async function getBookingLicenseIntake(context: RequestContext, draftId: string, purpose: BookingCnicPurpose = "customer") {
  requireRole(context,["agency_owner","fleet_manager","rental_agent"]);
  await getDraft(context.agencyId,draftId);
  return buildLicenseIntake(context.agencyId,draftId,purpose);
}

export async function uploadBookingLicense(context: RequestContext, draftId: string, side: CnicSide, file: File, purpose: BookingCnicPurpose = "customer"): Promise<BookingLicenseIntakeDto> {
  requireRole(context,["agency_owner","fleet_manager","rental_agent"]);
  if(side!=="front"&&side!=="back")throw new DomainError("VALIDATION_FAILED","Choose the front or back licence side.",400);
  if(purpose!=="customer"&&purpose!=="guarantor")throw new DomainError("VALIDATION_FAILED","Choose the customer or guarantor licence.",400);
  await getDraft(context.agencyId,draftId);
  if (!imageTypes.includes(file.type)) throw new DomainError("VALIDATION_FAILED","Use a JPEG, PNG, WEBP, or non-animated GIF image.",415,{image:"Unsupported image type."});
  if (!file.size || file.size > MAX_CNIC_IMAGE_BYTES) throw new DomainError("VALIDATION_FAILED","The image must be 10 MiB or smaller.",413,{image:"Choose a smaller image."});
  const id=`file_${randomUUID()}`;
  const storageKey=`${context.agencyId}/booking-drafts/${draftId}/${purpose}-license/${side}-${randomUUID()}`;
  const absolutePath=path.join(storageRoot,storageKey);
  await mkdir(path.dirname(absolutePath),{recursive:true,mode:0o700});
  await writeFile(`${absolutePath}.uploading`,Buffer.from(await file.arrayBuffer()),{flag:"wx",mode:0o600});
  await rename(`${absolutePath}.uploading`,absolutePath);
  const now=new Date().toISOString();
  try {
    await inTransaction(async ()=>{
      await execute(`UPDATE private_files SET status='replaced',updated_at=? WHERE agency_id=? AND entity_type='booking_draft' AND entity_id=? AND classification=? AND status='ready'`,[now,context.agencyId,draftId,licenseClassification(purpose,side)]);
      await execute(`INSERT INTO private_files (id,agency_id,entity_type,entity_id,storage_key,original_name,mime_type,size,classification,status,ocr_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'ready','waiting_for_pair',?,?)`,[id,context.agencyId,"booking_draft",draftId,storageKey,safeName(file.name),file.type,file.size,licenseClassification(purpose,side),now,now]);
      await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,[randomUUID(),context.agencyId,context.userId,"booking.license_received","booking_draft",draftId,JSON.stringify({fileId:id,side,purpose}),now]);
    },{immediate:true});
  } catch(error) {
    await unlink(absolutePath).catch(()=>undefined);
    throw error;
  }
  const [front,back]=await Promise.all([latestLicenseSide(context.agencyId,draftId,"front",purpose),latestLicenseSide(context.agencyId,draftId,"back",purpose)]);
  const extraction=await extractStoredLicense(
    front?{absolutePath:path.join(storageRoot,front.storageKey),mimeType:front.mimeType as CnicImageMimeType}:undefined,
    back?{absolutePath:path.join(storageRoot,back.storageKey),mimeType:back.mimeType as CnicImageMimeType}:undefined,
  );
  await execute(`UPDATE private_files SET ocr_status=?,ocr_result=?,updated_at=? WHERE agency_id=? AND entity_type='booking_draft' AND entity_id=? AND classification IN (?,?) AND status='ready'`,[extraction.status,extraction.result?JSON.stringify(extraction.result):null,new Date().toISOString(),context.agencyId,draftId,licenseClassification(purpose,"front"),licenseClassification(purpose,"back")]);
  return buildLicenseIntake(context.agencyId,draftId,purpose);
}
