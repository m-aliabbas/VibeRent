import "server-only";

import { getDatabaseTarget } from "@/db/database-target";
import { execute, queryAll, queryOne } from "@/db/query";
import { getWhatsAppDatabasePath } from "@/server/desktop/runtime-paths";
import { RetryableJobError, type JobHandlers, type JobPayloads } from "@/server/jobs/contracts";
import { deliveryErrorCode, permanentDeliveryErrors } from "@/server/notifications/kinds";
import { auditDelivery, loadDelivery, updateDelivery } from "@/server/notifications/notification-service";
import { readSystemFile } from "@/server/services/private-file-service";
import {
  gatewayId, getRuntime, getWhatsAppAuthStore, logoutWhatsAppRuntime, runningAgencyIds,
  sendWhatsAppDocument, sendWhatsAppText, startWhatsAppRuntime, stopWhatsAppRuntime,
} from "./runtime-registry";

/** Attempts per delivery before it is marked failed. The queue's own retry limit sits above this. */
export const maxSendAttempts = 6;
const reconcileIntervalMs = 10_000;

type SessionRow = { agencyId: string; sessionId: string; desiredState: "connected" | "disconnected"; ownerNumber: string | null; listeningEnabled: number | boolean | null };

const gatewayState = (globalThis as typeof globalThis & { __viberentWhatsAppGateway?: { timer?: NodeJS.Timeout; reconciling: boolean } })
  .__viberentWhatsAppGateway ??= { reconciling: false };

const selectSessions = `SELECT s.agency_id AS agencyId,s.session_id AS sessionId,s.desired_state AS desiredState,
  w.owner_phone_normalized AS ownerNumber,w.listening_enabled AS listeningEnabled
  FROM whatsapp_sessions s LEFT JOIN whatsapp_settings w ON w.agency_id=s.agency_id`;

/** Starts owning WhatsApp sockets: the gateway container on web, or the single desktop/LAN process. */
export async function startWhatsAppGateway() {
  if (gatewayState.timer) return;
  if (getDatabaseTarget() === "postgres") {
    const { importSqliteWhatsAppAuth } = await import("./postgres-auth-store");
    const result = await importSqliteWhatsAppAuth(getWhatsAppDatabasePath());
    if (result.imported) console.info(JSON.stringify({ event: "whatsapp.sqlite_sessions_imported", count: result.imported }));
  }
  await backfillSessions();
  await reconcile();
  gatewayState.timer = setInterval(() => void reconcile(), reconcileIntervalMs);
  gatewayState.timer.unref();
  console.info(JSON.stringify({ event: "whatsapp.gateway_started", gatewayId }));
}

export async function stopWhatsAppGateway() {
  if (gatewayState.timer) clearInterval(gatewayState.timer);
  gatewayState.timer = undefined;
  for (const agencyId of runningAgencyIds()) await stopWhatsAppRuntime(agencyId).catch(() => undefined);
}

/**
 * Agencies that linked WhatsApp before `whatsapp_sessions` existed get a row that asks to stay
 * connected, so upgrading does not silently disconnect them.
 */
async function backfillSessions() {
  const store = await getWhatsAppAuthStore();
  const settings = await queryAll<{ agencyId: string; sessionId: string }>(
    "SELECT w.agency_id AS agencyId,w.session_id AS sessionId FROM whatsapp_settings w LEFT JOIN whatsapp_sessions s ON s.agency_id=w.agency_id WHERE s.agency_id IS NULL",
  );
  const now = new Date().toISOString();
  for (const row of settings) {
    const registered = await store.hasRegisteredSession(row.sessionId);
    await execute(
      "INSERT INTO whatsapp_sessions (agency_id,session_id,desired_state,status,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT (agency_id) DO NOTHING",
      [row.agencyId, row.sessionId, registered ? "connected" : "disconnected", "idle", now, now],
    );
  }
}

/** Brings the sockets this process owns in line with `desired_state`, and refreshes their heartbeat. */
async function reconcile() {
  if (gatewayState.reconciling) return;
  gatewayState.reconciling = true;
  try {
    const sessions = await queryAll<SessionRow>(selectSessions);
    const now = new Date().toISOString();
    for (const session of sessions) {
      const running = getRuntime(session.agencyId);
      if (session.desiredState === "connected") {
        if (running) {
          running.ownerNumber = session.ownerNumber;
          running.listeningEnabled = Boolean(session.listeningEnabled);
          await execute("UPDATE whatsapp_sessions SET holder_id=?,heartbeat_at=? WHERE agency_id=?", [gatewayId, now, session.agencyId]);
        } else {
          await startSession(session).catch(error => logStartFailure(session.agencyId, error));
        }
      } else if (running) {
        await stopWhatsAppRuntime(session.agencyId);
      }
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "whatsapp.reconcile_failed", message: error instanceof Error ? error.message : "unknown" }));
  } finally {
    gatewayState.reconciling = false;
  }
}

