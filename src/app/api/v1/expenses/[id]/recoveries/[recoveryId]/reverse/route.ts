import { apiHandler } from "@/server/api/route";
import { reverseExpenseRecovery } from "@/server/services/expense-service";

export const runtime = "nodejs";

export const POST = apiHandler<{ id: string; recoveryId: string }>(async ({ context, params }) => {
  return reverseExpenseRecovery(context, params.id, params.recoveryId);
}, { revalidate: true });
