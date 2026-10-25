import { getApiRequestContext } from "@/server/auth/session";
import { apiFailure } from "@/server/api/response";
import { DomainError } from "@/server/domain/errors";
import { createRentalAgreementPdf } from "@/server/documents/rental-agreement";
import { renderBookingDocument, type BookingDocumentKind } from "@/server/services/notification-delivery-service";

export const runtime = "nodejs";

const kinds = ["agreement", "checkout", "checkin", "statement"] as const;

/**
 * WhatsApp-free document download for the mobile app: the PDF the server would otherwise send on
 * WhatsApp (agreement, checkout receipt, final invoice, payment statement). The phone shares it
 * through its own WhatsApp or saves it. `X-Share-Caption` carries a ready-made message caption.
 */
export async function GET(request: Request, route: { params: Promise<{ id: string; kind: string }> }) {
  let requestId: string | undefined;
  try {
    const context = await getApiRequestContext(request); requestId = context.requestId;
    const { id, kind } = await route.params;
    if (!(kinds as readonly string[]).includes(kind)) throw new DomainError("NOT_FOUND", "Document not found.", 404);
    let document: { bytes: Buffer; fileName: string; caption: string };
    if (kind === "agreement") {
      const agreement = await createRentalAgreementPdf(context, id);
      document = { bytes: agreement.bytes, fileName: agreement.fileName, caption: "Rental agreement" };
    } else {
      const rendered = await renderBookingDocument(context, id, kind as BookingDocumentKind);
      if (!rendered) throw new DomainError("NOT_FOUND", "Booking not found.", 404);
      document = rendered;
    }
    return new Response(new Uint8Array(document.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Share-Caption": encodeURIComponent(document.caption),
        "X-Request-Id": context.requestId,
      },
    });
  } catch (error) { return apiFailure(error, requestId); }
}
