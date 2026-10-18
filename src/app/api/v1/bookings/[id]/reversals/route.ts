import { apiHandler, readJsonObject } from "@/server/api/route";
import { reverseBookingTransaction } from "@/server/services/booking-service";

export const runtime = "nodejs";

export const POST = apiHandler<{ id: string }>(async ({ request, context, params }) =>
  reverseBookingTransaction(context, params.id, await readJsonObject(request)), { revalidate: true });
