import { apiHandler, readJsonObject } from "@/server/api/route";
import { editBookingAmounts } from "@/server/services/booking-service";

export const runtime = "nodejs";

/** Corrects a booking's Total and Paid amounts (same rules as the web "Edit amounts" dialog). Body: `{ total, paid, reason, version }`. */
export const PUT = apiHandler<{ id: string }>(async ({ request, context, params }) =>
  editBookingAmounts(context, params.id, await readJsonObject(request)), { revalidate: true });
