import { apiHandler, readJsonObject } from "@/server/api/route";
import { createRecurringExpense, listRecurringExpenses } from "@/server/services/recurring-expense-service";

export const runtime = "nodejs";

export const GET = apiHandler(({ context }) => listRecurringExpenses(context));

/** Body: `{ amount, category, description, startOn, frequency, vehicleId?, ownerId?, endOn?, autoApprove? }`. Returns `{ recurring, posted }`. */
export const POST = apiHandler(async ({ request, context }) =>
  createRecurringExpense(context, await readJsonObject(request)), { status: 201, revalidate: true });
