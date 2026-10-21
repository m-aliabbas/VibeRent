import { apiHandler, readJsonObject } from "@/server/api/route";
import { markBookingErroneous } from "@/server/services/booking-service";

export const runtime = "nodejs";

export const POST = apiHandler<{ id: string }>(async ({ request, context, params }) =>
  markBookingErroneous(context, params.id, await readJsonObject(request)), { revalidate: true });
