import "server-only";

import { randomUUID } from "node:crypto";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import type { DeliveryMode, QueuedDeliveryResult } from "@/server/api/delivery";
import { DomainError } from "@/server/domain/errors";
import { enqueueJob } from "@/server/jobs/queue";
import { notificationKinds, type DeliveryErrorCode, type NotificationKind, type NotificationStatus } from "@/server/notifications/kinds";

export type NotificationDeliveryRow = {
  id: string; agencyId: string; kind: NotificationKind; entityType: string; entityId: string; status: NotificationStatus;
  recipientPhone: string | null; recipientName: string | null; payload: string; documentFileId: string | null;
  messageText: string | null; fileName: string | null; caption: string | null; attempts: number;
  lastErrorCode: DeliveryErrorCode | null; waMessageId: string | null; requestedBy: string | null;
  sentAt: string | null; createdAt: string; updatedAt: string;
};

export type NotificationDeliveryDto = {
  id: string; kind: NotificationKind; label: string; status: NotificationStatus; recipientName: string | null;
  attempts: number; lastErrorCode: DeliveryErrorCode | null; documentUrl: string | null; sentAt: string | null;
  createdAt: string; updatedAt: string;
};

export type QueueNotificationInput = {
  kind: NotificationKind;
  entityId: string;
  /** Small inputs the renderer needs that are not on the entity itself, e.g. a payment's receipt number. */
  payload?: Record<string, unknown>;
  /** The same key never queues a second delivery for the agency. Omit for deliveries that may repeat. */
  idempotencyKey?: string;
};

const selectDelivery = `SELECT id,agency_id AS agencyId,kind,entity_type AS entityType,entity_id AS entityId,status,recipient_phone AS recipientPhone,
  recipient_name AS recipientName,payload,document_file_id AS documentFileId,message_text AS messageText,file_name AS fileName,caption,attempts,
  last_error_code AS lastErrorCode,wa_message_id AS waMessageId,requested_by AS requestedBy,sent_at AS sentAt,created_at AS createdAt,updated_at AS updatedAt
  FROM notification_deliveries`;

/**
 * Records a notice and queues it for rendering and WhatsApp delivery. Call it inside the same
 * `inTransaction()` as the business write: the delivery row and its job then commit together, so a
 * saved checkout always gets its receipt, even if the server restarts a moment later.
 */
export async function queueNotification(context: RequestContext, mode: DeliveryMode, input: QueueNotificationInput): Promise<QueuedDeliveryResult> {
  return insertDelivery(context.agencyId, context.userId || null, mode, input);
}

/** Queues a notice raised by the system itself (daily reports, replies to owner commands). */
export async function queueSystemNotification(agencyId: string, input: QueueNotificationInput): Promise<QueuedDeliveryResult> {
  return insertDelivery(agencyId, null, "server", input);
}

async function insertDelivery(agencyId: string, requestedBy: string | null, mode: DeliveryMode, input: QueueNotificationInput): Promise<QueuedDeliveryResult> {
  const kind = notificationKinds[input.kind];
  const id = `ntf_${randomUUID()}`;
  const idempotencyKey = input.idempotencyKey ?? `${input.kind}:${id}`;
  const now = new Date().toISOString();
  const status: NotificationStatus = mode === "client" ? "skipped" : "queued";
  return inTransaction(async () => {
    const inserted = await execute(
      `INSERT INTO notification_deliveries (id,agency_id,kind,entity_type,entity_id,status,payload,last_error_code,idempotency_key,requested_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (agency_id,idempotency_key) DO NOTHING`,
      [id, agencyId, input.kind, kind.entityType, input.entityId, status, JSON.stringify(input.payload ?? {}), mode === "client" ? "client_delivery" : null, idempotencyKey, requestedBy, now, now],
    );
    if (inserted.changes === 0) {
      const existing = await queryOne<{ id: string; status: NotificationStatus }>("SELECT id,status FROM notification_deliveries WHERE agency_id=? AND idempotency_key=? LIMIT 1", [agencyId, idempotencyKey]);
      return existing?.status === "sent"
        ? { status: "skipped", message: `${kind.label} was already sent on WhatsApp.`, deliveryId: existing.id }
        : { status: "queued", message: `${kind.label} is being sent on WhatsApp.`, deliveryId: existing?.id };
    }
    if (mode === "client") return { status: "skipped", message: `${kind.label} was not sent by VibeRent. Share it from the device.`, deliveryId: id };
    await enqueueJob("notify.render", { deliveryId: id }, { singletonKey: id });
    return { status: "queued", message: `${kind.label} is being sent on WhatsApp.`, deliveryId: id };
  }, { immediate: true });
}

