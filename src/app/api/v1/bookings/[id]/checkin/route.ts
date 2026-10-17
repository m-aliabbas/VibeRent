import { getApiRequestContext } from "@/server/auth/session";
import { apiFailure, apiSuccess, parseJsonRequest } from "@/server/api/response";
import { checkInRental } from "@/server/services/booking-service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let requestId: string | undefined;
  try { const auth = await getApiRequestContext(request); requestId = auth.requestId; const { id } = await context.params; return apiSuccess(await checkInRental(auth, id, await parseJsonRequest(request)), requestId); }
  catch (error) { return apiFailure(error, requestId); }
}
