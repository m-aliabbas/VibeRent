import { apiHandler } from "@/server/api/route";
import { parseJsonRequest } from "@/server/api/response";
import { checkInRental } from "@/server/services/booking-service";
import { deliverCheckinInvoice } from "@/server/services/notification-delivery-service";

export const runtime = "nodejs";

export const POST = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  const data = await checkInRental(context, params.id, await parseJsonRequest(request));
  return { ...data, notificationDelivery: await deliverCheckinInvoice(context, params.id) };
}, { revalidate: true });
