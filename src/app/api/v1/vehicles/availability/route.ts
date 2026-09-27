import { getApiRequestContext } from "@/server/auth/session";
import { apiFailure, apiSuccess } from "@/server/api/response";
import { listAvailableVehicles } from "@/server/services/vehicle-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let requestId: string | undefined;
  try {
    const context = await getApiRequestContext(request); requestId = context.requestId;
    const params = new URL(request.url).searchParams;
    return apiSuccess(listAvailableVehicles(context, params.get("pickupAt") ?? "", params.get("returnAt") ?? ""), requestId);
  } catch (error) { return apiFailure(error, requestId); }
}
