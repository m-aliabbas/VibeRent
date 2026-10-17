import { getApiRequestContext } from "@/server/auth/session";
import { apiFailure, apiSuccess } from "@/server/api/response";
import { getCustomer } from "@/server/services/customer-service";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  let requestId: string | undefined;
  try { const auth = await getApiRequestContext(request); requestId = auth.requestId; const { id } = await context.params; return apiSuccess(await getCustomer(auth, id), requestId); }
  catch (error) { return apiFailure(error, requestId); }
}
