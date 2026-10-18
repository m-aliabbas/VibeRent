import { apiHandler, readJsonObject } from "@/server/api/route";
import { cancelBooking } from "@/server/services/booking-service";

export const runtime = "nodejs";

export const POST = apiHandler<{ id: string }>(async ({ request, context, params }) =>
  cancelBooking(context, params.id, await readJsonObject(request)), { revalidate: true });
