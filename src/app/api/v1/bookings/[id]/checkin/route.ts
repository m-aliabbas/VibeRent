import { apiHandler } from "@/server/api/route";
import { parseJsonRequest } from "@/server/api/response";
import { requestedDeliveryMode } from "@/server/api/delivery";
import { notices, withNotices } from "@/server/notifications/notices";
import { checkInRental } from "@/server/services/booking-service";

export const runtime = "nodejs";

export const POST = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  const mode = requestedDeliveryMode(request);
  const input = await parseJsonRequest(request);
  return withNotices(() => checkInRental(context, params.id, input), async () => ({ notificationDelivery: await notices.checkin(context, mode, params.id) }));
}, { revalidate: true });
