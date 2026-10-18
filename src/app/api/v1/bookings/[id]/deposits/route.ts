import { apiHandler, readJsonObject } from "@/server/api/route";
import { recordBookingDeposit } from "@/server/services/booking-service";

export const runtime = "nodejs";

export const POST = apiHandler<{ id: string }>(async ({ request, context, params }) =>
  recordBookingDeposit(context, params.id, await readJsonObject(request)), { revalidate: true });
