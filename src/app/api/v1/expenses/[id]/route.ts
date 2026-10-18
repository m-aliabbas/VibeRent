import { apiHandler, findOr404, readJsonObject } from "@/server/api/route";
import { listExpenses, updateExpense } from "@/server/services/expense-service";

export const runtime = "nodejs";

export const GET = apiHandler<{ id: string }>(async ({ context, params }) => findOr404(await listExpenses(context), params.id, "Expense"));

/** Partial update. Editing an approved expense reverses it and returns the replacement with `replacesExpenseId`. */
export const PATCH = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  const current = findOr404(await listExpenses(context), params.id, "Expense");
  const changes = await readJsonObject(request);
  const merged = {
    vehicleId: current.vehicleId ?? undefined, bookingId: current.bookingId ?? undefined, customerId: current.customerId ?? undefined,
    ownerId: current.ownerId ?? undefined, amount: current.amount, category: current.category, description: current.description,
    occurredOn: current.occurredOn, ...changes,
  };
  return updateExpense(context, params.id, merged);
}, { revalidate: true });
