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

/**
 * Signatures and the business stamp printed on agreements, invoices, receipts and ledgers.
 * - `agency_signature`: one agency-wide signature (authorised signatory), set by the agency owner.
 * - `agency_stamp`: the agency's business stamp / seal, set by the agency owner.
 * - `user_signature`: one signature per staff account, set by that person.
 * A document signs with the acting account's own signature and falls back to the agency signature.
 */
export type BrandingKind = "agency_signature" | "agency_stamp" | "user_signature";
export const brandingKinds: BrandingKind[] = ["agency_signature", "agency_stamp", "user_signature"];

export type BrandingImageDto = { id: string; url: string; createdAt: string } | null;
export type BrandingDto = {
  agencySignature: BrandingImageDto;
  agencyStamp: BrandingImageDto;
  mySignature: BrandingImageDto;
  canManageAgency: boolean;
  /** Staff accounts and whether each has saved a signature (owners see the whole team). */
  team: Array<{ userId: string; name: string; role: string; hasSignature: boolean }>;
};

/** Images ready for a PDF. pdfkit embeds PNG and JPEG only. */
export type DocumentBranding = { signature?: Buffer; signerName?: string; stamp?: Buffer };

const MAX_BYTES = 4 * 1024 * 1024;
const MIME_TYPES = ["image/png", "image/jpeg"];
const storageRoot = getPrivateFileRoot();

function target(context: RequestContext, kind: BrandingKind) {
  return kind === "user_signature" ? { entityType: "user", entityId: context.userId } : { entityType: "agency", entityId: context.agencyId };
}

type Row = { id: string; createdAt: string; storageKey: string };

function latest(agencyId: string, entityType: string, entityId: string, kind: BrandingKind) {
  return queryOne<Row>(`SELECT id,created_at AS createdAt,storage_key AS storageKey FROM private_files WHERE agency_id=? AND entity_type=? AND entity_id=? AND classification=? AND status='ready' ORDER BY created_at DESC LIMIT 1`, [agencyId, entityType, entityId, kind]);
}

const dto = (row: Row | undefined): BrandingImageDto => row ? { id: row.id, url: `/api/v1/files/${row.id}`, createdAt: row.createdAt } : null;

export async function getBranding(context: RequestContext): Promise<BrandingDto> {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const canManageAgency = context.roles.includes("agency_owner");
  const [agencySignature, agencyStamp, mySignature] = await Promise.all([
    latest(context.agencyId, "agency", context.agencyId, "agency_signature"),
    latest(context.agencyId, "agency", context.agencyId, "agency_stamp"),
    latest(context.agencyId, "user", context.userId, "user_signature"),
  ]);
  const team = canManageAgency ? await queryAll<{ userId: string; name: string; role: string; hasSignature: number }>(`SELECT u.id AS userId,u.name,u.role,
      CASE WHEN EXISTS(SELECT 1 FROM private_files f WHERE f.agency_id=u.agency_id AND f.entity_type='user' AND f.entity_id=u.id AND f.classification='user_signature' AND f.status='ready') THEN 1 ELSE 0 END AS hasSignature
    FROM users u WHERE u.agency_id=? AND u.active=1 ORDER BY u.name`, [context.agencyId]) : [];
  return { agencySignature: dto(agencySignature), agencyStamp: dto(agencyStamp), mySignature: dto(mySignature), canManageAgency, team: team.map(item => ({ ...item, hasSignature: Boolean(Number(item.hasSignature)) })) };
}

