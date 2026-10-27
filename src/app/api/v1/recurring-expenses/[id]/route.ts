import { apiHandler, readJsonObject } from "@/server/api/route";
import { updateRecurringExpense } from "@/server/services/recurring-expense-service";

export const runtime = "nodejs";

/** Body: `{ amount, category, description, endOn?, autoApprove, version }`. */
export const PATCH = apiHandler<{ id: string }>(async ({ request, context, params }) =>
  updateRecurringExpense(context, params.id, await readJsonObject(request)), { revalidate: true });
