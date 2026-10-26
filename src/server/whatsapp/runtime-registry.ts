import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDatabaseTarget } from "@/db/database-target";
import { execute } from "@/db/query";
import { getWhatsAppDatabasePath, getWhatsAppImageInboxPath } from "@/server/desktop/runtime-paths";
import { enqueueJob } from "@/server/jobs/queue";
import type { WhatsAppAuthStore } from "./auth-store";
import { parseCnicImageCommand } from "./incoming-image-command";
import { getSharedWhatsAppAuthStore } from "./sqlite-auth-store";
import type { IncomingWhatsAppMessage, WhatsAppConnectionStatus } from "./types";
import { WhatsAppService } from "./whatsapp-service";

/**
 * The sockets owned by this process. Only the WhatsApp gateway role (or the single desktop/LAN
 * process) uses this module; web requests read status from `whatsapp_sessions` instead.
 */
type RuntimeEntry = {
  agencyId: string;
  sessionId: string;
  service: WhatsAppService;
  status: WhatsAppConnectionStatus;
  ownerNumber: string | null;
  listeningEnabled: boolean;
};

const globalRuntime = globalThis as typeof globalThis & {
  __viberentWhatsAppRuntimes?: Map<string, RuntimeEntry>;
  __viberentWhatsAppAuthStore?: WhatsAppAuthStore;
  __viberentWhatsAppGatewayId?: string;
};
const runtimes = globalRuntime.__viberentWhatsAppRuntimes ??= new Map<string, RuntimeEntry>();

/** Identifies this process in `whatsapp_sessions.holder_id`. */
export const gatewayId = globalRuntime.__viberentWhatsAppGatewayId ??= `gw_${randomUUID()}`;

export async function getWhatsAppAuthStore(): Promise<WhatsAppAuthStore> {
  if (globalRuntime.__viberentWhatsAppAuthStore) return globalRuntime.__viberentWhatsAppAuthStore;
  if (getDatabaseTarget() === "postgres") {
    const { PostgresWhatsAppAuthStore } = await import("./postgres-auth-store");
    globalRuntime.__viberentWhatsAppAuthStore = new PostgresWhatsAppAuthStore();
  } else {
    globalRuntime.__viberentWhatsAppAuthStore = getSharedWhatsAppAuthStore(getWhatsAppDatabasePath());
  }
  return globalRuntime.__viberentWhatsAppAuthStore;
}

export function getRuntime(agencyId: string) {
  return runtimes.get(agencyId);
}

export function runningAgencyIds() {
  return [...runtimes.keys()];
}

/** Writes this process's view of a session for every web replica to read. */
async function reportSession(agencyId: string, fields: Partial<Record<"status" | "qr_payload" | "qr_updated_at" | "linked_jid" | "last_error" | "desired_state", string | null>>) {
  const entries = Object.entries(fields);
  const now = new Date().toISOString();
  await execute(
    `UPDATE whatsapp_sessions SET ${entries.map(([column]) => `${column}=?`).join(",")},holder_id=?,heartbeat_at=?,updated_at=? WHERE agency_id=?`,
    [...entries.map(([, value]) => value), gatewayId, now, now, agencyId],
  ).catch(error => console.error(JSON.stringify({ event: "whatsapp.report_failed", agencyId, message: error instanceof Error ? error.message : "unknown" })));
}

export async function startWhatsAppRuntime(input: { agencyId: string; sessionId: string; ownerNumber: string | null; listeningEnabled: boolean }) {
  const current = runtimes.get(input.agencyId);
  if (current) {
    current.ownerNumber = input.ownerNumber;
    current.listeningEnabled = input.listeningEnabled;
    await current.service.start();
    return current;
  }
  const service = new WhatsAppService({ sessionId: input.sessionId, authStore: await getWhatsAppAuthStore() });
  const entry: RuntimeEntry = { ...input, service, status: "idle" };
  runtimes.set(input.agencyId, entry);
  service.on("status", (status: WhatsAppConnectionStatus) => {
    entry.status = status;
    void reportSession(input.agencyId, status === "connected"
      ? { status, qr_payload: null, qr_updated_at: null, last_error: null }
      : status === "logged_out" ? { status, qr_payload: null, qr_updated_at: null, linked_jid: null, desired_state: "disconnected" } : { status });
  });
  service.on("qr", (qr: string) => { void reportSession(input.agencyId, { qr_payload: qr, qr_updated_at: new Date().toISOString() }); });
  service.on("connected", (event: { jid?: string }) => { void reportSession(input.agencyId, { linked_jid: event.jid ?? null, last_error: null }); });
  service.on("error", (error: unknown) => { void reportSession(input.agencyId, { last_error: error instanceof Error ? error.message.slice(0, 300) : "WhatsApp connection failed." }); });
  service.on("message", (message: IncomingWhatsAppMessage) => {
    void acceptOwnerMessage(entry, message).catch(error => console.error(JSON.stringify({ event: "whatsapp.inbound_failed", agencyId: entry.agencyId, message: error instanceof Error ? error.message : "unknown" })));
  });
  try {
    await service.start();
  } catch (error) {
    runtimes.delete(input.agencyId);
    await service.close().catch(() => undefined);
    throw error;
  }
  return entry;
}

