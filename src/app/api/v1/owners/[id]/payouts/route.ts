import { apiHandler, readJsonObject } from "@/server/api/route";
import { recordOwnerPayout } from "@/server/services/owner-service";
import { deliverOwnerPayoutInvoice } from "@/server/services/notification-delivery-service";

export const runtime = "nodejs";

type PayoutInput = Parameters<typeof recordOwnerPayout>[2];

export const POST = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  const input = await readJsonObject(request) as PayoutInput;
  const data = await recordOwnerPayout(context, params.id, input);
  return { ...data, notificationDelivery: await deliverOwnerPayoutInvoice(context, params.id, input) };
}, { status: 201, revalidate: true });
