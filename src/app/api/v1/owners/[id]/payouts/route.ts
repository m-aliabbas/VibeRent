import { apiHandler, readJsonObject } from "@/server/api/route";
import { requestedDeliveryMode } from "@/server/api/delivery";
import { notices, withNotices } from "@/server/notifications/notices";
import { recordOwnerPayout } from "@/server/services/owner-service";

export const runtime = "nodejs";

type PayoutInput = Parameters<typeof recordOwnerPayout>[2];

export const POST = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  const mode = requestedDeliveryMode(request);
  const input = await readJsonObject(request) as PayoutInput;
  return withNotices(() => recordOwnerPayout(context, params.id, input), async () => ({ notificationDelivery: await notices.payout(context, mode, params.id, input) }));
}, { status: 201, revalidate: true });
