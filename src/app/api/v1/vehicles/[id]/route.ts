import { getApiRequestContext } from "@/server/auth/session";
import { apiFailure, apiSuccess, parseJsonRequest } from "@/server/api/response";
import { getVehicle, saveVehicle } from "@/server/services/vehicle-service";

export const runtime = "nodejs";

type VehicleRouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: VehicleRouteContext) {
  let requestId: string | undefined;
  try { const auth = await getApiRequestContext(request); requestId = auth.requestId; const { id } = await context.params; return apiSuccess(getVehicle(auth, id), requestId); }
  catch (error) { return apiFailure(error, requestId); }
}

export async function PATCH(request: Request, context: VehicleRouteContext) {
  let requestId: string | undefined;
  try {
    const auth = await getApiRequestContext(request); requestId = auth.requestId;
    const { id } = await context.params;
    const current = getVehicle(auth, id);
    const changes = await parseJsonRequest(request);
    const input = changes && typeof changes === "object" ? { ...current, ...changes, id } : changes;
    return apiSuccess(saveVehicle(auth, input), requestId);
  }
  catch (error) { return apiFailure(error, requestId); }
}
