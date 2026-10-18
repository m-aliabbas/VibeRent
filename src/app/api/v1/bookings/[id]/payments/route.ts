import { apiHandler } from "@/server/api/route";
import { parseJsonRequest } from "@/server/api/response";
import { recordBookingPayment } from "@/server/services/booking-service";
import { deliverPaymentInvoice } from "@/server/services/notification-delivery-service";
import { parseRecordPaymentInput } from "@/server/validation/booking";

export const runtime = "nodejs";

export const POST = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  const input = parseRecordPaymentInput(await parseJsonRequest(request));
  const data = await recordBookingPayment(context, params.id, input);
  const notificationDelivery = await deliverPaymentInvoice(context, params.id, { ...input, receiptNumber: data.paymentReceiptNumber });
  return { ...data, notificationDelivery };
}, { revalidate: true });
