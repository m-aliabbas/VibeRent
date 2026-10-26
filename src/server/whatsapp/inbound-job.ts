import "server-only";

import { readFile, unlink } from "node:fs/promises";
import { queryOne } from "@/db/query";
import type { JobPayloads } from "@/server/jobs/contracts";
import { queueSystemNotification } from "@/server/notifications/notification-service";
import { findActiveDraftByNumber, ingestBookingCnic } from "@/server/services/booking-cnic-service";
import { parseCnicImageCommand } from "./incoming-image-command";
import { runOwnerCommand } from "./owner-command-service";

/**
 * Worker job: run an owner command or file a CNIC photo sent on WhatsApp, then queue the reply.
 * The gateway only forwards messages from the configured owner number.
 */
export async function handleInboundJob(data: JobPayloads["wa.inbound"]) {
  await processInbound(data);
  // Kept on failure so the retried job can still read the photo; maintenance clears stale files.
  if (data.media) await unlink(data.media.path).catch(() => undefined);
}

async function processInbound(data: JobPayloads["wa.inbound"]) {
  const settings = await queryOne<{ ownerNumber: string | null; listeningEnabled: number | boolean }>(
    "SELECT owner_phone_normalized AS ownerNumber,listening_enabled AS listeningEnabled FROM whatsapp_settings WHERE agency_id=? LIMIT 1",
    [data.agencyId],
  );
  const ownerNumber = settings?.ownerNumber;
  if (!ownerNumber || !settings.listeningEnabled) return;
  const reply = (text: string) => queueSystemNotification(data.agencyId, {
    kind: "owner.command_reply", entityId: data.messageId, payload: { text, phone: ownerNumber }, idempotencyKey: `owner.command_reply:${data.messageId}`,
  });

  const command = parseCnicImageCommand(data.text);
  if (!command || !data.media) {
    const result = await runOwnerCommand(data.agencyId, data.text);
    if (result.handled && result.reply) await reply(result.reply);
    return;
  }

  const draft = await findActiveDraftByNumber(data.agencyId, command.bookingNumber);
  if (!draft) {
    await reply(`Booking ID #${command.bookingNumber} is not active. Open the booking form and use the ID shown there.`);
    return;
  }
  try {
    const intake = await ingestBookingCnic({
      agencyId: data.agencyId, draftId: draft.id, side: command.side, bytes: new Uint8Array(await readFile(data.media.path)),
      mimeType: data.media.mimeType, originalName: data.media.fileName, sourceMessageId: data.messageId,
    });
    const status = intake[command.side]?.ocrStatus;
    await reply(`${command.side === "front" ? "Front" : "Back"} CNIC received for booking #${command.bookingNumber}.${status === "complete" ? " Both sides were analyzed together and OCR is ready for review." : status === "waiting_for_pair" ? " Send the other side to start OCR." : " The image is saved; OCR needs attention."}`);
  } catch {
    await reply(`Could not process the ${command.side} CNIC for booking #${command.bookingNumber}. Check the image and try again.`);
  }
}
