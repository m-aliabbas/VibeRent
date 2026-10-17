import { getApiRequestContext } from "@/server/auth/session";
import { apiFailure, apiSuccess } from "@/server/api/response";
import { getTodaysOperations } from "@/server/services/operations-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let requestId: string | undefined;
  try { const context = await getApiRequestContext(request); requestId = context.requestId; const date = new URL(request.url).searchParams.get("date") ?? undefined; return apiSuccess(await getTodaysOperations(context, date), requestId); }
  catch (error) { return apiFailure(error, requestId); }
}
