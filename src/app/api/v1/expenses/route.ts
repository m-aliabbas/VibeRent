import { apiHandler } from "@/server/api/route";
import { parseJsonRequest } from "@/server/api/response";
import { requestedDeliveryMode } from "@/server/api/delivery";
import { notices, withNotices } from "@/server/notifications/notices";
import { createExpense, listExpenses } from "@/server/services/expense-service";

export const runtime = "nodejs";

export const GET = apiHandler(({ context }) => listExpenses(context));

export const POST = apiHandler(async ({ request, context }) => {
  const mode = requestedDeliveryMode(request);
  const input = await parseJsonRequest(request);
  return withNotices(() => createExpense(context, input), async data => ({ notificationDelivery: await notices.expense(context, mode, data) }));
}, { status: 201, revalidate: true });
