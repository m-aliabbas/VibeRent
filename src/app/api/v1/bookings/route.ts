import { apiHandler } from "@/server/api/route";
import { parseJsonRequest } from "@/server/api/response";
import { requestedDeliveryMode } from "@/server/api/delivery";
import { notices, withNotices } from "@/server/notifications/notices";
import { confirmBooking, listBookings } from "@/server/services/booking-service";

export const runtime = "nodejs";

export const GET = apiHandler(({ context }) => listBookings(context));

export const POST = apiHandler(async ({ request, context }) => {
  const mode = requestedDeliveryMode(request);
  const input = await parseJsonRequest(request);
  return withNotices(() => confirmBooking(context, input), async data => ({
    agreementDelivery: await notices.agreement(context, mode, data.id),
    checkoutDelivery: data.status === "checked_out" ? await notices.checkout(context, mode, data.id) : undefined,
  }));
}, { status: 201, revalidate: true });
