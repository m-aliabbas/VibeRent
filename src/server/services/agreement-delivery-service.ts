import "server-only";

import { randomUUID } from "node:crypto";
import { execute, queryOne } from "@/db/query";
import type { RequestContext } from "@/server/context/request-context";
import { createRentalAgreementPdf } from "@/server/documents/rental-agreement";
import { ensureWhatsAppRuntimeForDelivery } from "@/server/services/whatsapp-settings-service";
import { sendWhatsAppDocument } from "@/server/whatsapp/runtime-registry";

export type AgreementDeliveryResult = {
  status: "sent" | "skipped" | "failed";
  message: string;
};

export async function deliverRentalAgreement(context: RequestContext, bookingId: string): Promise<AgreementDeliveryResult> {
  const booking = await queryOne<{ publicNumber: number | null; renterSkipped: number }>("SELECT public_number AS publicNumber,renter_skipped AS renterSkipped FROM bookings WHERE agency_id=? AND id=? LIMIT 1",[context.agencyId, bookingId]);
  if (!booking) return { status: "failed", message: "The rental agreement could not be found." };
  if (booking.renterSkipped) return { status: "skipped", message: "Agreement delivery was skipped because this with-driver booking has no renter contact." };
  try {
    const agreement = await createRentalAgreementPdf(context, bookingId);
    if (!agreement.customerPhone.trim()) return { status: "skipped", message: "Agreement delivery was skipped because the customer has no phone number." };
    await ensureWhatsAppRuntimeForDelivery(context.agencyId);
    const sent = await sendWhatsAppDocument(context.agencyId, agreement.customerPhone, {
      document: agreement.bytes,
      mimeType: "application/pdf",
      fileName: agreement.fileName,
      caption: `Rental agreement #${booking.publicNumber ?? bookingId}`,
    });
    await audit(context, bookingId, "booking.agreement_sent", { messageId: sent.id, publicNumber: booking.publicNumber });
    return { status: "sent", message: "Rental agreement PDF sent to the customer on WhatsApp." };
  } catch (error) {
    console.error(JSON.stringify({ event: "booking.agreement_delivery_failed", bookingId, agencyId: context.agencyId, message: error instanceof Error ? error.message : "unknown" }));
    await audit(context, bookingId, "booking.agreement_delivery_failed", { reason: safeReason(error) });
    return { status: "failed", message: "Booking confirmed, but the agreement could not be sent. Check the WhatsApp connection and retry from the booking." };
  }
}

function audit(context: RequestContext, bookingId: string, action: string, metadata: Record<string, unknown>) {
  return execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",[`aud_${randomUUID()}`, context.agencyId, context.userId, action, "booking", bookingId, JSON.stringify(metadata), new Date().toISOString()]);
}

function safeReason(error: unknown) {
  const message = error instanceof Error ? error.message : "unknown";
  if (message.includes("not connected")) return "whatsapp_not_connected";
  if (message.includes("not registered")) return "recipient_not_registered";
  return "delivery_failed";
}
