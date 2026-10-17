import { getApiRequestContext } from "@/server/auth/session";
import { apiFailure, apiSuccess } from "@/server/api/response";
import { listActivity } from "@/server/services/activity-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let requestId: string | undefined;
  try {
    const context = await getApiRequestContext(request); requestId = context.requestId;
    const params = new URL(request.url).searchParams;
    const rawLimit = params.get("limit");
    return apiSuccess(await listActivity(context, params.get("before") ?? undefined, rawLimit === null ? 30 : Number(rawLimit)), requestId);
  } catch (error) { return apiFailure(error, requestId); }
}
