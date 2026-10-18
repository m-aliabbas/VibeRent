import { apiHandler, readJsonObject, requireString } from "@/server/api/route";
import { transitionExpense } from "@/server/services/expense-service";
import type { ExpenseStatus } from "@/server/validation/expense";

export const runtime = "nodejs";

export const POST = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  const body = await readJsonObject(request);
  return transitionExpense(context, params.id, requireString(body.status, "status", "Choose the new expense status.") as ExpenseStatus);
}, { revalidate: true });