export async function uploadBrandingImage(context: RequestContext, kind: BrandingKind, file: File): Promise<BrandingDto> {
  requireRole(context, kind === "user_signature" ? ["agency_owner", "fleet_manager", "rental_agent", "accountant"] : ["agency_owner"]);
  if (!brandingKinds.includes(kind)) throw new DomainError("VALIDATION_FAILED", "Choose a signature or stamp.", 400);
  if (!MIME_TYPES.includes(file.type)) throw new DomainError("VALIDATION_FAILED", "Use a PNG (best, with a transparent background) or JPG image.", 415, { file: "Unsupported image type." });
  if (file.size <= 0 || file.size > MAX_BYTES) throw new DomainError("VALIDATION_FAILED", "The image must be 4 MB or smaller.", 413, { file: "Choose a smaller image." });
  const bytes = Buffer.from(await file.arrayBuffer());
  readImageDimensions(bytes);
  const { entityType, entityId } = target(context, kind);
  const id = `file_${randomUUID()}`;
  const storageKey = `${context.agencyId}/branding/${kind}-${randomUUID()}`;
  const absolutePath = path.join(storageRoot, storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
  await writeFile(`${absolutePath}.uploading`, bytes, { flag: "wx", mode: 0o600 });
  await rename(`${absolutePath}.uploading`, absolutePath);
  const now = new Date().toISOString();
  try {
    await inTransaction(async () => {
      await execute(`UPDATE private_files SET status='replaced',updated_at=? WHERE agency_id=? AND entity_type=? AND entity_id=? AND classification=? AND status='ready'`, [now, context.agencyId, entityType, entityId, kind]);
      await execute(`INSERT INTO private_files (id,agency_id,entity_type,entity_id,storage_key,original_name,mime_type,size,classification,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'ready',?,?)`, [id, context.agencyId, entityType, entityId, storageKey, `${kind}.${file.type === "image/png" ? "png" : "jpg"}`, file.type, file.size, kind, now, now]);
      await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`, [randomUUID(), context.agencyId, context.userId, `branding.${kind}_uploaded`, entityType, entityId, JSON.stringify({ fileId: id }), now]);
    }, { immediate: true });
  } catch (error) {
    await unlink(absolutePath).catch(() => undefined);
    throw error;
  }
  return getBranding(context);
}

export async function removeBrandingImage(context: RequestContext, kind: BrandingKind): Promise<BrandingDto> {
  requireRole(context, kind === "user_signature" ? ["agency_owner", "fleet_manager", "rental_agent", "accountant"] : ["agency_owner"]);
  if (!brandingKinds.includes(kind)) throw new DomainError("VALIDATION_FAILED", "Choose a signature or stamp.", 400);
  const { entityType, entityId } = target(context, kind);
  const now = new Date().toISOString();
  await inTransaction(async () => {
    await execute(`UPDATE private_files SET status='removed',updated_at=? WHERE agency_id=? AND entity_type=? AND entity_id=? AND classification=? AND status='ready'`, [now, context.agencyId, entityType, entityId, kind]);
    await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`, [randomUUID(), context.agencyId, context.userId, `branding.${kind}_removed`, entityType, entityId, null, now]);
  }, { immediate: true });
  return getBranding(context);
}

async function readBytes(row: Row | undefined) {
  if (!row) return undefined;
  const absolutePath = path.resolve(storageRoot, row.storageKey);
  if (!absolutePath.startsWith(`${storageRoot}${path.sep}`)) return undefined;
  try { return await readFile(absolutePath); } catch { return undefined; }
}

/**
 * Signature and stamp for a document. `actorUserId` is the staff account the document belongs to
 * (who made the booking or posted the payment); without a personal signature the agency one is used.
 * Callers have already scoped the work to `agencyId`.
 */
export async function loadDocumentBranding(agencyId: string, actorUserId?: string | null): Promise<DocumentBranding> {
  try {
    const [personal, agencySignature, stamp, actor] = await Promise.all([
      actorUserId ? latest(agencyId, "user", actorUserId, "user_signature") : Promise.resolve(undefined),
      latest(agencyId, "agency", agencyId, "agency_signature"),
      latest(agencyId, "agency", agencyId, "agency_stamp"),
      actorUserId ? queryOne<{ name: string }>("SELECT name FROM users WHERE agency_id=? AND id=? LIMIT 1", [agencyId, actorUserId]) : Promise.resolve(undefined),
    ]);
    const signature = await readBytes(personal) ?? await readBytes(agencySignature);
    return { signature, signerName: personal ? actor?.name : undefined, stamp: await readBytes(stamp) };
  } catch {
    return {};
  }
}

/** The staff account that created a booking (from its confirmation audit event). */
export async function bookingActorId(agencyId: string, bookingId: string) {
  const row = await queryOne<{ actorId: string | null }>(`SELECT actor_id AS actorId FROM audit_events WHERE agency_id=? AND entity_type='booking' AND entity_id=? AND action='booking.confirmed' ORDER BY occurred_at LIMIT 1`, [agencyId, bookingId]);
  return row?.actorId ?? null;
}

/**
 * Draws the signature (with the signer's name) and the stamp in a box at (x, y). Missing images are
 * skipped, so documents look the same as before until the agency uploads them.
 */
export function drawSignatureBlock(doc: PDFKit.PDFDocument, branding: DocumentBranding, x: number, y: number, options: { width?: number; label?: string; showLine?: boolean } = {}) {
  const width = options.width ?? 200;
  if (!branding.signature && !branding.stamp) return false;
  if (branding.stamp) {
    try { doc.image(branding.stamp, x + width - 78, y - 6, { fit: [78, 78] }); } catch { /* unreadable stamp image */ }
  }
  if (branding.signature) {
    try { doc.image(branding.signature, x, y, { fit: [Math.min(140, width - 80), 46] }); } catch { /* unreadable signature image */ }
  }
  if (options.showLine !== false) doc.moveTo(x, y + 50).lineTo(x + width - 84, y + 50).strokeColor("#98A2B3").lineWidth(0.6).stroke();
  doc.font("Helvetica").fontSize(7.5).fillColor("#475467").text([options.label ?? "Authorised signature", branding.signerName].filter(Boolean).join(" · "), x, y + 53, { width: width - 80, lineBreak: false });
  return true;
}

/** File ids of the signature and stamp a document would use, for HTML print views. */
export async function documentBrandingUrls(agencyId: string, actorUserId?: string | null) {
  const [personal, agencySignature, stamp] = await Promise.all([
    actorUserId ? latest(agencyId, "user", actorUserId, "user_signature") : Promise.resolve(undefined),
    latest(agencyId, "agency", agencyId, "agency_signature"),
    latest(agencyId, "agency", agencyId, "agency_stamp"),
  ]);
  const signature = personal ?? agencySignature;
  return { signatureUrl: signature ? `/api/v1/files/${signature.id}` : null, stampUrl: stamp ? `/api/v1/files/${stamp.id}` : null };
}
