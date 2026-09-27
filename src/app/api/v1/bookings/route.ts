import { getApiRequestContext } from "@/server/auth/session";
import { apiFailure, apiSuccess, parseJsonRequest } from "@/server/api/response";
import { confirmBooking, listBookings } from "@/server/services/booking-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let requestId: string | undefined;
  try { const context = await getApiRequestContext(request); requestId = context.requestId; return apiSuccess(listBookings(context), requestId); }
  catch (error) { return apiFailure(error, requestId); }
}

export async function POST(request: Request) {
  let requestId: string | undefined;
  try { const context = await getApiRequestContext(request); requestId = context.requestId; return apiSuccess(confirmBooking(context, await parseJsonRequest(request)), requestId, { status: 201 }); }
  catch (error) { return apiFailure(error, requestId); }
}