export async function listNotifications(context: RequestContext, entityType: string, entityId: string): Promise<NotificationDeliveryDto[]> {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const rows = await queryAll<NotificationDeliveryRow>(`${selectDelivery} WHERE agency_id=? AND entity_type=? AND entity_id=? ORDER BY created_at DESC LIMIT 50`, [context.agencyId, entityType, entityId]);
  return rows.map(toDto);
}

/** Queues a failed delivery again, keeping its rendered document when it already has one. */
export async function retryNotification(context: RequestContext, id: string): Promise<NotificationDeliveryDto> {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const now = new Date().toISOString();
  await inTransaction(async () => {
    const row = await queryOne<NotificationDeliveryRow>(`${selectDelivery} WHERE agency_id=? AND id=? LIMIT 1 /*postgres:for-update*/`, [context.agencyId, id]);
    if (!row) throw new DomainError("NOT_FOUND", "Delivery not found.", 404);
    if (row.status !== "failed") throw new DomainError("INVALID_STATUS_TRANSITION", "Only a failed delivery can be retried.", 409);
    const rendered = Boolean(row.documentFileId || row.messageText);
    await execute("UPDATE notification_deliveries SET status=?,attempts=0,last_error_code=NULL,updated_at=? WHERE agency_id=? AND id=?", [rendered ? "ready" : "queued", now, context.agencyId, id]);
    await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",
      [`aud_${randomUUID()}`, context.agencyId, context.userId, "notification.retried", row.entityType, row.entityId, JSON.stringify({ deliveryId: id, kind: row.kind }), now]);
    await enqueueJob(rendered ? "wa.send" : "notify.render", { deliveryId: id }, { singletonKey: id });
  }, { immediate: true });
  const updated = await loadDelivery(id);
  return toDto(updated!);
}

export function loadDelivery(id: string) {
  return queryOne<NotificationDeliveryRow>(`${selectDelivery} WHERE id=? LIMIT 1`, [id]);
}

export async function updateDelivery(id: string, fields: Partial<Record<"status" | "recipient_phone" | "recipient_name" | "document_file_id" | "message_text" | "file_name" | "caption" | "last_error_code" | "wa_message_id" | "sent_at", string | null>> & { attempts?: number }) {
  const entries = Object.entries(fields);
  if (entries.length === 0) return;
  await execute(
    `UPDATE notification_deliveries SET ${entries.map(([column]) => `${column}=?`).join(",")},updated_at=? WHERE id=?`,
    [...entries.map(([, value]) => value), new Date().toISOString(), id],
  );
}

/** Writes the sent/failed audit event for a delivery, using the action names staff already see. */
export async function auditDelivery(row: NotificationDeliveryRow, outcome: "sent" | "failed", metadata: Record<string, unknown>) {
  const kind = notificationKinds[row.kind];
  const action = outcome === "sent" ? kind.sentAction : kind.failedAction;
  if (!action) return;
  await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",
    [`aud_${randomUUID()}`, row.agencyId, row.requestedBy, action, row.entityType, row.entityId, JSON.stringify({ deliveryId: row.id, ...metadata }), new Date().toISOString()]);
}

function toDto(row: NotificationDeliveryRow): NotificationDeliveryDto {
  return {
    id: row.id, kind: row.kind, label: notificationKinds[row.kind]?.label ?? row.kind, status: row.status, recipientName: row.recipientName,
    attempts: row.attempts, lastErrorCode: row.lastErrorCode, documentUrl: row.documentFileId ? `/api/v1/files/${row.documentFileId}` : null,
    sentAt: row.sentAt, createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}
