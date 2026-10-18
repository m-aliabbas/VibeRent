import { apiHandler } from "@/server/api/route";
import { parseJsonRequest } from "@/server/api/response";
import { confirmBooking, listBookings } from "@/server/services/booking-service";
import { deliverRentalAgreement } from "@/server/services/agreement-delivery-service";
import { deliverCheckoutNotice } from "@/server/services/notification-delivery-service";

export const runtime = "nodejs";

export const GET = apiHandler(({ context }) => listBookings(context));

export const POST = apiHandler(async ({ request, context }) => {
  const data = await confirmBooking(context, await parseJsonRequest(request));
  const agreementDelivery = await deliverRentalAgreement(context, data.id);
  const checkoutDelivery = data.status === "checked_out" ? await deliverCheckoutNotice(context, data.id) : undefined;
  return { ...data, agreementDelivery, checkoutDelivery };
}, { status: 201, revalidate: true });
