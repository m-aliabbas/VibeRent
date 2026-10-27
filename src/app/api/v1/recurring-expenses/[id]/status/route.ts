import { apiHandler, readJsonObject } from "@/server/api/route";
import { setRecurringExpenseStatus } from "@/server/services/recurring-expense-service";

export const runtime = "nodejs";

/** Body: `{ status: "active" | "paused" | "ended" }`. Returns `{ recurring, posted }`. */
export const POST = apiHandler<{ id: string }>(async ({ request, context, params }) =>
  setRecurringExpenseStatus(context, params.id, (await readJsonObject(request)).status), { revalidate: true });
