import { apiHandler } from "@/server/api/route";
import { getExpenseWorkspace } from "@/server/services/expense-service";

export const runtime = "nodejs";

/** Expenses plus the vehicle, booking, customer, owner, and category pickers used by the expense form. */
export const GET = apiHandler(({ context }) => getExpenseWorkspace(context));
