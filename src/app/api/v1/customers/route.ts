import { getApiRequestContext } from "@/server/auth/session";
import { apiFailure, apiSuccess, parseJsonRequest } from "@/server/api/response";
import { createCustomer, listCustomers } from "@/server/services/customer-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let requestId: string | undefined;
  try { const context = await getApiRequestContext(request); requestId = context.requestId; return apiSuccess(await listCustomers(context), requestId); }
  catch (error) { return apiFailure(error, requestId); }
}

export async function POST(request: Request) {
  let requestId: string | undefined;
  try { const context = await getApiRequestContext(request); requestId = context.requestId; return apiSuccess(await createCustomer(context, await parseJsonRequest(request)), requestId, { status: 201 }); }
  catch (error) { return apiFailure(error, requestId); }
}