/**
 * Hands an owner message to the worker. Everything else is dropped here without a database write,
 * and only captioned CNIC photos are downloaded (into the shared inbox the worker reads).
 */
async function acceptOwnerMessage(entry: RuntimeEntry, message: IncomingWhatsAppMessage) {
  if (!entry.listeningEnabled || !entry.ownerNumber || message.senderNumber !== entry.ownerNumber) return;
  const text = message.media?.caption ?? message.text;
  const command = parseCnicImageCommand(text);
  let media: { path: string; mimeType: string; fileName: string } | undefined;
  if (command && message.media?.kind === "image") {
    const mimeType = message.media.mimeType ?? "image/jpeg";
    const directory = path.join(getWhatsAppImageInboxPath(), entry.agencyId);
    const filePath = path.join(directory, `${message.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.${mimeType === "image/png" ? "png" : "jpg"}`);
    await mkdir(directory, { recursive: true });
    await writeFile(filePath, await message.media.download(), { mode: 0o600 });
    media = { path: filePath, mimeType, fileName: message.media.fileName ?? `cnic-${command.side}.jpg` };
  }
  if (!text && !media) return;
  await enqueueJob("wa.inbound", { agencyId: entry.agencyId, messageId: message.id, text, media }, { singletonKey: `${entry.agencyId}:${message.id}` });
}

/** Unlinks the account and clears its stored session, whether or not this process holds the socket. */
export async function logoutWhatsAppRuntime(agencyId: string, sessionId?: string) {
  const entry = runtimes.get(agencyId);
  if (entry) {
    try { await entry.service.logout(); }
    finally { await entry.service.close(); runtimes.delete(agencyId); }
    return;
  }
  if (sessionId) await (await getWhatsAppAuthStore()).clearSession(sessionId);
}

/** Closes the socket but keeps the stored session, e.g. on shutdown or when another gateway owns it. */
export async function stopWhatsAppRuntime(agencyId: string) {
  const entry = runtimes.get(agencyId);
  if (!entry) return;
  runtimes.delete(agencyId);
  await entry.service.close();
}

export async function sendWhatsAppDocument(agencyId: string, phoneNumber: string, input: { document: Buffer; mimeType: string; fileName: string; caption?: string }) {
  const entry = runtimes.get(agencyId);
  if (!entry) throw new Error("WhatsApp is not connected.");
  if (entry.status !== "connected") await waitForConnection(entry, 15_000);
  return entry.service.sendDocument(phoneNumber, input);
}

export async function sendWhatsAppText(agencyId: string, phoneNumber: string, text: string) {
  const entry = runtimes.get(agencyId);
  if (!entry) throw new Error("WhatsApp is not connected.");
  if (entry.status !== "connected") await waitForConnection(entry, 15_000);
  return entry.service.sendText(phoneNumber, text);
}

function waitForConnection(entry: RuntimeEntry, timeoutMs: number) {
  if (entry.status === "connected") return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error("WhatsApp did not reconnect in time.")), timeoutMs);
    const onStatus = (status: WhatsAppConnectionStatus) => {
      if (status === "connected") finish();
      else if (status === "logged_out" || status === "idle") finish(new Error("WhatsApp is not connected."));
    };
    const onError = (error: unknown) => finish(error instanceof Error ? error : new Error("WhatsApp connection failed."));
    function finish(error?: Error) {
      clearTimeout(timeout);
      entry.service.off("status", onStatus);
      entry.service.off("error", onError);
      if (error) reject(error); else resolve();
    }
    entry.service.on("status", onStatus);
    entry.service.on("error", onError);
    if (entry.status === "connected") finish();
  });
}
