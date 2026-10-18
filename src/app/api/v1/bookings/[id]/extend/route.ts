import { apiHandler, readJsonObject } from "@/server/api/route";
import { extendRental } from "@/server/services/booking-service";

export const runtime = "nodejs";

export const POST = apiHandler<{ id: string }>(async ({ request, context, params }) =>
  extendRental(context, params.id, await readJsonObject(request)), { revalidate: true });
