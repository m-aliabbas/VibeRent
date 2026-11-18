import { apiHandler } from "@/server/api/route";
import { requestedDeliveryMode } from "@/server/api/delivery";
import { notices, withNotices } from "@/server/notifications/notices";
import { getQuotation, setQuotationStatus } from "@/server/services/quotation-service";

export const runtime = "nodejs";

/** Queues the quotation PDF to the customer's WhatsApp and marks a draft quote as sent. */
export const POST = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  const mode = requestedDeliveryMode(request);
  return withNotices(async () => {
    const current = await getQuotation(context, params.id);
    return { quote: current.status === "draft" || current.status === "expired" ? await setQuotationStatus(context, params.id, "sent") : current };
  }, async () => ({ notificationDelivery: await notices.quotation(context, mode, params.id) }));
}, { revalidate: true });
