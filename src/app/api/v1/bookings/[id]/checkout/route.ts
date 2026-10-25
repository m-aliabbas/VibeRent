import { apiHandler } from "@/server/api/route";
import { parseJsonRequest } from "@/server/api/response";
import { deliverInBackground, requestedDeliveryMode } from "@/server/api/delivery";
import { checkOutRental } from "@/server/services/booking-service";
import { deliverCheckoutNotice } from "@/server/services/notification-delivery-service";

export const runtime = "nodejs";

export const POST = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  const mode = requestedDeliveryMode(request);
  const data = await checkOutRental(context, params.id, await parseJsonRequest(request));
  return { ...data, notificationDelivery: deliverInBackground(mode, "Checkout receipt", () => deliverCheckoutNotice(context, params.id)) };
}, { revalidate: true });
