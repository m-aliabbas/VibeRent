import { apiHandler } from "@/server/api/route";
import { parseJsonRequest } from "@/server/api/response";
import { requestedDeliveryMode } from "@/server/api/delivery";
import { notices, withNotices } from "@/server/notifications/notices";
import { recordBookingPayment } from "@/server/services/booking-service";
import { parseRecordPaymentInput } from "@/server/validation/booking";

export const runtime = "nodejs";

export const POST = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  const mode = requestedDeliveryMode(request);
  const input = parseRecordPaymentInput(await parseJsonRequest(request));
  return withNotices(() => recordBookingPayment(context, params.id, input), async data => ({
    notificationDelivery: await notices.payment(context, mode, params.id, { amount: input.amount, method: input.method, reference: input.reference, receiptNumber: data.paymentReceiptNumber }),
  }));
}, { revalidate: true });
