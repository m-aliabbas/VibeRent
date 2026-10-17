import { getApiRequestContext } from "@/server/auth/session";
import { apiFailure, apiSuccess } from "@/server/api/response";
import { getBooking } from "@/server/services/booking-service";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  let requestId: string | undefined;
  try { const auth = await getApiRequestContext(request); requestId = auth.requestId; const { id } = await context.params; return apiSuccess(await getBooking(auth, id), requestId); }
  catch (error) { return apiFailure(error, requestId); }
}
