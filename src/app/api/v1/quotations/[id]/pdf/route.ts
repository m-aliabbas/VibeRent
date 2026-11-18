import { getApiRequestContext } from "@/server/auth/session";
import { apiFailure } from "@/server/api/response";
import { renderQuotationPdf } from "@/server/services/quotation-service";

export const runtime = "nodejs";

/** The quotation PDF, for download or sharing from the phone. */
export async function GET(request: Request, route: { params: Promise<{ id: string }> }) {
  let requestId: string | undefined;
  try {
    const context = await getApiRequestContext(request); requestId = context.requestId;
    const { id } = await route.params;
    const { bytes, fileName, quote } = await renderQuotationPdf(context, id);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Share-Caption": encodeURIComponent(`Quotation ${quote.reference}`),
        "X-Request-Id": context.requestId,
      },
    });
  } catch (error) { return apiFailure(error, requestId); }
}
