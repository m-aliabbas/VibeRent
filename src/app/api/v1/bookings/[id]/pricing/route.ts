import { apiHandler, readJsonObject } from "@/server/api/route";
import { updateBookingPricing } from "@/server/services/booking-service";

export const runtime = "nodejs";

/** Negotiated price change. Body: `{ dailyRate?, extras?, discount?, depositRequired?, reason?, version? }` (whole PKR). */
export const PUT = apiHandler<{ id: string }>(async ({ request, context, params }) =>
  updateBookingPricing(context, params.id, await readJsonObject(request)), { revalidate: true });
