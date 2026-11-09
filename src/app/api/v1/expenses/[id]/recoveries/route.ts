import { apiHandler, readJsonObject } from "@/server/api/route";
import { recordExpenseRecovery } from "@/server/services/expense-service";

export const runtime = "nodejs";

/** Records money returned to the agency against an approved expense. Returns the updated expense. */
export const POST = apiHandler<{ id: string }>(async ({ request, context, params }) => {
  return recordExpenseRecovery(context, params.id, await readJsonObject(request));
}, { revalidate: true });
