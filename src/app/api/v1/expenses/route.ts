import { apiHandler } from "@/server/api/route";
import { parseJsonRequest } from "@/server/api/response";
import { deliverInBackground, requestedDeliveryMode } from "@/server/api/delivery";
import { createExpense, listExpenses } from "@/server/services/expense-service";
import { deliverOwnerExpenseNotice } from "@/server/services/notification-delivery-service";

export const runtime = "nodejs";

export const GET = apiHandler(({ context }) => listExpenses(context));

export const POST = apiHandler(async ({ request, context }) => {
  const mode = requestedDeliveryMode(request);
  const data = await createExpense(context, await parseJsonRequest(request));
  return { ...data, notificationDelivery: deliverInBackground(mode, "Owner expense notice", () => deliverOwnerExpenseNotice(context, data.id)) };
}, { status: 201, revalidate: true });
