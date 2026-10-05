import "server-only";

import QRCode from "qrcode";
import type { IncomingWhatsAppMessage, WhatsAppConnectionStatus } from "./types";
import { WhatsAppService } from "./whatsapp-service";
import { parseCnicImageCommand } from "./incoming-image-command";
import { findActiveDraftByNumber, ingestBookingCnic } from "@/server/services/booking-cnic-service";

type RuntimeEntry = {
  agencyId: string;
  service: WhatsAppService;
  status: WhatsAppConnectionStatus;
  qrDataUrl: string | null;
  linkedJid: string | null;
  ownerNumber: string | null;
  listeningEnabled: boolean;
  lastError: string | null;
};

const globalRuntime = globalThis as typeof globalThis & { __viberentWhatsAppRuntimes?: Map<string, RuntimeEntry> };
const runtimes = globalRuntime.__viberentWhatsAppRuntimes ?? new Map<string, RuntimeEntry>();
globalRuntime.__viberentWhatsAppRuntimes = runtimes;

export type WhatsAppRuntimeSnapshot = Omit<RuntimeEntry, "service" | "agencyId">;

export function getWhatsAppRuntimeSnapshot(agencyId: string): WhatsAppRuntimeSnapshot {
  const entry = runtimes.get(agencyId);
  return entry ? { status:entry.status, qrDataUrl:entry.qrDataUrl, linkedJid:entry.linkedJid, ownerNumber:entry.ownerNumber, listeningEnabled:entry.listeningEnabled, lastError:entry.lastError } : { status:"idle", qrDataUrl:null, linkedJid:null, ownerNumber:null, listeningEnabled:false, lastError:null };
}

export async function startWhatsAppRuntime(input: { agencyId:string; sessionId:string; ownerNumber:string|null; listeningEnabled:boolean }) {
  const current = runtimes.get(input.agencyId);
  if (current) {
    current.ownerNumber = input.ownerNumber;
    current.listeningEnabled = input.listeningEnabled;
    await current.service.start();
    return getWhatsAppRuntimeSnapshot(input.agencyId);
  }
  const service = new WhatsAppService({ sessionId: input.sessionId });
  const entry: RuntimeEntry = { agencyId:input.agencyId, service, status:"idle", qrDataUrl:null, linkedJid:null, ownerNumber:input.ownerNumber, listeningEnabled:input.listeningEnabled, lastError:null };
  runtimes.set(input.agencyId, entry);
  service.on("status", status => { entry.status = status; if(status === "connected") entry.qrDataUrl = null; });
  service.on("qr", qr => { void QRCode.toDataURL(qr, { width:320, margin:1 }).then(value => { entry.qrDataUrl=value; }).catch(error => { entry.lastError=error instanceof Error?error.message:"Could not render pairing QR."; }); });
  service.on("connected", event => { entry.linkedJid = (event as {jid?:string}).jid ?? null; entry.lastError=null; });
  service.on("error", error => { entry.lastError=error instanceof Error?error.message:"WhatsApp connection failed."; });
  service.on("message", message => { void handleIncomingOwnerMessage(entry, message as IncomingWhatsAppMessage); });
  try { await service.start(); }
  catch (error) { entry.lastError=error instanceof Error?error.message:"WhatsApp connection failed."; throw error; }
  return getWhatsAppRuntimeSnapshot(input.agencyId);
}

async function handleIncomingOwnerMessage(entry: RuntimeEntry, message: IncomingWhatsAppMessage) {
  if (!entry.listeningEnabled || !entry.ownerNumber || message.senderNumber !== entry.ownerNumber) return;
  const command=parseCnicImageCommand(message.media?.caption??message.text);
  if(!command||message.media?.kind!=="image")return;
  const draft=findActiveDraftByNumber(entry.agencyId,command.bookingNumber);
  if(!draft){await entry.service.sendText(entry.ownerNumber,`Booking ID #${command.bookingNumber} is not active. Open the booking form and use the ID shown there.`).catch(()=>undefined);return;}
  try{
    const bytes=await message.media.download();
    const intake=await ingestBookingCnic({agencyId:entry.agencyId,draftId:draft.id,side:command.side,bytes,mimeType:message.media.mimeType??"image/jpeg",originalName:message.media.fileName??`cnic-${command.side}.jpg`,sourceMessageId:message.id});
    const status=intake[command.side]?.ocrStatus;
    await entry.service.sendText(entry.ownerNumber,`${command.side === "front" ? "Front" : "Back"} CNIC received for booking #${command.bookingNumber}.${status==="complete"?" Both sides were analyzed together and OCR is ready for review.":status==="waiting_for_pair"?" Send the other side to start OCR.":" The image is saved; OCR needs attention."}`).catch(()=>undefined);
  }catch{
    await entry.service.sendText(entry.ownerNumber,`Could not process the ${command.side} CNIC for booking #${command.bookingNumber}. Check the image and try again.`).catch(()=>undefined);
  }
}

export async function logoutWhatsAppRuntime(agencyId:string) {
  const entry=runtimes.get(agencyId);
  if(!entry) return;
  await entry.service.logout();
  await entry.service.close();
  runtimes.delete(agencyId);
}