function startSession(session: SessionRow) {
  return startWhatsAppRuntime({ agencyId: session.agencyId, sessionId: session.sessionId, ownerNumber: session.ownerNumber, listeningEnabled: Boolean(session.listeningEnabled) });
}

function logStartFailure(agencyId: string, error: unknown) {
  const message = error instanceof Error ? error.message : "unknown";
  // Another gateway holding the lease is normal when more than one runs; it keeps the session.
  if (message.includes("already active")) return;
  console.error(JSON.stringify({ event: "whatsapp.start_failed", agencyId, message }));
}

async function loadSession(agencyId: string) {
  return queryOne<SessionRow>(`${selectSessions} WHERE s.agency_id=? LIMIT 1`, [agencyId]);
}

/** Gateway job: connect, unlink or reset an agency's WhatsApp, as requested from the web app. */
async function controlJob({ agencyId, action }: JobPayloads["wa.control"]) {
  const session = await loadSession(agencyId);
  if (!session) return;
  if (action === "disconnect") {
    await logoutWhatsAppRuntime(agencyId, session.sessionId);
    await execute("UPDATE whatsapp_sessions SET status='idle',qr_payload=NULL,qr_updated_at=NULL,linked_jid=NULL,holder_id=NULL,updated_at=? WHERE agency_id=?", [new Date().toISOString(), agencyId]);
    return;
  }
  if (action === "reset") await logoutWhatsAppRuntime(agencyId, session.sessionId);
  if (session.desiredState === "connected") await startSession(session);
}

/** Gateway job: send a rendered delivery and record the outcome on the delivery row. */
async function sendJob({ deliveryId }: JobPayloads["wa.send"]) {
  const delivery = await loadDelivery(deliveryId);
  // `sending` means a previous attempt stopped mid-send; WhatsApp sends are at-least-once.
  if (!delivery || (delivery.status !== "ready" && delivery.status !== "sending")) return;
  const attempts = delivery.attempts + 1;
  await updateDelivery(deliveryId, { status: "sending", attempts });
  try {
    if (!delivery.recipientPhone) throw new Error("recipient missing");
    await ensureRuntime(delivery.agencyId);
    const sent = delivery.documentFileId
      ? await sendWhatsAppDocument(delivery.agencyId, delivery.recipientPhone, {
        document: await readSystemFile(delivery.agencyId, delivery.documentFileId), mimeType: "application/pdf",
        fileName: delivery.fileName ?? "document.pdf", caption: delivery.caption ?? undefined,
      })
      : await sendWhatsAppText(delivery.agencyId, delivery.recipientPhone, delivery.messageText ?? "");
    await updateDelivery(deliveryId, { status: "sent", wa_message_id: sent.id, sent_at: new Date().toISOString(), last_error_code: null });
    await auditDelivery(delivery, "sent", { messageId: sent.id });
  } catch (error) {
    const code = delivery.recipientPhone ? deliveryErrorCode(error) : "recipient_missing";
    if (permanentDeliveryErrors.includes(code) || attempts >= maxSendAttempts) {
      await updateDelivery(deliveryId, { status: "failed", last_error_code: code });
      await auditDelivery(delivery, "failed", { reason: code, attempts });
      return;
    }
    await updateDelivery(deliveryId, { status: "ready", last_error_code: code });
    throw new RetryableJobError(`Delivery ${deliveryId} will be retried: ${code}`, code);
  }
}

/** Starts the agency's socket on demand for a delivery, as long as it has a linked session. */
async function ensureRuntime(agencyId: string) {
  if (getRuntime(agencyId)) return;
  const session = await loadSession(agencyId);
  if (!session) throw new Error("WhatsApp is not configured.");
  if (!(await (await getWhatsAppAuthStore()).hasRegisteredSession(session.sessionId))) throw new Error("WhatsApp is not configured.");
  await startSession(session);
}

export const gatewayHandlers: JobHandlers = {
  "wa.control": controlJob,
  "wa.send": sendJob,
};
